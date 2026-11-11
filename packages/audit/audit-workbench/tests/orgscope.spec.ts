/** Organization Scope file reading. */
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseOrgScope, readOrgScope } from '../src/orgscope.ts'
import { ORG_SCOPE } from './fixtures/orgscope.ts'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

async function tempDir(): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-audit-workbench-scope-')))
  roots.push(root)
  return root
}

const SCOPE_PATH = join('工作区', '开工', '组织范围', '组织范围_C001.json')

async function project(content?: string): Promise<string> {
  const root = await tempDir()
  if (content !== undefined) {
    await mkdir(join(root, '工作区', '开工', '组织范围'), { recursive: true })
    await writeFile(join(root, SCOPE_PATH), content)
  }
  return root
}

const withNodes = (nodes: unknown[]) => JSON.stringify({ ...ORG_SCOPE, 节点: nodes })
const [ROOT_NODE, CHILD_NODE] = ORG_SCOPE.节点

const scopeNode = (code: string, parent: string, ownership = 'in') =>
  ({ code, name: '', parent, unit: '', ownership, source: '', conflict: '', profitCenters: [], note: '' })

describe('parseOrgScope', () => {
  it('maps the nodes in file order with every top-level node and drops empty profit centers', () => {
    expect(parseOrgScope(`\uFEFF${JSON.stringify({ ...ORG_SCOPE, 额外: 1 })}`)).toEqual({ ok: true, scope: {
      origin: { code: 'C001', name: '示例建设有限公司' },
      exportedAt: '2026-11-09 20:40',
      membersTable: '名下编码_C001.xlsx',
      nodes: [
        { code: 'C001', name: '示例建设有限公司', parent: '', unit: '示例建设有限公司', ownership: 'in', source: '组织架构对照表', conflict: '', profitCenters: ['L001'], note: '' },
        { code: 'C002', name: '示例第一分公司', parent: 'C001', unit: '示例建设有限公司', ownership: 'in', source: '', conflict: '', profitCenters: [], note: '' },
        { code: 'C003', name: '示例安装公司', parent: 'C002', unit: '示例安装有限公司', ownership: 'other', source: '报账树', conflict: '报账树归本单位；组织主数据归示例安装有限公司', profitCenters: [], note: '' },
        { code: 'C004', name: '示例停用部门', parent: 'C001', unit: '', ownership: 'unassigned', source: '', conflict: '', profitCenters: [], note: '' },
        { code: 'C005', name: '示例空壳公司', parent: 'C001', unit: '示例建设有限公司', ownership: 'excluded', source: '', conflict: '', profitCenters: [], note: '没有利润中心，不纳入' },
        { code: 'C006', name: '示例轨道分公司', parent: '', unit: '示例建设有限公司', ownership: 'in', source: '八局组织主数据模型', conflict: '', profitCenters: [], note: '不在起点组织树下' },
        { code: 'C007', name: '示例封存项目', parent: '', unit: '', ownership: 'unassigned', source: '归不到，按利润中心组接回', conflict: '', profitCenters: [], note: '' },
      ],
      problems: [],
    } })
  })

  it('reads the starting node parent as empty and absent optional fields as empty', () => {
    const parsed = parseOrgScope(JSON.stringify({ 格式版本: 1, 起点: { 编码: 'C001', 名称: '' }, 导出时间: '', 节点: [{ 编码: 'C001', 名称: '', 上一级编码: 'X', 归属: '名下' }] }))
    expect(parsed).toEqual({ ok: true, scope: { origin: { code: 'C001', name: '' }, exportedAt: '', membersTable: '', nodes: [scopeNode('C001', '')], problems: [] } })
  })

  it('leaves out a node that is not in the format or repeats a code, and lifts a node whose parent is not before it', () => {
    const parsed = parseOrgScope(withNodes([
      ROOT_NODE,
      { ...CHILD_NODE, 编码: 'B1', 归属: '外部' },
      { 编码: 'B2', 名称: '', 上一级编码: 'B1', 归属: '名下' },
      'not a node',
      CHILD_NODE,
      { ...CHILD_NODE, 名称: '重复' },
      { 编码: 'B3', 名称: '', 上一级编码: 'B4', 归属: '别家' },
      { 编码: 'B4', 名称: '', 上一级编码: 'B3', 归属: '名下' },
    ]))
    expect(parsed).toMatchObject({ ok: true, scope: {
      nodes: [{ code: 'C001' }, scopeNode('B2', ''), { code: 'C002', parent: 'C001' }, scopeNode('B3', '', 'other'), scopeNode('B4', 'B3')],
      problems: [
        { kind: 'invalid', index: 1, code: 'B1', field: '归属' },
        { kind: 'detached', index: 2, code: 'B2', parent: 'B1' },
        { kind: 'invalid', index: 3, code: '', field: '' },
        { kind: 'duplicate', index: 5, code: 'C002' },
        { kind: 'detached', index: 6, code: 'B3', parent: 'B4' },
      ],
    } })
  })

  it.each([
    ['text that is not JSON', '{', 'json', /JSON/],
    ['a JSON array', '[]', 'shape', /^$/],
    ['another format version', JSON.stringify({ ...ORG_SCOPE, 格式版本: 2 }), 'shape', /^格式版本$/],
    ['a starting node without a code', JSON.stringify({ ...ORG_SCOPE, 起点: { 名称: '' } }), 'shape', /^起点\.编码$/],
    ['no nodes', withNodes([]), 'shape', /^节点$/],
    ['a first node not in the format', withNodes([{ ...ROOT_NODE, 归属: '外部' }]), 'shape', /^节点\.0\.归属$/],
    ['a first node other than the starting node', withNodes([CHILD_NODE]), 'origin', /^C002$/],
  ])('rejects %s', (_label, content, reason, message) => {
    const parsed = parseOrgScope(content)
    expect(parsed).toMatchObject({ ok: false, reason })
    expect(parsed.ok ? '' : parsed.message).toMatch(message)
  })
})

describe('readOrgScope', () => {
  it('reads a recorded file relative to the Project Directory or by its absolute path', async () => {
    const dir = await project(JSON.stringify(ORG_SCOPE))
    expect(await readOrgScope(dir, SCOPE_PATH)).toMatchObject({ kind: 'read', scope: { origin: { code: 'C001' } } })
    expect(await readOrgScope(dir, join(dir, SCOPE_PATH))).toMatchObject({ kind: 'read' })
  })

  it('reads nothing when no file is recorded', async () => {
    expect(await readOrgScope(await project(), '')).toEqual({ kind: 'missing' })
  })

  it('refuses a file outside the Project Directory, also through a link', async () => {
    const dir = await project(JSON.stringify(ORG_SCOPE))
    const outside = await project(JSON.stringify(ORG_SCOPE))
    await symlink(join(outside, SCOPE_PATH), join(dir, 'link.json'))
    for (const recorded of [join(outside, SCOPE_PATH), join('..', outside.split('/').at(-1) ?? '', SCOPE_PATH), 'link.json', '.']) {
      expect(await readOrgScope(dir, recorded)).toEqual({ kind: 'unreadable', reason: 'outside', message: recorded })
    }
  })

  it('separates a file that cannot be read from one that is not JSON or not in the format', async () => {
    expect(await readOrgScope(await project(), SCOPE_PATH)).toMatchObject({ kind: 'unreadable', reason: 'io', message: expect.stringMatching(/ENOENT/) as string })
    const directory = await project()
    await mkdir(join(directory, SCOPE_PATH), { recursive: true })
    expect(await readOrgScope(directory, SCOPE_PATH)).toMatchObject({ kind: 'unreadable', reason: 'io' })
    expect(await readOrgScope(await project('{'), SCOPE_PATH)).toMatchObject({ kind: 'unreadable', reason: 'json' })
    expect(await readOrgScope(await project('{}'), SCOPE_PATH)).toEqual({ kind: 'unreadable', reason: 'shape', message: '格式版本' })
    expect(await readOrgScope(await project(withNodes([CHILD_NODE])), SCOPE_PATH)).toEqual({ kind: 'unreadable', reason: 'origin', message: 'C002' })
  })
})
