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

describe('parseOrgScope', () => {
  it('maps the nodes in preorder and drops empty profit centers', () => {
    expect(parseOrgScope(`﻿${JSON.stringify({ ...ORG_SCOPE, 额外: 1 })}`)).toEqual({ ok: true, scope: {
      origin: { code: 'C001', name: '示例建设有限公司' },
      exportedAt: '2026-11-09 20:40',
      membersTable: '工作区/开工/组织范围/名下编码_C001.xlsx',
      nodes: [
        { code: 'C001', name: '示例建设有限公司', parent: '', unit: '示例建设有限公司', ownership: 'in', source: '组织架构对照表', conflict: '', profitCenters: ['L001'], note: '' },
        { code: 'C002', name: '示例第一分公司', parent: 'C001', unit: '示例建设有限公司', ownership: 'in', source: '', conflict: '', profitCenters: [], note: '' },
        { code: 'C003', name: '示例安装公司', parent: 'C002', unit: '示例安装有限公司', ownership: 'other', source: '报账树', conflict: '报账树归本单位；组织主数据归示例安装有限公司', profitCenters: [], note: '' },
        { code: 'C004', name: '示例停用部门', parent: 'C001', unit: '', ownership: 'unassigned', source: '', conflict: '', profitCenters: [], note: '' },
        { code: 'C005', name: '示例空壳公司', parent: 'C001', unit: '示例建设有限公司', ownership: 'excluded', source: '', conflict: '', profitCenters: [], note: '没有利润中心，不纳入' },
      ],
    } })
  })

  it('reads the starting node parent as empty and absent optional fields as empty', () => {
    const parsed = parseOrgScope(JSON.stringify({ 格式版本: 1, 起点: { 编码: 'C001', 名称: '' }, 导出时间: '', 节点: [{ 编码: 'C001', 名称: '', 上一级编码: 'X', 归属: '名下' }] }))
    expect(parsed).toEqual({ ok: true, scope: { origin: { code: 'C001', name: '' }, exportedAt: '', membersTable: '',
      nodes: [{ code: 'C001', name: '', parent: '', unit: '', ownership: 'in', source: '', conflict: '', profitCenters: [], note: '' }] } })
  })

  it.each([
    ['text that is not JSON', '{', /^not valid JSON/],
    ['a JSON array', '[]', /^expected object|Invalid input/],
    ['another format version', JSON.stringify({ ...ORG_SCOPE, 格式版本: 2 }), /^格式版本: /],
    ['an unknown ownership', withNodes([ROOT_NODE, { ...CHILD_NODE, 归属: '外部' }]), /^节点\.1\.归属: /],
    ['no nodes', withNodes([]), /^节点: /],
    ['a first node other than the starting node', withNodes([CHILD_NODE]), /^节点\.0: the first node is not the starting node/],
    ['a node listed twice', withNodes([ROOT_NODE, CHILD_NODE, CHILD_NODE]), /^节点\.2: node C002 is listed twice/],
    ['a parent after its child', withNodes([ROOT_NODE, { ...CHILD_NODE, 上一级编码: 'C009' }]), /^节点\.1: the parent C009 of node C002 does not precede it/],
  ])('rejects %s', (_label, content, message) => {
    const parsed = parseOrgScope(content)
    expect(parsed.ok).toBe(false)
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
    expect(await readOrgScope(await project('{}'), SCOPE_PATH)).toMatchObject({ kind: 'unreadable', reason: 'shape', message: expect.stringMatching(/^格式版本: /) as string })
  })
})
