/** Made-up workbench reads shared by the workbench page tests. */
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type {
  KickoffTask, OrgScope, OrgScopeNode, ProjectArchive, ProjectEntry, SystemCheck, WorkbenchOverview,
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
  auditees: [
    { name: '示例公司', kind: '机构', codes: ['C001', 'C002'], scopeFile: '工作区/开工/组织范围/组织范围_C001.json' },
    { name: '示例项目部', kind: '', codes: [], scopeFile: '' },
  ],
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

/**
 * One Organization Scope node inside the scope with every other field empty.
 * @param code - node code.
 * @param parent - parent code; empty for the starting node.
 * @param fields - fields to override.
 * @returns the node.
 */
export function node(code: string, parent: string, fields: Partial<OrgScopeNode> = {}): OrgScopeNode {
  return { code, name: `单位${code}`, parent, unit: '示例公司', ownership: 'in', source: '', conflict: '', profitCenters: [], note: '', ...fields }
}

/** An Organization Scope with one node of each ownership and one disagreement. */
export const ORG_SCOPE: OrgScope = {
  origin: { code: 'C001', name: '示例公司' },
  exportedAt: '2026-11-09 20:40',
  membersTable: '名下编码_C001.xlsx',
  problems: [],
  nodes: [
    node('C001', '', { name: '示例公司', source: '组织架构对照表', profitCenters: ['L001', 'L002'] }),
    node('C002', 'C001', { name: '第一分公司', profitCenters: ['L003'] }),
    node('C003', 'C002', { name: '华东项目部', note: '项目已完工' }),
    node('C004', 'C002', { name: '安装公司', unit: '示例安装公司', ownership: 'other', conflict: '报账树归本单位；组织主数据归示例安装公司' }),
    node('C005', 'C001', { name: '空壳公司', ownership: 'excluded', note: '没有利润中心，不纳入' }),
    node('C006', 'C001', { name: '停用部门', unit: '', ownership: 'unassigned' }),
    node('C007', 'C006', { name: '', unit: '', ownership: 'other' }),
  ],
}
