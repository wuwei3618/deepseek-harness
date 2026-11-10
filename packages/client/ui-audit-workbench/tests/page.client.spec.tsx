// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { allowAllAccess, bindSnapshotSelector, contextMenuHook, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { ProjectArchive, ProjectEntry, WorkbenchOverview } from '@deepseek-ai/dsh-audit-workbench/types'
import { WorkbenchPage, type PromptOutcome, type WorkbenchPageProps } from '../src/client/WorkbenchPage.tsx'
import { ModelsDialog } from '../src/client/dialogs.tsx'
import type { WorkbenchSnapshot } from '../src/client/source.ts'
import { zh } from '../src/client/locales.ts'
import { clockTime } from '../src/client/format.ts'
import { ALPHA, ARCHIVE, BETA, OVERVIEW, PROJECTS, READY, task } from './fixtures.ts'

const t = makeTranslate(zh)
const NOW = Date.now()

function session(id: string, fields: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: id as SessionId, displayTitle: `会话 ${id}`, running: false, retainedBy: {},
    blank: false, updatedAt: NOW - 3 * 3_600_000, ...fields,
  }
}

const SESSIONS: SessionListState = {
  ids: [], phase: 'ready', projectionsBySession: {},
  byId: {
    ['s-old' as SessionId]: session('s-old', { updatedAt: NOW - 2 * 86_400_000 }),
    ['s-new' as SessionId]: session('s-new', { displayTitle: '开工会话', updatedAt: NOW - 60_000 }),
    ['s-blank' as SessionId]: session('s-blank', { blank: true }),
    ['s-child' as SessionId]: session('s-child', { parentId: 's-new' as SessionId }),
    ['s-sub' as SessionId]: session('s-sub', { origin: 'subagent' }),
    ['s-archived' as SessionId]: session('s-archived'),
  },
}

function workspace(workspaceId: WorkspaceId, title: string, path: string, sessionIds: string[] = []) {
  return { workspaceId, title, path, sessionIds: sessionIds as SessionId[], createdAt: '', updatedAt: '' }
}

const WORKSPACES: WorkspaceSnapshot = {
  items: [
    workspace(ALPHA, '示例公司离任审计', '/projects/alpha', ['s-old', 's-new', 's-blank', 's-child', 's-sub', 's-archived', 's-gone']),
    workspace(BETA, '结算审计', '/projects/beta', ['s-old']),
  ],
  archivedSessionIds: ['s-archived' as SessionId], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
}

function ready(overview: WorkbenchOverview = OVERVIEW, projects: readonly ProjectEntry[] = PROJECTS): WorkbenchSnapshot {
  return {
    overview: { status: 'ready', value: overview },
    projects: { status: 'ready', value: projects },
    systems: { dac: { busy: 'idle', check: READY } },
  }
}

function mount(initial: WorkbenchSnapshot = ready(), overrides: Partial<WorkbenchPageProps> = {}) {
  const store = createSnapshotStore(initial)
  const workspaces = createSnapshotStore(WORKSPACES)
  const props: WorkbenchPageProps = {
    useWorkbench: bindSnapshotSelector(store),
    useWorkspaces: bindSnapshotSelector(workspaces),
    useSessions: select => select(SESSIONS),
    usePanelInfo: select => select({ activePanelId: null }),
    useSessionStatus: select => select(new Map()),
    useSessionRetainInfo: () => undefined,
    useResource: () => { throw new Error('the workbench loads no document resources') },
    ...allowAllAccess,
    useContextMenu: contextMenuHook(),
    onOpen: vi.fn(),
    onRefresh: vi.fn(),
    onRefreshProjects: vi.fn(),
    onCheck: vi.fn(),
    onLogin: vi.fn(),
    preparePrompt: vi.fn<WorkbenchPageProps['preparePrompt']>(async () => ({ ok: true, prompt: '请按技能开工' })),
    openOutput: vi.fn<WorkbenchPageProps['openOutput']>(async () => 'opened'),
    startSession: vi.fn(),
    openSession: vi.fn(),
    pickDirectory: vi.fn<WorkbenchPageProps['pickDirectory']>(async () => '/projects/new'),
    createWorkspace: vi.fn<WorkbenchPageProps['createWorkspace']>(async () => 'ws-new' as WorkspaceId),
    t,
    ...overrides,
  }
  const view = render(<WorkbenchPage {...props} />)
  return { props, view, store, workspaces }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

const card = (name: string): HTMLElement => {
  const title = screen.getByText(name, { selector: 'span' })
  const item = title.closest('li')
  if (item === null) throw new Error(`no card for ${name}`)
  return item
}

afterEach(() => { cleanup() })

describe('workbench overview', () => {
  it('opens the source, lists systems with their readings, and starts checks and logins', () => {
    const { props } = mount({
      ...ready(),
      systems: {
        dac: { busy: 'idle', check: { state: 'login-required', checkedAt: READY.checkedAt, message: '会话已过期' } },
        tyc: { busy: 'idle', check: { state: 'login-required', checkedAt: READY.checkedAt, message: '' } },
      },
    })
    expect(props.onOpen).toHaveBeenCalledTimes(1)
    const dac = card('数据中心')
    expect(within(dac).getByText('需要登录')).toBeTruthy()
    expect(within(dac).getByText('会话已过期')).toBeTruthy()
    expect(within(dac).getByText('数字审计数据中心')).toBeTruthy()
    expect(within(dac).getByText(`检查于 ${clockTime(READY.checkedAt)}`)).toBeTruthy()
    fireEvent.click(within(dac).getByRole('button', { name: '去登录' }))
    expect(props.onLogin).toHaveBeenCalledWith('dac')
    fireEvent.click(within(dac).getByRole('button', { name: '重新检查' }))
    expect(props.onCheck).toHaveBeenCalledWith('dac')
    expect(within(card('天眼查')).queryByRole('button', { name: '去登录' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '全部刷新' }))
    expect(props.onRefresh).toHaveBeenCalledTimes(1)
  })

  it.each([
    [{ busy: 'checking' as const }, '检查中', ''],
    [{ busy: 'login' as const }, '等待登录', '已打开登录窗口，请在该窗口中完成登录'],
    [{ busy: 'idle' as const, check: { state: 'failed' as const, checkedAt: 'not a time', reason: 'timeout' as const, message: '' } }, '检查失败', '检查超时'],
    [{ busy: 'idle' as const, check: { state: 'failed' as const, checkedAt: READY.checkedAt, reason: 'unreadable' as const, message: '工具报错' } }, '检查失败', '工具报错'],
    [undefined, '尚未检查', ''],
  ])('shows the reading %#', (state, badge, detail) => {
    mount({ ...ready(), systems: state === undefined ? {} : { dac: state } })
    const dac = card('数据中心')
    expect(within(dac).getByText(badge)).toBeTruthy()
    if (detail !== '') expect(within(dac).getByText(detail)).toBeTruthy()
    const recheck = within(dac).getByRole<HTMLButtonElement>('button', { name: '重新检查' })
    expect(recheck.disabled).toBe(state !== undefined && state.busy !== 'idle')
  })

  it('shows a failed check time as recorded when it does not parse', () => {
    mount({ ...ready(), systems: { dac: { busy: 'idle', check: { state: 'failed', checkedAt: 'not a time', reason: 'call-failed', message: '' } } } })
    expect(within(card('数据中心')).getByText('检查于 not a time')).toBeTruthy()
    expect(within(card('数据中心')).getByText('检查未能完成')).toBeTruthy()
  })

  it('lists projects with their archive facts and opens one', () => {
    const { props } = mount()
    const alpha = card('示例公司离任审计')
    expect(within(alpha).getByText('更新于 2026-11-09 14:32')).toBeTruthy()
    expect(within(alpha).getByText('示例公司、示例项目部')).toBeTruthy()
    expect(within(alpha).getByText('2023-01 至 2025-06')).toBeTruthy()
    expect(within(alpha).getByText('已确认')).toBeTruthy()
    expect(within(alpha).getByText('开工任务 5 项：完成 1 项，进行中 1 项，失败 1 项，待做 2 项')).toBeTruthy()
    const beta = card('结算审计')
    expect(within(beta).getByText('未建档')).toBeTruthy()
    expect(within(beta).getByText('/projects/beta')).toBeTruthy()
    const gamma = card('/projects/gamma')
    expect(within(gamma).getByText('档案无法读取')).toBeTruthy()
    expect(within(gamma).getByText('项目档案不是有效的 JSON，可能经过手工修改或写入中断')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    expect(props.onRefreshProjects).toHaveBeenCalledTimes(1)
    fireEvent.click(within(alpha).getByRole('button', { name: '查看项目' }))
    expect(screen.getByRole('heading', { level: 1, name: '示例公司离任审计' })).toBeTruthy()
  })

  it('shows empty values for an archive without facts and no tasks', () => {
    const bare: ProjectArchive = {
      ...ARCHIVE, updatedAt: '', auditType: '', auditees: [{ name: '', kind: '', codes: [] }], period: { from: '', to: '' },
      scope: { ...ARCHIVE.scope, confirmedAt: '' }, tasks: [task({ status: 'skipped' })],
    }
    mount(ready(OVERVIEW, [{ workspaceId: ALPHA, path: '/projects/alpha', read: { kind: 'read', newer: false, archive: bare } }]))
    const alpha = card('示例公司离任审计')
    expect(within(alpha).getByText('更新于 —')).toBeTruthy()
    expect(within(alpha).getAllByText('—')).toHaveLength(3)
    expect(within(alpha).getByText('待确认')).toBeTruthy()
    expect(within(alpha).getByText('开工任务 0 项：完成 0 项，进行中 0 项，失败 0 项，待做 0 项')).toBeTruthy()
  })

  it('reports the overview and project reads while they load or fail', () => {
    const { props, view } = mount({ overview: { status: 'error' }, projects: { status: 'loading' }, systems: {} })
    expect(screen.getByText('未能读取审计工作台信息')).toBeTruthy()
    expect(view.container.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(screen.queryByRole('button', { name: '新建审计项目' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(props.onRefresh).toHaveBeenCalledTimes(1)
    cleanup()
    const failed = mount({ overview: { status: 'loading' }, projects: { status: 'error' }, systems: {} })
    expect(screen.getByText('未能读取项目档案')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(failed.props.onRefreshProjects).toHaveBeenCalledTimes(1)
    cleanup()
    mount(ready({ ...OVERVIEW, systems: [] }, []))
    expect(screen.getByText('尚无工作区。新建审计项目后，项目将列示于此')).toBeTruthy()
    expect(screen.getByText('审计插件包未列出需要检查登录状态的系统')).toBeTruthy()
  })

  it.each([
    [{ kind: 'missing', root: '/home/a/audit-plugins' } as const, '尚未安装审计插件包', '系统登录状态与内置模型清单均取自审计插件包。请将审计插件包解压至 /home/a/audit-plugins，然后刷新本页'],
    [{ kind: 'invalid', root: '/r', message: '缺少 package.json' } as const, '审计插件包无法读取', '/r 中的审计插件包无法读取：缺少 package.json'],
  ])('explains a pack that is %s and hides the systems', (pack, heading, body) => {
    const prompts = { kickoff: false, backfill: false, rerun: false }
    const { props } = mount(ready({ ...OVERVIEW, pack, systems: [], models: [], prompts }))
    expect(screen.getByRole('heading', { name: heading })).toBeTruthy()
    expect(screen.getByText(body)).toBeTruthy()
    expect(screen.queryByText('系统登录')).toBeNull()
    expect(screen.queryByRole('button', { name: '新建审计项目' })).toBeNull()
    expect(within(card('结算审计')).queryByRole('button', { name: '回填项目档案' })).toBeNull()
    fireEvent.click(within(screen.getByRole('heading', { name: heading }).closest('section')!).getByRole('button', { name: '刷新' }))
    expect(props.onRefresh).toHaveBeenCalledTimes(1)
  })

  it.each([
    [{ kind: 'missing' } as const, '审计插件包 audit-plugins 1.8.0 未提供工作台清单，因此不显示系统登录状态与内置模型'],
    [{ kind: 'invalid', message: 'systems.0.id: Required' } as const, '审计插件包的工作台清单无法读取：systems.0.id: Required'],
  ])('notes a manifest that is %s', (manifest, notice) => {
    mount(ready({ ...OVERVIEW, pack: { ...OVERVIEW.pack, kind: 'loaded', name: 'audit-plugins', version: '1.8.0', manifest } as WorkbenchOverview['pack'] }))
    expect(screen.getByText(notice)).toBeTruthy()
    expect(screen.queryByText('系统登录')).toBeNull()
  })
})

describe('prompt dialog', () => {
  it('prepares the backfill prompt, shows it, and fills a new Session of that Workspace', async () => {
    const prepared = deferred<PromptOutcome>()
    const { props } = mount(ready(), { preparePrompt: vi.fn(() => prepared.promise) })
    fireEvent.click(within(card('结算审计')).getByRole('button', { name: '回填项目档案' }))
    expect(props.preparePrompt).toHaveBeenCalledWith({ kind: 'backfill', workspaceId: BETA })
    const dialog = screen.getByRole('dialog', { name: '回填项目档案' })
    expect(within(dialog).getByText('工作区：结算审计')).toBeTruthy()
    const confirm = within(dialog).getByRole<HTMLButtonElement>('button', { name: '新建会话并填入' })
    expect(confirm.disabled).toBe(true)
    await act(async () => { prepared.resolve({ ok: true, prompt: '回填\n第二行' }) })
    expect(within(dialog).getByText((_, element) => element?.tagName === 'PRE' && element.textContent === '回填\n第二行')).toBeTruthy()
    fireEvent.click(confirm)
    expect(props.startSession).toHaveBeenCalledWith(BETA, '回填\n第二行')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it.each([
    ['no-prompt' as const, '审计插件包未提供该提示词'],
    ['not-found' as const, '该项目或开工任务已不存在，请刷新后重试'],
    ['failed' as const, '未能生成提示词，请重试'],
  ])('reports a %s prompt and cannot confirm it', async (reason, message) => {
    const { props } = mount(ready(), { preparePrompt: vi.fn(async () => ({ ok: false as const, reason })) })
    await act(async () => { fireEvent.click(within(card('结算审计')).getByRole('button', { name: '回填项目档案' })) })
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(message)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: '新建会话并填入' }))
    expect(props.startSession).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('drops a prompt that arrives after its dialog closed', async () => {
    const prepared = deferred<PromptOutcome>()
    mount(ready(), { preparePrompt: vi.fn(() => prepared.promise) })
    fireEvent.click(within(card('结算审计')).getByRole('button', { name: '回填项目档案' }))
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    await act(async () => { prepared.resolve({ ok: true, prompt: 'late' }) })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('omits the Workspace line when the Workspace is gone', async () => {
    mount(ready(OVERVIEW, [{ workspaceId: 'ws-gone' as WorkspaceId, path: '/projects/gone', read: { kind: 'missing' } }]))
    await act(async () => { fireEvent.click(within(card('/projects/gone')).getByRole('button', { name: '回填项目档案' })) })
    expect(screen.queryByText(/工作区：/)).toBeNull()
  })

  it('lists models from the dialog and says when the pack supplies none', () => {
    const onPick = vi.fn()
    render(<ModelsDialog models={[]} t={t} onClose={vi.fn()} onPick={onPick} />)
    expect(screen.getByText('审计插件包未提供内置模型')).toBeTruthy()
  })
})

describe('new audit project', () => {
  it('adds the chosen directory as a Workspace and fills the kickoff prompt', async () => {
    const { props } = mount()
    fireEvent.click(screen.getByRole('button', { name: '新建审计项目' }))
    const dialog = screen.getByRole('dialog', { name: '新建审计项目' })
    expect(within(dialog).getByText('尚未选择目录')).toBeTruthy()
    const confirm = within(dialog).getByRole<HTMLButtonElement>('button', { name: '添加为工作区并新建会话' })
    expect(confirm.disabled).toBe(true)
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: '选择目录…' })) })
    expect(within(dialog).getByText('/projects/new')).toBeTruthy()
    await act(async () => { fireEvent.click(confirm) })
    expect(props.createWorkspace).toHaveBeenCalledWith('/projects/new')
    expect(props.preparePrompt).toHaveBeenCalledWith({ kind: 'kickoff', workspaceId: 'ws-new' })
    expect(props.startSession).toHaveBeenCalledWith('ws-new', '请按技能开工')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps the dialog open when no directory is chosen or the Workspace is refused', async () => {
    const pickDirectory = vi.fn<WorkbenchPageProps['pickDirectory']>().mockResolvedValueOnce(null).mockResolvedValueOnce('/projects/x')
    const { props } = mount(ready(), { pickDirectory, createWorkspace: vi.fn(async () => undefined) })
    fireEvent.click(screen.getByRole('button', { name: '新建审计项目' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '选择目录…' })) })
    expect(screen.getByText('尚未选择目录')).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '选择目录…' })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '添加为工作区并新建会话' })) })
    expect(screen.getByText('未能将该目录添加为工作区')).toBeTruthy()
    expect(props.preparePrompt).not.toHaveBeenCalled()
  })

  it('reports a kickoff prompt the pack cannot supply after the Workspace was added', async () => {
    const { props } = mount(ready(), { preparePrompt: vi.fn(async () => ({ ok: false as const, reason: 'no-prompt' as const })) })
    fireEvent.click(screen.getByRole('button', { name: '新建审计项目' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '选择目录…' })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '添加为工作区并新建会话' })) })
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('审计插件包未提供该提示词')).toBeTruthy()
    expect(within(dialog).queryByRole('button', { name: '添加为工作区并新建会话' })).toBeNull()
    expect(within(dialog).getByRole('button', { name: '选择目录…' })).toHaveProperty('disabled', true)
    fireEvent.click(within(dialog).getAllByRole('button', { name: '关闭' }).at(-1) ?? dialog)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(props.startSession).not.toHaveBeenCalled()
  })

  it('ignores a directory or a Workspace that arrives after the dialog closed', async () => {
    const picked = deferred<string | null>()
    const created = deferred<WorkspaceId | undefined>()
    const { props } = mount(ready(), { pickDirectory: vi.fn(() => picked.promise), createWorkspace: vi.fn(() => created.promise) })
    fireEvent.click(screen.getByRole('button', { name: '新建审计项目' }))
    fireEvent.click(screen.getByRole('button', { name: '选择目录…' }))
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    await act(async () => { picked.resolve('/projects/late') })
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '新建审计项目' }))
    expect(screen.getByText('尚未选择目录')).toBeTruthy()
    cleanup()
    const second = mount(ready(), { createWorkspace: vi.fn(() => created.promise) })
    fireEvent.click(screen.getByRole('button', { name: '新建审计项目' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '选择目录…' })) })
    fireEvent.click(screen.getByRole('button', { name: '添加为工作区并新建会话' }))
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '添加为工作区并新建会话' }).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    await act(async () => { created.resolve('ws-late' as WorkspaceId) })
    expect(second.props.preparePrompt).not.toHaveBeenCalled()
    expect(props.startSession).not.toHaveBeenCalled()
  })

  it('drops a kickoff prompt that arrives after the dialog closed', async () => {
    const prepared = deferred<PromptOutcome>()
    const { props } = mount(ready(), { preparePrompt: vi.fn(() => prepared.promise) })
    fireEvent.click(screen.getByRole('button', { name: '新建审计项目' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '选择目录…' })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '添加为工作区并新建会话' })) })
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    await act(async () => { prepared.resolve({ ok: true, prompt: 'late' }) })
    expect(props.startSession).not.toHaveBeenCalled()
  })
})

describe('project detail', () => {
  function openAlpha(initial: WorkbenchSnapshot = ready(), overrides: Partial<WorkbenchPageProps> = {}) {
    const mounted = mount(initial, overrides)
    fireEvent.click(within(card('示例公司离任审计')).getByRole('button', { name: '查看项目' }))
    return mounted
  }

  it('shows the archive facts, the scope, and the readings', () => {
    openAlpha()
    expect(screen.getByText('项目目录 /projects/alpha')).toBeTruthy()
    expect(screen.getByText('档案更新于 2026-11-09 14:32')).toBeTruthy()
    expect(screen.getByText('机构 · C001 · C002')).toBeTruthy()
    expect(screen.getByText('示例项目部')).toBeTruthy()
    expect(screen.getByText('专项一、专项二')).toBeTruthy()
    expect(screen.getByText('2021-03 至 —')).toBeTruthy()
    expect(screen.getByText('资金管理')).toBeTruthy()
    expect(screen.getByText('工程结算')).toBeTruthy()
    expect(screen.getByText('底稿/范围表.xlsx')).toBeTruthy()
    expect(screen.getByText('确认于 2026-11-05 10:20')).toBeTruthy()
    expect(screen.getByText('读数时间 2026-11-05 10:02')).toBeTruthy()
    expect(screen.getByText('审计方案/会话预检.json')).toBeTruthy()
    expect(screen.getByText('尚未读数')).toBeTruthy()
    expect(screen.getByText('开工会议')).toBeTruthy()
  })

  it('lists Kickoff Tasks with their status, outputs, and actions', async () => {
    const openOutput = vi.fn<WorkbenchPageProps['openOutput']>().mockResolvedValueOnce('refused').mockResolvedValueOnce('opened')
    const { props } = openAlpha(ready(), { openOutput })
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows).toHaveLength(6)
    expect(within(rows[0]!).getByText('完成')).toBeTruthy()
    expect(within(rows[1]!).getByText('请在会话中查看进展')).toBeTruthy()
    expect(within(rows[2]!).getByText('内置模型')).toBeTruthy()
    expect(within(rows[2]!).getByText('数据中心会话过期')).toBeTruthy()
    expect(within(rows[5]!).getByText('暂停')).toBeTruthy()
    await act(async () => { fireEvent.click(within(rows[0]!).getByRole('button', { name: '组织范围.xlsx' })) })
    expect(openOutput).toHaveBeenCalledWith({ workspaceId: ALPHA, task: 0, output: 0 })
    expect(screen.getByRole('alert').textContent).toBe('该产物不在项目目录内或不是文件，未予打开')
    await act(async () => { fireEvent.click(within(rows[0]!).getByRole('button', { name: '组织范围.xlsx' })) })
    expect(screen.queryByRole('alert')).toBeNull()
    await act(async () => { fireEvent.click(within(rows[2]!).getByRole('button', { name: '重跑' })) })
    expect(props.preparePrompt).toHaveBeenCalledWith({ kind: 'rerun', workspaceId: ALPHA, task: 2 })
    expect(screen.getByRole('dialog', { name: '重跑开工任务「资产清查」' })).toBeTruthy()
  })

  it('runs a Built-in Model through the model list', async () => {
    const { props } = openAlpha()
    fireEvent.click(screen.getByRole('button', { name: '追加运行内置模型' }))
    const dialog = screen.getByRole('dialog', { name: '追加运行内置模型' })
    expect(within(dialog).getByText('核对资产台账')).toBeTruthy()
    await act(async () => { fireEvent.click(within(dialog).getByText('围标串标线索识别')) })
    expect(props.preparePrompt).toHaveBeenCalledWith({ kind: 'model', workspaceId: ALPHA, model: 'collusion' })
    expect(screen.getByRole('dialog', { name: '追加运行内置模型「围标串标线索识别」' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '新建会话并填入' }))
    expect(props.startSession).toHaveBeenCalledWith(ALPHA, '请按技能开工')
  })

  it('closes the model list without a prompt', () => {
    openAlpha()
    fireEvent.click(screen.getByRole('button', { name: '追加运行内置模型' }))
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('lists the project Sessions newest first and opens one', () => {
    const { props } = openAlpha()
    const list = screen.getByRole('heading', { name: '本项目的会话' }).parentElement!
    const sessions = within(list).getAllByRole('button')
    expect(sessions.map(button => button.textContent)).toEqual(['开工会话1 分钟前', '会话 s-old2 天前'])
    fireEvent.click(sessions[0]!)
    expect(props.openSession).toHaveBeenCalledWith('s-new')
  })

  it('keeps each view\'s head in the window drag row above the scrolling content', () => {
    mount()
    const overviewHead = screen.getByRole('heading', { level: 1, name: '审计工作台' }).closest('[data-window-drag]')
    expect(overviewHead).not.toBeNull()
    expect(overviewHead!.contains(screen.getByRole('heading', { name: '系统登录' }))).toBe(false)
    fireEvent.click(within(card('示例公司离任审计')).getByRole('button', { name: '查看项目' }))
    const detailHead = screen.getByRole('heading', { level: 1, name: '示例公司离任审计' }).closest('[data-window-drag]')
    expect(detailHead!.contains(screen.getByRole('button', { name: '审计工作台' }))).toBe(true)
    expect(detailHead!.contains(screen.getByRole('heading', { name: '本项目的会话' }))).toBe(false)
  })

  it('refreshes the archives and returns to the overview', () => {
    const { props } = openAlpha()
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    expect(props.onRefreshProjects).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '审计工作台' }))
    expect(screen.getByRole('heading', { level: 1, name: '审计工作台' })).toBeTruthy()
  })

  it('marks an archive newer than the workbench knows and leaves empty sections empty', () => {
    const archive: ProjectArchive = {
      ...ARCHIVE, version: 2, updatedAt: '', auditees: [], specialAudits: [], focus: [], tasks: [], changes: [],
      scope: { tablePath: '', tableVersion: '', confirmedAt: '' }, precheck: { readAt: '', file: 'only.json' },
    }
    openAlpha(ready({ ...OVERVIEW, models: [] }, [{ workspaceId: ALPHA, path: '/projects/alpha', read: { kind: 'read', newer: true, archive } }]))
    expect(screen.getByText('该项目档案为第 2 版，高于工作台支持的第 1 版。基本信息照常显示，升级安装包后可查看完整内容')).toBeTruthy()
    expect(screen.getByText('项目档案尚未记录开工任务')).toBeTruthy()
    expect(screen.getByText('尚无修改记录')).toBeTruthy()
    expect(screen.getByText('待确认')).toBeTruthy()
    expect(screen.getByText('only.json')).toBeTruthy()
    expect(screen.queryByText(/档案更新于/)).toBeNull()
    expect(screen.queryByRole('button', { name: '追加运行内置模型' })).toBeNull()
    expect(screen.queryByText('审计重点')).toBeNull()
  })

  it('names the known version for a newer archive without a version and hides rerun without its prompt', () => {
    const { version: _version, ...unversioned } = ARCHIVE
    openAlpha(ready({ ...OVERVIEW, prompts: { ...OVERVIEW.prompts, rerun: false } }, [
      { workspaceId: ALPHA, path: '/projects/alpha', read: { kind: 'read', newer: true, archive: unversioned } },
    ]))
    expect(screen.getByText(/该项目档案为第 1 版/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: '重跑' })).toBeNull()
  })

  it('shows the detail of an archive-less or unreadable Workspace', async () => {
    const store = ready()
    const { props, store: source } = openAlpha(store)
    await act(async () => {
      source.set({ ...store, projects: { status: 'ready', value: [{ ...PROJECTS[0]!, read: { kind: 'missing' } }] } })
    })
    expect(screen.getByText(/该工作区尚无项目档案/)).toBeTruthy()
    expect(screen.getByRole('heading', { name: '本项目的会话' })).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '回填项目档案' })) })
    expect(props.preparePrompt).toHaveBeenCalledWith({ kind: 'backfill', workspaceId: ALPHA })
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    await act(async () => {
      source.set({ ...store, overview: { status: 'loading' }, projects: { status: 'ready', value: [{ ...PROJECTS[0]!, read: { kind: 'missing' } }] } })
    })
    expect(screen.queryByRole('button', { name: '回填项目档案' })).toBeNull()
    await act(async () => {
      source.set({ ...store, projects: { status: 'ready', value: [{ ...PROJECTS[0]!, read: { kind: 'unreadable', reason: 'io' } }] } })
    })
    expect(screen.getByRole('alert').textContent).toBe('项目档案无法读取，请检查文件权限')
    await act(async () => { source.set({ ...store, projects: { status: 'loading' } }) })
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull()
    await act(async () => { source.set({ ...store, projects: { status: 'ready', value: [] } }) })
    expect(screen.getByText('该工作区已不存在')).toBeTruthy()
  })

  it('falls back to the directory name when the Workspace has left the list', async () => {
    const { workspaces } = openAlpha()
    await act(async () => { workspaces.set({ ...WORKSPACES, items: [] }) })
    expect(screen.getByRole('heading', { level: 1, name: 'alpha' })).toBeTruthy()
    expect(screen.getByText('本项目尚无会话')).toBeTruthy()
  })

  it('shows no path when neither the read nor the Workspace names one', async () => {
    const store = ready()
    const { workspaces, store: source } = openAlpha(store)
    await act(async () => {
      workspaces.set({ ...WORKSPACES, items: [] })
      source.set({ ...store, projects: { status: 'ready', value: [] } })
    })
    expect(screen.queryByText(/项目目录/)).toBeNull()
  })
})
