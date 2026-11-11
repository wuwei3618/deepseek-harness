/** The workbench row: pack rows, launch values, and the Remote methods of its service. */
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Group from '@deepseek-ai/cordis-plugin-group'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuditWorkbench, { resolve, SERVER_ROW, workbenchRows } from '../src/index.ts'
import { ARCHIVE_PATH } from '../src/archive.ts'
import type { ServerLaunch, ToolCallOutcome } from '../src/call.ts'
import type { PromptRequest } from '../src/types.ts'
import { internals } from '../src/internals.ts'
import { ARCHIVE } from './fixtures/archive.ts'
import { ORG_SCOPE } from './fixtures/orgscope.ts'

const roots: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function tempDir(): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-audit-workbench-')))
  roots.push(root)
  return root
}

const PATCH = `
- insert:
    - id: "audit-preset"
      name: "@deepseek-ai/dsh-agent-preset"
      config:
        id: "audit"
        plugins:
          - id: "audit-toolkit"
            name: "cordis:group"
            group: true
            isolate:
              auditDsh: true
            config:
              - id: "audit-dsh-plugin"
                name: "audit-dsh"
              - id: "audit-skill-filesystem"
                name: "@deepseek-ai/dsh-skill-filesystem"
                inject: ["auditDsh"]
                config:
                  customSkillDirs: !!js "ctx.auditDsh.skillDirs"
              - id: "audit-mcp-daudit"
                name: "@deepseek-ai/dsh-mcp-client"
                inject: ["auditDsh"]
                config:
                  serverName: "daudit"
                  transport: "stdio"
                  command: !!js "ctx.auditDsh.uv"
                  args: ["run", "daudit-mcp"]
                  cwd: !!js "ctx.auditDsh.project('daudit-cli')"
                  env:
                    PYTHONUTF8: "1"
                  toolCallTimeoutMs: 2100000
              - id: "audit-mcp-finance"
                name: "@deepseek-ai/dsh-mcp-client"
                config:
                  serverName: "finance"
                  transport: "stdio"
                  command: "/opt/finance"
              - id: "audit-mcp-remote"
                name: "@deepseek-ai/dsh-mcp-client"
                config:
                  serverName: "remote"
                  transport: "streamable-http"
                  url: "http://127.0.0.1:1"
              - "not a row"
`

const HOST_PLUGIN = [
  'export const name = "audit-dsh"',
  'export function apply(ctx) { ctx.provide("auditDsh", { uv: "/opt/uv", skillDirs: [], project: (dir) => "/pack/mcp/" + dir }) }',
  '',
].join('\n')

const MANIFEST = {
  version: 1,
  systems: [
    { id: 'dac', title: '数据中心', description: '取数', server: 'daudit',
      check: { tool: 'check_session', ready: { path: ['valid'], equals: true }, message: ['message'] },
      login: { tool: 'get_session', arguments: { timeout: 240 } } },
    { id: 'tyc', title: '天眼查', server: 'hgws', check: { tool: 'check_session', ready: { path: ['tyc', 'ok'], equals: true } } },
  ],
  models: [{ id: 'private-use', title: '化公为私排查', prompt: '在 {{projectDir}} 对 {{auditees}}（{{periodFrom}} 至 {{periodTo}}）运行{{model}}' }],
  prompts: {
    kickoff: '在 {{projectDir}} 开工',
    backfill: '为 {{projectDir}} 回填项目档案',
    rerun: '重跑 {{taskType}} {{taskId}}（{{taskSummary}}），{{auditType}}',
  },
}

/** Write a pack; `null` leaves out the manifest file or the `dsh.auditWorkbench` field. */
async function pack(manifest: unknown = MANIFEST, workbench: string | null = './dsh/workbench.json'): Promise<string> {
  const root = await tempDir()
  await mkdir(join(root, 'dsh'))
  await writeFile(join(root, 'package.json'), JSON.stringify({
    name: 'audit-dsh', version: '2.70.0',
    dsh: { bundle: { patch: './dsh/cordis.patch.yml' }, ...workbench === null ? {} : { auditWorkbench: workbench } },
    exports: { '.': './dsh/index.js' },
  }))
  await writeFile(join(root, 'dsh', 'cordis.patch.yml'), PATCH)
  await writeFile(join(root, 'dsh', 'index.js'), HOST_PLUGIN)
  if (manifest !== null) await writeFile(join(root, 'dsh', 'workbench.json'), typeof manifest === 'string' ? manifest : JSON.stringify(manifest))
  return root
}

interface FakeWorkspace { id: WorkspaceId; path: string }

async function withWorkbench(root: string, workspaces: FakeWorkspace[], body: (ctx: Context) => Promise<void>): Promise<void> {
  const ctx = new Context()
  try {
    ctx.provide('workspaceRegistry', {
      list: () => workspaces,
      get: (id: WorkspaceId) => workspaces.find(workspace => workspace.id === id),
    })
    await ctx.plugin(Loader)
    // The profile resolves the row name from its manifest; tests resolve it to the source module.
    const original = ctx.loader.import.bind(ctx.loader)
    const server: unknown = await import('../src/server.ts')
    vi.spyOn(ctx.loader, 'import').mockImplementation(async (name, stack) => {
      if (name === SERVER_ROW) return server
      const loaded: unknown = await original(name, stack)
      return loaded
    })
    ctx.loader.builtins['group'] = Group
    ctx.loader.builtins['audit-workbench'] = AuditWorkbench
    await ctx.loader.create({ name: 'cordis:audit-workbench', config: { root } })
    await ctx.loader.await()
    await body(ctx)
  } finally {
    await ctx.fiber.dispose()
  }
}

async function projectDir(archive?: unknown): Promise<string> {
  const root = await tempDir()
  if (archive !== undefined) {
    await mkdir(join(root, '审计方案'))
    await writeFile(join(root, ARCHIVE_PATH), JSON.stringify(archive))
  }
  return root
}

const signal = () => new AbortController().signal
const ws = (id: string, path: string): FakeWorkspace => ({ id: id as WorkspaceId, path })

describe('resolve', () => {
  it('uses the pack row default root and the deadlines', () => {
    expect(resolve({ checkTimeoutMs: 5, loginTimeoutMs: 6 }, { DSH_HOME: '/data/home' })).toEqual({ root: join('/data/home', 'audit-plugins'), checkTimeoutMs: 5, loginTimeoutMs: 6 })
    expect(() => resolve({ root: 'relative', checkTimeoutMs: 5, loginTimeoutMs: 6 })).toThrow(/must be absolute/)
  })
})

describe('workbenchRows', () => {
  it('returns nothing for a toolkit row that is not a group', () => {
    expect(workbenchRows({ kind: 'loaded', root: '/r', name: 'n', version: 'v', mainUrl: 'file:///m', workbench: undefined,
      entries: [{ id: 'audit-toolkit', name: 'audit-dsh' }] })).toEqual([])
  })
})

describe('AuditWorkbench', () => {
  let calls: { launch: ServerLaunch; tool: string; args: unknown; timeoutMs: number }[]
  let answer: (tool: string) => ToolCallOutcome

  beforeEach(() => {
    calls = []
    answer = () => ({ kind: 'result', isError: false, value: { valid: true }, text: '' })
    vi.spyOn(internals, 'callTool').mockImplementation(async (launch, tool, args, timeoutMs) => {
      calls.push({ launch, tool, args, timeoutMs })
      return answer(tool)
    })
  })

  it('resolves stdio launch values through the pack Host plugin without mounting its other rows', async () => {
    await withWorkbench(await pack(), [], async (ctx) => {
      const ids = [...ctx.loader.entries()].map(entry => entry.options.id)
      expect(ids).toEqual(expect.arrayContaining(['audit-workbench-audit-toolkit', 'audit-workbench-audit-dsh-plugin', 'audit-workbench-audit-mcp-daudit']))
      expect(ids).not.toContain('audit-workbench-audit-skill-filesystem')
      expect(ids).not.toContain('audit-workbench-audit-mcp-remote')
      expect(await ctx.auditWorkbench.checkSystem('dac', signal())).toMatchObject({ state: 'ready' })
      expect(calls).toEqual([{
        launch: { serverName: 'daudit', command: '/opt/uv', args: ['run', 'daudit-mcp'], cwd: '/pack/mcp/daudit-cli', env: { PYTHONUTF8: '1' } },
        tool: 'check_session', args: {}, timeoutMs: 120_000,
      }])
    })
  })

  it('refuses a second launch-value row for the same server', async () => {
    await withWorkbench(await pack(), [], async (ctx) => {
      expect(() => ctx.auditWorkbench.registerServer({ serverName: 'daudit', command: 'x', args: [], cwd: undefined, env: {} })).toThrow(/registered twice/)
    })
  })

  it('reports the pack and the manifest', async () => {
    const root = await pack()
    await withWorkbench(root, [], async (ctx) => {
      expect(await ctx.auditWorkbench.overview(signal())).toEqual({
        pack: { kind: 'loaded', root, name: 'audit-dsh', version: '2.70.0', manifest: { kind: 'ready' } },
        systems: [{ id: 'dac', title: '数据中心', description: '取数', login: true }, { id: 'tyc', title: '天眼查', description: '', login: false }],
        models: [{ id: 'private-use', title: '化公为私排查', description: '' }],
        prompts: { kickoff: true, backfill: true, rerun: true },
      })
    })
  })

  it.each([
    ['a pack without a manifest', () => pack(null, null), { kind: 'missing' }],
    ['a manifest that cannot be read', () => pack(null), { kind: 'invalid', message: expect.stringMatching(/^cannot read/) as string }],
    ['a manifest in another format', () => pack({ version: 9 }), { kind: 'invalid', message: expect.stringMatching(/^version/) as string }],
  ])('reports %s without systems or prompts', async (_label, make, manifest) => {
    await withWorkbench(await make(), [], async (ctx) => {
      expect(await ctx.auditWorkbench.overview(signal())).toMatchObject({
        pack: { kind: 'loaded', manifest }, systems: [], models: [], prompts: { kickoff: false, backfill: false, rerun: false },
      })
    })
  })

  it('reports a missing and an unreadable pack directory', async () => {
    const missing = join(await tempDir(), 'absent')
    await withWorkbench(missing, [], async (ctx) => {
      expect((await ctx.auditWorkbench.overview(signal())).pack).toEqual({ kind: 'missing', root: missing })
    })
    const invalid = await tempDir()
    await withWorkbench(invalid, [], async (ctx) => {
      expect((await ctx.auditWorkbench.overview(signal())).pack).toMatchObject({ kind: 'invalid', root: invalid, message: expect.stringMatching(/no package\.json/) as string })
      expect(await ctx.auditWorkbench.checkSystem('dac', signal())).toMatchObject({ state: 'failed', reason: 'unavailable' })
    })
  })

  it('reads the Project Archive of every Workspace', async () => {
    const started = await projectDir(ARCHIVE)
    const fresh = await projectDir()
    await withWorkbench(await pack(), [ws('w1', started), ws('w2', fresh)], async (ctx) => {
      const projects = await ctx.auditWorkbench.projects(signal())
      expect(projects.map(project => [project.workspaceId, project.path, project.read.kind])).toEqual([['w1', started, 'read'], ['w2', fresh, 'missing']])
    })
  })

  it('fills each prompt template from the Workspace and its archive', async () => {
    const started = await projectDir(ARCHIVE)
    const fresh = await projectDir()
    await withWorkbench(await pack(), [ws('w1', started), ws('w2', fresh)], async (ctx) => {
      const workbench = ctx.auditWorkbench
      const w1 = 'w1' as WorkspaceId
      expect(await workbench.prompt({ kind: 'kickoff', workspaceId: 'w2' as WorkspaceId }, signal())).toBe(`在 ${fresh} 开工`)
      expect(await workbench.prompt({ kind: 'backfill', workspaceId: w1 }, signal())).toBe(`为 ${started} 回填项目档案`)
      expect(await workbench.prompt({ kind: 'rerun', workspaceId: w1, task: 0 }, signal())).toBe('重跑 统一日记账取数 J-1（2023-01 至 2025-12），离任审计（经济责任审计）')
      expect(await workbench.prompt({ kind: 'model', workspaceId: w1, model: 'private-use' }, signal()))
        .toBe(`在 ${started} 对 示例建设有限公司、示例项目部（2023-01 至 2025-12）运行化公为私排查`)
      const refused = async (request: PromptRequest) => workbench.prompt(request, signal()).then(() => undefined, (error: unknown) => error)
      expect(await refused({ kind: 'kickoff', workspaceId: 'absent' as WorkspaceId })).toMatchObject({ code: 'auditWorkbench/not-found', details: { what: 'workspace' } })
      expect(await refused({ kind: 'rerun', workspaceId: 'absent' as WorkspaceId, task: 0 })).toMatchObject({ details: { what: 'workspace' } })
      expect(await refused({ kind: 'rerun', workspaceId: 'w2' as WorkspaceId, task: 0 })).toMatchObject({ details: { what: 'archive' } })
      expect(await refused({ kind: 'rerun', workspaceId: w1, task: 5 })).toMatchObject({ details: { what: 'task' } })
      expect(await refused({ kind: 'model', workspaceId: w1, model: 'absent' })).toMatchObject({ details: { what: 'model' } })
    })
    await withWorkbench(await pack({ version: 1 }), [ws('w1', started)], async (ctx) => {
      const workbench = ctx.auditWorkbench
      const refused = async (request: PromptRequest) => workbench.prompt(request, signal()).then(() => undefined, (error: unknown) => error)
      expect(await refused({ kind: 'backfill', workspaceId: 'w1' as WorkspaceId })).toMatchObject({ code: 'auditWorkbench/no-prompt', details: { kind: 'backfill' } })
      expect(await refused({ kind: 'rerun', workspaceId: 'w1' as WorkspaceId, task: 0 })).toMatchObject({ code: 'auditWorkbench/no-prompt', details: { kind: 'rerun' } })
    })
  })

  it('reads the Organization Scope file each Auditee records', async () => {
    const dir = await projectDir(ARCHIVE)
    await mkdir(join(dir, '工作区', '开工', '组织范围'), { recursive: true })
    await writeFile(join(dir, '工作区', '开工', '组织范围', '组织范围_C001.json'), JSON.stringify(ORG_SCOPE))
    await withWorkbench(await pack(), [ws('w1', dir), ws('w2', await projectDir())], async (ctx) => {
      const scope = (workspaceId: string, auditee: number) => ctx.auditWorkbench
        .orgScope({ workspaceId: workspaceId as WorkspaceId, auditee }, signal())
        .then(read => read, (error: unknown) => error)
      expect(await scope('w1', 0)).toMatchObject({ kind: 'read', scope: { origin: { code: 'C001' } } })
      expect(await scope('w1', 1)).toEqual({ kind: 'missing' })
      expect(await scope('w1', 2)).toMatchObject({ code: 'auditWorkbench/not-found', details: { what: 'auditee' } })
      expect(await scope('w2', 0)).toMatchObject({ code: 'auditWorkbench/not-found', details: { what: 'archive' } })
    })
  })

  it('opens the members table beside the Organization Scope file', async () => {
    const dir = await projectDir(ARCHIVE)
    const scopeDir = join(dir, '工作区', '开工', '组织范围')
    await mkdir(scopeDir, { recursive: true })
    await writeFile(join(scopeDir, '名下编码_C001.xlsx'), 'x')
    const writeScope = (membersTable: string) => writeFile(join(scopeDir, '组织范围_C001.json'), JSON.stringify({ ...ORG_SCOPE, 名下编码表: membersTable }))
    const opened: string[] = []
    vi.spyOn(internals, 'openPath').mockImplementation(async (path) => { opened.push(path) })
    await withWorkbench(await pack(), [ws('w1', dir)], async (ctx) => {
      const open = (auditee: number) => ctx.auditWorkbench.openMembersTable({ workspaceId: 'w1' as WorkspaceId, auditee }, signal())
        .then(() => 'opened', (error: unknown) => error)
      await writeScope(ORG_SCOPE.名下编码表)
      expect(await open(0)).toBe('opened')
      expect(opened).toEqual([join(scopeDir, '名下编码_C001.xlsx')])
      expect(await open(1)).toMatchObject({ code: 'auditWorkbench/not-found', details: { what: 'scope' } })
      await writeScope('')
      expect(await open(0)).toMatchObject({ code: 'auditWorkbench/not-found', details: { what: 'scope' } })
      await writeFile(join(dir, '名下编码_C001.xlsx'), 'x')
      await writeScope('../../../名下编码_C001.xlsx')
      expect(await open(0)).toBe('opened')
      expect(opened.at(-1)).toBe(join(dir, '名下编码_C001.xlsx'))
      await writeScope('../../../../outside.xlsx')
      expect(await open(0)).toMatchObject({ code: 'auditWorkbench/output-refused' })
    })
  })

  it('reads the check result through the manifest rule', async () => {
    await withWorkbench(await pack(), [], async (ctx) => {
      const check = (id: string) => ctx.auditWorkbench.checkSystem(id, signal())
      answer = () => ({ kind: 'result', isError: false, value: { valid: false, message: '会话失效' }, text: '' })
      expect(await check('dac')).toMatchObject({ state: 'login-required', message: '会话失效' })
      answer = () => ({ kind: 'result', isError: false, value: { valid: false, message: 3 }, text: '' })
      expect(await check('dac')).toMatchObject({ state: 'login-required', message: '' })
      answer = () => ({ kind: 'result', isError: true, value: { valid: true }, text: 'boom' })
      expect(await check('dac')).toMatchObject({ state: 'failed', reason: 'unreadable', message: 'boom' })
      answer = () => ({ kind: 'result', isError: false, value: ['valid'], text: '' })
      expect(await check('dac')).toMatchObject({ state: 'failed', reason: 'unreadable' })
      answer = () => ({ kind: 'timeout' })
      expect(await check('dac')).toMatchObject({ state: 'failed', reason: 'timeout' })
      answer = () => ({ kind: 'failed', message: 'spawn ENOENT' })
      expect(await check('dac')).toMatchObject({ state: 'failed', reason: 'call-failed', message: 'spawn ENOENT' })
      expect(await check('tyc')).toMatchObject({ state: 'failed', reason: 'unavailable' })
      expect(await check('absent')).toMatchObject({ state: 'failed', reason: 'unavailable' })
    })
  })

  it('reads a rule without a message field as an empty message', async () => {
    const manifest = { version: 1, systems: [{ id: 'dac', title: 'D', server: 'daudit', check: { tool: 'c', ready: { path: ['valid'], equals: true } } }] }
    await withWorkbench(await pack(manifest), [], async (ctx) => {
      answer = () => ({ kind: 'result', isError: false, value: { valid: false, message: 'x' }, text: '' })
      expect(await ctx.auditWorkbench.checkSystem('dac', signal())).toMatchObject({ state: 'login-required', message: '' })
      expect(await ctx.auditWorkbench.login('dac', signal())).toMatchObject({ state: 'failed', reason: 'unavailable' })
    })
  })

  it('runs the login tool with its deadline, then checks again', async () => {
    await withWorkbench(await pack(), [], async (ctx) => {
      expect(await ctx.auditWorkbench.login('dac', signal())).toMatchObject({ state: 'ready' })
      expect(calls.map(call => [call.tool, call.args, call.timeoutMs])).toEqual([['get_session', { timeout: 240 }, 600_000], ['check_session', {}, 120_000]])
      answer = tool => tool === 'get_session' ? { kind: 'timeout' } : { kind: 'result', isError: false, value: { valid: true }, text: '' }
      expect(await ctx.auditWorkbench.login('dac', signal())).toMatchObject({ state: 'failed', reason: 'timeout' })
    })
  })

  it('opens only recorded outputs inside the Project Directory', async () => {
    const dir = await projectDir()
    const outside = await tempDir()
    await mkdir(join(dir, '底稿'))
    await writeFile(join(dir, '底稿', 'a.csv'), 'a')
    await writeFile(join(outside, 'b.csv'), 'b')
    await symlink(join(outside, 'b.csv'), join(dir, '底稿', 'link.csv'))
    await mkdir(join(dir, '审计方案'))
    await writeFile(join(dir, ARCHIVE_PATH), JSON.stringify({ 开工任务: [{ 产物路径: [
      join(dir, '底稿', 'a.csv'), join(outside, 'b.csv'), join(dir, '底稿', 'link.csv'), '底稿/a.csv', join(dir, '底稿', 'gone.csv'),
    ] }] }))
    const opened: string[] = []
    const open = vi.spyOn(internals, 'openPath').mockImplementation(async (path) => { opened.push(path) })
    await withWorkbench(await pack(), [ws('w1', dir)], async (ctx) => {
      const w1 = 'w1' as WorkspaceId
      const attempt = (output: number) => ctx.auditWorkbench.openOutput({ workspaceId: w1, task: 0, output }, signal()).then(() => 'opened', (error: unknown) => error)
      expect(await attempt(0)).toBe('opened')
      expect(opened).toEqual([join(dir, '底稿', 'a.csv')])
      for (const output of [1, 2, 3, 4]) expect(await attempt(output)).toMatchObject({ code: 'auditWorkbench/output-refused' })
      expect(await attempt(9)).toMatchObject({ code: 'auditWorkbench/not-found', details: { what: 'output' } })
      open.mockRejectedValueOnce(new Error('no desktop'))
      expect(await attempt(0)).toMatchObject({ code: 'auditWorkbench/open-failed' })
    })
  })

  it('mounts no pack rows when the pack is missing or unreadable', async () => {
    for (const root of [join(await tempDir(), 'absent'), await tempDir()]) {
      await withWorkbench(root, [], async (ctx) => {
        expect([...ctx.loader.entries()].map(entry => entry.options.id).filter(id => id.startsWith('audit-workbench-'))).toEqual([])
      })
    }
  })

  it('refuses to mount outside a loader row', async () => {
    const ctx = new Context()
    try {
      const fiber = ctx.plugin(AuditWorkbench, { checkTimeoutMs: 1, loginTimeoutMs: 1 })
      await expect(fiber).rejects.toThrow(/mount this plugin as a loader row/)
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
