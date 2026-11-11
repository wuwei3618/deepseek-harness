/** Project Archive reading. */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ARCHIVE_PATH, readArchive } from '../src/archive.ts'
import { ARCHIVE } from './fixtures/archive.ts'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

async function project(content?: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-audit-workbench-archive-'))
  roots.push(root)
  if (content !== undefined) {
    await mkdir(join(root, '审计方案'))
    await writeFile(join(root, ARCHIVE_PATH), content)
  }
  return root
}

describe('readArchive', () => {
  it('projects the known fields of an archive', async () => {
    expect(await readArchive(await project(`﻿${JSON.stringify(ARCHIVE)}`))).toEqual({ kind: 'read', newer: false, archive: {
      version: 1,
      createdAt: '2026-11-01 09:00', updatedAt: '2026-11-05 18:20',
      auditType: '离任审计（经济责任审计）', specialAudits: ['工程结算专项审计'],
      auditees: [
        { name: '示例建设有限公司', kind: '机构', codes: ['C001'], scopeFile: '工作区/开工/组织范围/组织范围_C001.json' },
        { name: '示例项目部', kind: '业务项目', codes: [], scopeFile: '' },
      ],
      period: { from: '2023-01', to: '2025-12' }, tenure: { from: '2022-06', to: '2025-12' },
      focus: [{ content: '资金管理', section: '资金' }],
      scope: { tablePath: '/p/范围表.xlsx#范围', tableVersion: 'v2', confirmedAt: '2026-11-02 10:00' },
      tasks: [
        { type: '统一日记账取数', taskId: 'J-1', summary: '2023-01 至 2025-12', status: 'done', statusText: '完成',
          outputs: ['/p/底稿/日记账.csv'], startedAt: '2026-11-02 10:10', finishedAt: '2026-11-02 11:00', note: '' },
        { type: '化公为私排查', taskId: 'M-2', summary: '', status: 'unknown', statusText: '暂停', outputs: [],
          startedAt: '', finishedAt: '', note: '' },
      ],
      precheck: { readAt: '2026-11-01 09:30', file: '/p/预检.json' },
      freshness: { readAt: '', file: '' },
      changes: [{ date: '2026-11-05 18:20', what: '加跑化公为私排查', basis: '用户确认' }],
    } })
  })

  it('reads a later Archive Version as newer and empty fields as empty', async () => {
    const read = await readArchive(await project(JSON.stringify({ 档案版本: 2, 被审计单位: 'x', 开工任务: [1, { 状态: 3 }] })))
    expect(read).toMatchObject({ kind: 'read', newer: true, archive: { version: 2, auditees: [], tasks: [{ status: 'unknown', statusText: '' }] } })
    const unversioned = await readArchive(await project(JSON.stringify({ 档案版本: 1.5 })))
    expect(unversioned).toMatchObject({ kind: 'read', newer: false })
    expect(unversioned.kind === 'read' && 'version' in unversioned.archive).toBe(false)
  })

  it('separates a missing archive from one that cannot be read', async () => {
    expect(await readArchive(await project())).toEqual({ kind: 'missing' })
    expect(await readArchive(join(await project(), 'absent'))).toEqual({ kind: 'missing' })
    const directory = await project()
    await mkdir(join(directory, ARCHIVE_PATH), { recursive: true })
    expect(await readArchive(directory)).toEqual({ kind: 'unreadable', reason: 'io' })
    expect(await readArchive(await project('{'))).toEqual({ kind: 'unreadable', reason: 'json' })
    expect(await readArchive(await project('[]'))).toEqual({ kind: 'unreadable', reason: 'shape' })
  })
})
