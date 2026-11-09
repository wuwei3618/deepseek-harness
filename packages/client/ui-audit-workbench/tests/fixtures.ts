/** Made-up workbench reads shared by the workbench page tests. */
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type {
  KickoffTask, ProjectArchive, ProjectEntry, SystemCheck, WorkbenchOverview,
} from '@deepseek-ai/dsh-audit-workbench/types'

/** The first sample Workspace, which holds a full Project Archive. */
export const ALPHA = 'ws-alpha' as WorkspaceId
/** A Workspace without a Project Archive. */
export const BETA = 'ws-beta' as WorkspaceId
/** A Workspace whose Project Archive is not JSON. */
export const GAMMA = 'ws-gamma' as WorkspaceId

/**
 * One Kickoff Task with every field set.
 * @param fields - fields to override.
 * @returns the task.
 */
export function task(fields: Partial<KickoffTask> = {}): KickoffTask {
  return {
    type: '组织范围', taskId: 'T1', summary: '示例公司，名下编码 2 个', status: 'done', statusText: '完成',
    outputs: ['/projects/alpha/工作区/开工/组织范围.xlsx'], startedAt: '2026-11-05 10:03', finishedAt: '2026-11-05 10:20', note: '',
    ...fields,
  }
}

/** A Project Archive with every section filled. */
export const ARCHIVE: ProjectArchive = {
  version: 1,
  createdAt: '2026-11-05 09:58',
  updatedAt: '2026-11-09 14:32',
  auditType: '离任审计',
  specialAudits: ['专项一', '专项二'],
  auditees: [{ name: '示例公司', kind: '机构', codes: ['C001', 'C002'] }, { name: '示例项目部', kind: '', codes: [] }],
  period: { from: '2023-01', to: '2025-06' },
  tenure: { from: '2021-03', to: '' },
  focus: [{ content: '资金管理', section: '财务' }, { content: '工程结算', section: '' }],
  scope: { tablePath: '底稿/范围表.xlsx', tableVersion: '第 2 版', confirmedAt: '2026-11-05 10:20' },
  tasks: [
    task(),
    task({ type: '化公为私排查', taskId: 'T2', status: 'running', statusText: '在跑', outputs: [], finishedAt: '', note: '' }),
    task({ type: '资产清查', taskId: 'T3', status: 'failed', statusText: '失败', outputs: [], note: '数据中心会话过期' }),
    task({ type: '数据鲜度', taskId: 'T4', status: 'pending', statusText: '待做', outputs: [], startedAt: '', finishedAt: '' }),
    task({ type: '云盘盘点', taskId: 'T5', status: 'skipped', statusText: '不做', outputs: [] }),
    task({ type: '其他', taskId: 'T6', status: 'unknown', statusText: '暂停', outputs: [] }),
  ],
  precheck: { readAt: '2026-11-05 10:02', file: '审计方案/会话预检.json' },
  freshness: { readAt: '', file: '' },
  changes: [{ date: '2026-11-05', what: '建档', basis: '开工会议' }, { date: '2026-11-06', what: '确认取数范围', basis: '' }],
}

/** Three Workspaces: a full archive, no archive, and an unreadable one. */
export const PROJECTS: ProjectEntry[] = [
  { workspaceId: ALPHA, path: '/projects/alpha', read: { kind: 'read', newer: false, archive: ARCHIVE } },
  { workspaceId: BETA, path: '/projects/beta', read: { kind: 'missing' } },
  { workspaceId: GAMMA, path: '/projects/gamma', read: { kind: 'unreadable', reason: 'json' } },
]

/** A loaded pack whose manifest is ready, with two systems and two Built-in Models. */
export const OVERVIEW: WorkbenchOverview = {
  pack: { kind: 'loaded', root: '/home/a/audit-plugins', name: 'audit-plugins', version: '1.8.0', manifest: { kind: 'ready' } },
  systems: [
    { id: 'dac', title: '数据中心', description: '数字审计数据中心', login: true },
    { id: 'tyc', title: '天眼查', description: '', login: false },
  ],
  models: [
    { id: 'assets', title: '资产清查', description: '核对资产台账' },
    { id: 'collusion', title: '围标串标线索识别', description: '' },
  ],
  prompts: { kickoff: true, backfill: true, rerun: true },
}

/** A ready reading. */
export const READY: SystemCheck = { state: 'ready', checkedAt: '2026-11-09T07:12:00.000Z' }
