/**
 * Browser-side owner of the workbench reads: the overview, the Project
 * Archives, and each system's System Login Status, published as one snapshot
 * that the page reads through its injected hook.
 */
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  OutputRequest, ProjectEntry, PromptRequest, SystemCheck, WorkbenchOverview,
} from '@deepseek-ai/dsh-audit-workbench/types'

/** A Host read that has not settled, settled with a value, or failed. */
export type Load<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly value: T }
  | { readonly status: 'error' }

/** One system's last reading and the operation running on it. */
export interface SystemState {
  /** `checking` while a session check runs, `login` while the system's login tool waits for the person. */
  readonly busy: 'idle' | 'checking' | 'login'
  /** Last settled reading; absent before the first check returns. */
  readonly check?: SystemCheck
}

/** Everything the workbench page shows that comes from the Host. */
export interface WorkbenchSnapshot {
  readonly overview: Load<WorkbenchOverview>
  readonly projects: Load<readonly ProjectEntry[]>
  readonly systems: Readonly<Record<string, SystemState>>
}

/** Why a prompt could not be prepared. */
export type PromptFailure = 'no-prompt' | 'not-found' | 'failed'

/** A filled prompt, or why none was produced. */
export type PromptResult = { readonly ok: true; readonly prompt: string } | { readonly ok: false; readonly reason: PromptFailure }

/** Why an output could not be opened. */
export type OpenFailure = 'refused' | 'not-found' | 'failed'

/** Remote methods of `ctx.remote.auditWorkbench` the source calls. */
export interface WorkbenchRemote {
  readonly overview: (signal?: AbortSignal) => Promise<RemoteResult<WorkbenchOverview>>
  readonly projects: (signal?: AbortSignal) => Promise<RemoteResult<ProjectEntry[]>>
  readonly prompt: (request: PromptRequest, signal?: AbortSignal) => Promise<RemoteResult<string>>
  readonly checkSystem: (id: string, signal?: AbortSignal) => Promise<RemoteResult<SystemCheck>>
  readonly login: (id: string, signal?: AbortSignal) => Promise<RemoteResult<SystemCheck>>
  readonly openOutput: (request: OutputRequest, signal?: AbortSignal) => Promise<RemoteResult<void>>
}

/** The source's published snapshot and operations. */
export interface WorkbenchSource {
  readonly snapshot: SnapshotStore<WorkbenchSnapshot>
  /**
   * Read for a page that opened: the first call runs {@link WorkbenchSource.refresh}, later calls only re-read the Project Archives.
   * @returns after the reads settle.
   */
  open(): Promise<void>
  /**
   * Read the overview and the Project Archives again, then check every system once.
   * @returns after the reads settle; checks continue in the background.
   */
  refresh(): Promise<void>
  /**
   * Read the Project Archives again without touching the overview or System Login Status.
   * @returns after the read settles.
   */
  refreshProjects(): Promise<void>
  /**
   * Check one system; a second request while one runs joins nothing and returns at once.
   * @param id - manifest system id.
   * @returns after the reading is published.
   */
  check(id: string): Promise<void>
  /**
   * Run one system's login tool, which waits for the person in its own browser, and publish the reading after it.
   * @param id - manifest system id.
   * @returns after the reading is published.
   */
  login(id: string): Promise<void>
  /**
   * Fill a prompt template on the Host.
   * @param request - prompt kind and target.
   * @returns the prompt text or why none was produced.
   */
  prompt(request: PromptRequest): Promise<PromptResult>
  /**
   * Open one recorded output on the Host desktop.
   * @param request - Workspace, task, and output indexes.
   * @returns `opened`, or why the Host refused.
   */
  openOutput(request: OutputRequest): Promise<'opened' | OpenFailure>
  /** Cancel reads and checks in flight; later calls publish nothing. */
  dispose(): void
}

const INITIAL: WorkbenchSnapshot = { overview: { status: 'loading' }, projects: { status: 'loading' }, systems: {} }

async function settle<T>(call: () => Promise<RemoteResult<T>>): Promise<RemoteResult<T> | undefined> {
  try {
    return await call()
  } catch (_error) {
    // A rejected call leaves the outcome unknown; callers show the same retry as for a Remote failure.
    return undefined
  }
}

/**
 * Create the source over the generated Remote namespace.
 * @param remote - the mounted `auditWorkbench` Remote methods.
 * @returns the source; the caller disposes it with its plugin lifetime.
 */
export function createWorkbenchSource(remote: WorkbenchRemote): WorkbenchSource {
  const snapshot = createSnapshotStore<WorkbenchSnapshot>(INITIAL)
  const lifetime = new AbortController()
  let projectsRead = 0
  let opened = false
  const setSystem = (id: string, next: SystemState): void => {
    if (lifetime.signal.aborted) return
    const current = snapshot.getSnapshot()
    snapshot.set({ ...current, systems: { ...current.systems, [id]: next } })
  }
  const run = async (id: string, busy: 'checking' | 'login', call: () => Promise<RemoteResult<SystemCheck>>): Promise<void> => {
    const current = snapshot.getSnapshot().systems[id]
    if (current !== undefined && current.busy !== 'idle') return
    setSystem(id, { ...current, busy })
    const result = await settle(call)
    const check: SystemCheck = result?.ok === true
      ? result.value
      : { state: 'failed', checkedAt: new Date().toISOString(), reason: 'call-failed', message: '' }
    setSystem(id, { busy: 'idle', check })
  }
  const source: WorkbenchSource = {
    snapshot,
    open() {
      if (opened) return source.refreshProjects()
      opened = true
      return source.refresh()
    },
    async refreshProjects() {
      const read = ++projectsRead
      const result = await settle(() => remote.projects(lifetime.signal))
      if (lifetime.signal.aborted || read !== projectsRead) return
      snapshot.set({
        ...snapshot.getSnapshot(),
        projects: result?.ok === true ? { status: 'ready', value: result.value } : { status: 'error' },
      })
    },
    async refresh() {
      const [overview] = await Promise.all([settle(() => remote.overview(lifetime.signal)), source.refreshProjects()])
      if (lifetime.signal.aborted) return
      snapshot.set({
        ...snapshot.getSnapshot(),
        overview: overview?.ok === true ? { status: 'ready', value: overview.value } : { status: 'error' },
      })
      if (overview?.ok === true) for (const system of overview.value.systems) void source.check(system.id)
    },
    check: id => run(id, 'checking', () => remote.checkSystem(id, lifetime.signal)),
    login: id => run(id, 'login', () => remote.login(id, lifetime.signal)),
    async prompt(request) {
      const result = await settle(() => remote.prompt(request, lifetime.signal))
      if (result?.ok === true) return { ok: true, prompt: result.value }
      const code = result?.error.code
      return { ok: false, reason: code === 'auditWorkbench/no-prompt' ? 'no-prompt' : code === 'auditWorkbench/not-found' ? 'not-found' : 'failed' }
    },
    async openOutput(request) {
      const result = await settle(() => remote.openOutput(request, lifetime.signal))
      if (result?.ok === true) return 'opened'
      const code = result?.error.code
      return code === 'auditWorkbench/output-refused' ? 'refused' : code === 'auditWorkbench/not-found' ? 'not-found' : 'failed'
    },
    dispose() { lifetime.abort() },
  }
  return source
}
