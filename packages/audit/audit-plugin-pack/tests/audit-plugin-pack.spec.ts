/** Audit plugin pack: reading an unpacked audit-plugins release and mounting its toolkit rows. */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Group from '@deepseek-ai/cordis-plugin-group'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { afterEach, describe, expect, it } from 'vitest'
import AuditPluginPack, { PACK_DIR_NAME, PluginPackError, readPluginPack, resolve } from '../src/index.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function tempDir(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-audit-plugin-pack-'))
  roots.push(root)
  return root
}

const MANIFEST = {
  name: 'audit-dsh',
  version: '2.65.1',
  type: 'module',
  dsh: { bundle: { patch: './dsh/cordis.patch.yml' } },
  exports: { '.': './dsh/index.js' },
}

/** The bundle patch layout an audit-plugins release generates, reduced to one reader row. */
const PATCH = `
- insert:
    - id: "audit-preset"
      name: "@deepseek-ai/dsh-agent-preset"
      config:
        id: "audit"
        plugins:
          - id: "persona"
            name: "@deepseek-ai/dsh-persona"
          - id: "audit-toolkit"
            name: "cordis:group"
            group: true
            isolate:
              auditDsh: true
            config:
              - id: "audit-dsh-plugin"
                name: "audit-dsh"
              - id: "audit-reader"
                name: "cordis:reader"
                inject:
                  - "auditDsh"
                config:
                  uv: !!js "ctx.auditDsh.uv"
`

const HOST_PLUGIN = [
  'export const name = "audit-dsh"',
  'export function apply(ctx) { ctx.provide("auditDsh", { uv: "/opt/uv" }) }',
  '',
].join('\n')

/** Write a pack directory holding the given manifest, patch, and Host plugin. */
async function pack(manifest: unknown = MANIFEST, patch: string = PATCH): Promise<string> {
  const root = await tempDir()
  await mkdir(join(root, 'dsh'))
  await writeFile(join(root, 'package.json'), typeof manifest === 'string' ? manifest : JSON.stringify(manifest))
  await writeFile(join(root, 'dsh', 'cordis.patch.yml'), patch)
  await writeFile(join(root, 'dsh', 'index.js'), HOST_PLUGIN)
  return root
}

describe('readPluginPack', () => {
  it('reports a directory that does not exist as missing', async () => {
    const root = join(await tempDir(), 'absent')
    expect(await readPluginPack(root)).toEqual({ kind: 'missing', root })
  })

  it('returns the toolkit group with the pack package rows pointing at its main export', async () => {
    const root = await pack()
    const result = await readPluginPack(root)
    expect(result).toMatchObject({
      kind: 'loaded', root, name: 'audit-dsh', version: '2.65.1', mainUrl: pathToFileURL(join(root, 'dsh', 'index.js')).href, workbench: undefined,
    })
    if (result.kind !== 'loaded') throw new Error('expected a loaded pack')
    const [toolkit] = result.entries
    expect(toolkit).toMatchObject({ id: 'audit-toolkit', name: 'cordis:group', isolate: { auditDsh: true } })
    expect(toolkit?.config).toEqual([
      { id: 'audit-dsh-plugin', name: pathToFileURL(join(root, 'dsh', 'index.js')).href },
      { id: 'audit-reader', name: 'cordis:reader', inject: ['auditDsh'], config: { uv: { __jsExpr: 'ctx.auditDsh.uv' } } },
    ])
  })

  it('resolves the workbench manifest path the pack declares', async () => {
    const root = await pack({ ...MANIFEST, dsh: { ...MANIFEST.dsh, auditWorkbench: './dsh/workbench.json' } })
    expect(await readPluginPack(root)).toMatchObject({ workbench: join(root, 'dsh', 'workbench.json') })
  })

  it('finds a preset row that the patch lists without insert and keeps non-row group items', async () => {
    const patch = `
- id: "other"
  name: "@deepseek-ai/dsh-agent-preset"
  config: { id: "standard", plugins: [] }
- id: "audit-preset"
  name: "@deepseek-ai/dsh-agent-preset"
  config:
    id: "audit"
    plugins:
      - id: "audit-toolkit"
        name: "audit-dsh"
        config: ["literal"]
`
    const result = await readPluginPack(await pack(MANIFEST, patch))
    if (result.kind !== 'loaded') throw new Error('expected a loaded pack')
    expect(result.entries[0]?.config).toEqual(['literal'])
    expect(result.entries[0]?.name).toMatch(/^file:/)
  })

  it.each([
    ['a directory without package.json', async () => {
      const root = await tempDir()
      return root
    }, /no package\.json/],
    ['a path under a file', async () => {
      const root = await tempDir()
      await writeFile(join(root, 'file'), '')
      return join(root, 'file', 'pack')
    }, /no package\.json/],
    ['a manifest that is not JSON', () => pack('{'), /not valid JSON/],
    ['a manifest that is not an object', () => pack('[]'), /must declare/],
    ['a manifest without the bundle patch', () => pack({ ...MANIFEST, dsh: {} }), /must declare/],
    ['a manifest without exports', () => pack({ ...MANIFEST, exports: 'x' }), /must declare/],
    ['a workbench manifest path that is not a string', () => pack({ ...MANIFEST, dsh: { ...MANIFEST.dsh, auditWorkbench: 1 } }), /dsh\.auditWorkbench must be a path string/],
    ['a patch that does not parse', () => pack(MANIFEST, '- [unclosed'), /cannot read the bundle patch/],
    ['a patch that is not a list', () => pack(MANIFEST, 'id: x\n'), /not a list/],
    ['a patch without the audit preset', () => pack(MANIFEST, '- insert:\n    - id: x\n      name: y\n'), /declares no "audit" agent preset/],
    ['a preset without the toolkit', () => pack(MANIFEST, '- id: p\n  name: "@deepseek-ai/dsh-agent-preset"\n  config: { id: audit }\n'), /no "audit-toolkit" row/],
  ])('rejects %s', async (_label, make, message) => {
    const root = await make()
    const error = await readPluginPack(root).then(() => undefined, (caught: unknown) => caught)
    expect(error).toBeInstanceOf(PluginPackError)
    expect(error).toMatchObject({ root })
    expect((error as PluginPackError).message).toMatch(message)
  })
})

describe('resolve', () => {
  it('defaults to audit-plugins under the Harness home', () => {
    expect(resolve({}, { DSH_HOME: '/data/audit-home' })).toEqual({ root: join('/data/audit-home', PACK_DIR_NAME) })
  })

  it('expands a home-relative root and rejects a relative one', () => {
    expect(resolve({ root: '~/packs/audit' })).toEqual({ root: join(homedir(), 'packs', 'audit') })
    expect(() => resolve({ root: 'packs/audit' })).toThrow(/must be absolute/)
  })
})

describe('AuditPluginPack', () => {
  /** Boot a loader with the plugin and a reader row builtin, run the body, then dispose. */
  async function withLoader(body: (ctx: Context) => Promise<void>): Promise<void> {
    const ctx = new Context()
    try {
      await ctx.plugin(Loader)
      ctx.loader.builtins['group'] = Group
      ctx.loader.builtins['audit-plugin-pack'] = AuditPluginPack
      ctx.loader.builtins['reader'] = {
        name: 'reader',
        apply: (child: Context, config: { uv: string }) => { child.root.provide('readerUv', config.uv) },
      }
      await body(ctx)
    } finally {
      await ctx.fiber.dispose()
    }
  }

  it('mounts the toolkit rows so they resolve expressions against the pack Host plugin', async () => {
    const root = await pack()
    await withLoader(async (ctx) => {
      const id = await ctx.loader.create({ name: 'cordis:audit-plugin-pack', config: { root } })
      await ctx.loader.await()
      expect(ctx.get('readerUv')).toBe('/opt/uv')
      const ids = [...ctx.loader.entries()].map(entry => entry.options.id)
      expect(ids).toEqual(expect.arrayContaining(['audit-toolkit', 'audit-dsh-plugin', 'audit-reader']))
      ctx.loader.remove(id)
      await ctx.loader.await()
      expect([...ctx.loader.entries()].map(entry => entry.options.id)).not.toContain('audit-toolkit')
    })
  })

  it('refuses to mount outside a loader row', async () => {
    const ctx = new Context()
    try {
      const fiber = ctx.plugin(AuditPluginPack, {})
      await expect(fiber).rejects.toThrow(/mount this plugin as a loader row/)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('mounts nothing when the pack directory is missing', async () => {
    const root = join(await tempDir(), 'absent')
    await withLoader(async (ctx) => {
      await ctx.loader.create({ name: 'cordis:audit-plugin-pack', config: { root } })
      await ctx.loader.await()
      expect([...ctx.loader.entries()].map(entry => entry.options.id)).toHaveLength(1)
    })
  })
})
