/** Main-process ownership and fixed isolation policy for Sidebar webview guests. */
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readdirSync } from 'node:fs'
import { app, session, type BrowserWindow, type Session, type WebContents } from 'electron'
import type {
  DesktopBrowserAgentOpenRequest, DesktopBrowserAgentRequestId, DesktopBrowserLeaseId, DesktopBrowserOpenRequest, DesktopBrowserReservation,
} from '@deepseek-ai/dsh-client-ui-sidebar-browser/types'
import type { CdpGuest, CdpGuestListener, CdpGuestSource } from './browser-cdp-bridge.ts'
import { DESKTOP_IPC } from './ipc.ts'

interface GuestLease {
  readonly owner: WebContents
  readonly partition: string
  /** DSH Session whose Sidebar holds the guest; omitted by callers that predate agent browsing. */
  readonly session?: string
  readonly agentRequest?: DesktopBrowserAgentRequestId
  attached: boolean
  guest?: WebContents
  releaseInput?: () => void
}

/** Directory-name prefix of persisted Sidebar partitions under Electron's `Partitions` directory. */
const PERSISTED_PREFIX = 'dsh-sidebar-browser-'

/** How long an agent-requested page may take to appear in its Session's Sidebar. */
const AGENT_OPEN_TIMEOUT_MS = 20_000

/**
 * The storage partition of a workspace key. A `cwd:` workspace persists its cookies and storage
 * on disk under a name derived from the key; an ungrouped `session:` key stays in memory.
 */
function partitionFor(workspace: string): string {
  if (!workspace.startsWith('cwd:')) return `dsh-sidebar-browser-${randomUUID()}`
  return `persist:${PERSISTED_PREFIX}${createHash('sha256').update(workspace).digest('hex').slice(0, 32)}`
}

/** One Sidebar guest exposed to the agent's CDP bridge through its own debugger. */
class SidebarCdpGuest implements CdpGuest {
  private readonly messageListeners = new Set<(method: string, params: unknown, childSessionId: string) => void>()
  private readonly detachListeners = new Set<() => void>()
  private detaching = false

  constructor(readonly targetId: string, readonly contents: WebContents) {
    contents.debugger.on('message', (_event, method, params, sessionId) => {
      for (const listener of [...this.messageListeners]) listener(method, params, sessionId)
    })
    contents.debugger.on('detach', () => {
      if (this.detaching) return
      for (const listener of [...this.detachListeners]) listener()
    })
  }

  info(): { url: string; title: string } {
    return this.contents.isDestroyed() ? { url: 'about:blank', title: '' } : { url: this.contents.getURL(), title: this.contents.getTitle() }
  }

  attach(): void {
    if (!this.contents.debugger.isAttached()) this.contents.debugger.attach('1.3')
  }

  detach(): void {
    if (this.contents.isDestroyed() || !this.contents.debugger.isAttached()) return
    this.detaching = true
    try {
      this.contents.debugger.detach()
    } finally {
      this.detaching = false
    }
  }

  send(method: string, params: Record<string, unknown>, childSessionId?: string): Promise<unknown> {
    return this.contents.debugger.sendCommand(method, params, childSessionId) as Promise<unknown>
  }

  onMessage(listener: (method: string, params: unknown, childSessionId: string) => void): () => void {
    this.messageListeners.add(listener)
    return () => { this.messageListeners.delete(listener) }
  }

  onDetach(listener: () => void): () => void {
    this.detachListeners.add(listener)
    return () => { this.detachListeners.delete(listener) }
  }
}

/** Owns workspace storage partitions independently from individual tab guests. */
export class DesktopBrowserGuests implements CdpGuestSource {
  private readonly partitions = new Map<string, string>()
  private readonly leases = new Map<DesktopBrowserLeaseId, GuestLease>()
  private readonly cdpGuests = new Map<string, Set<SidebarCdpGuest>>()
  private readonly cdpListeners = new Map<string, Set<CdpGuestListener>>()
  private readonly agentRequests = new Map<DesktopBrowserAgentRequestId, {
    readonly session: string
    readonly resolve: (guest: SidebarCdpGuest) => void
  }>()
  private window: BrowserWindow | undefined

  /** @param hostUrl - current authenticated DSH Host, which guests cannot request. */
  constructor(private readonly hostUrl: () => string | undefined) {}

  /**
   * Reserve one guest in a workspace's partition; a `cwd:` workspace's partition persists across launches.
   * @param owner - authenticated primary application WebContents.
   * @param workspace - workspace identity received over IPC.
   * @param sessionId - DSH Session whose Sidebar holds the guest; the agent of that Session may operate it.
   * @param agentRequest - the agent page request this guest answers, from {@link DESKTOP_IPC.browserAgentOpenRequested}.
   * @returns opaque lease and the partition approved for it.
   */
  acquire(owner: WebContents, workspace: unknown, sessionId?: unknown, agentRequest?: unknown): DesktopBrowserReservation {
    if (typeof workspace !== 'string' || workspace.length === 0 || workspace.length > 4096) {
      throw new Error('desktop browser: a workspace storage identity is required')
    }
    if (sessionId !== undefined && (typeof sessionId !== 'string' || sessionId.length === 0 || sessionId.length > 1024)) {
      throw new Error('desktop browser: invalid Session identity')
    }
    if (agentRequest !== undefined && (typeof agentRequest !== 'string' || !this.agentRequests.has(agentRequest as DesktopBrowserAgentRequestId))) {
      throw new Error('desktop browser: unknown agent page request')
    }
    let partition = this.partitions.get(workspace)
    if (partition === undefined) {
      partition = partitionFor(workspace)
      this.configureSession(session.fromPartition(partition))
      this.partitions.set(workspace, partition)
    }
    const lease = randomUUID() as DesktopBrowserLeaseId
    this.leases.set(lease, {
      owner, partition, attached: false,
      ...sessionId === undefined ? {} : { session: sessionId },
      ...agentRequest === undefined ? {} : { agentRequest: agentRequest as DesktopBrowserAgentRequestId },
    })
    return { lease, partition }
  }

  /** @param scope - DSH Session id. @returns the Session's guests the agent may operate. */
  list(scope: string): readonly CdpGuest[] {
    return [...this.cdpGuests.get(scope) ?? []]
  }

  /** @param scope - DSH Session id. @param listener - membership sink. @returns unsubscribe callback. */
  subscribe(scope: string, listener: CdpGuestListener): () => void {
    let listeners = this.cdpListeners.get(scope)
    if (listeners === undefined) { listeners = new Set(); this.cdpListeners.set(scope, listeners) }
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
      if (listeners.size === 0 && this.cdpListeners.get(scope) === listeners) this.cdpListeners.delete(scope)
    }
  }

  /**
   * Ask the application window to open a visible Browser tab in a Session's Sidebar.
   * @param scope - DSH Session id.
   * @param url - initial HTTP(S) URL, or `about:blank`.
   * @returns the new tab's guest.
   * @throws when the URL is refused or the Sidebar does not open the tab in time.
   */
  open(scope: string, url: string): Promise<CdpGuest> {
    const owner = this.window?.webContents
    if (owner === undefined || owner.isDestroyed()) return Promise.reject(new Error('The application window is not open.'))
    if (url !== 'about:blank' && !this.allowedNavigation(url)) return Promise.reject(new Error(`The Sidebar browser cannot open ${url}`))
    const id = randomUUID() as DesktopBrowserAgentRequestId
    return new Promise<CdpGuest>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.agentRequests.delete(id)
        reject(new Error('The Sidebar did not open the page; open this conversation in the application window and try again.'))
      }, AGENT_OPEN_TIMEOUT_MS)
      const settle = (guest: SidebarCdpGuest): void => { clearTimeout(timer); this.agentRequests.delete(id); resolve(guest) }
      this.agentRequests.set(id, { session: scope, resolve: settle })
      const request: DesktopBrowserAgentOpenRequest = { id, sessionId: scope, url: url === 'about:blank' ? undefined : new URL(url).href }
      owner.send(DESKTOP_IPC.browserAgentOpenRequested, request)
    })
  }

  /** @param guest - a guest returned by {@link list}. @returns after the guest is destroyed. */
  async close(guest: CdpGuest): Promise<void> {
    const contents = (guest as SidebarCdpGuest).contents
    if (contents.isDestroyed()) return
    const destroyed = new Promise<void>((resolve) => { contents.once('destroyed', resolve) })
    contents.close({ waitForBeforeUnload: false })
    await destroyed
  }

  /**
   * Remove cookies, storage, and caches of every Sidebar partition, including those persisted by earlier launches.
   * @param partitionsDir - Electron's `Partitions` directory under the application's user data.
   * @returns after each partition is cleared.
   */
  async clearBrowsingData(partitionsDir: string): Promise<void> {
    const partitions = new Set(this.partitions.values())
    const stored = existsSync(partitionsDir) ? readdirSync(partitionsDir) : []
    for (const name of stored) if (name.startsWith(PERSISTED_PREFIX)) partitions.add(`persist:${name}`)
    for (const partition of partitions) {
      const browserSession = session.fromPartition(partition)
      await browserSession.clearStorageData()
      await browserSession.clearCache()
      await browserSession.clearAuthCache()
    }
  }

  /** Publish an attached guest of a Session to the agent's bridge, once its target id is known. */
  private async exposeToAgent(lease: GuestLease, guest: WebContents): Promise<void> {
    const scope = lease.session
    if (scope === undefined) return
    let targetId: string
    try {
      guest.debugger.attach('1.3')
      const { targetInfo } = await guest.debugger.sendCommand('Target.getTargetInfo') as { targetInfo: { targetId: string } }
      targetId = targetInfo.targetId
      guest.debugger.detach()
    } catch (error) {
      // A guest whose debugger is taken (for example by its DevTools) stays usable by the person only.
      console.warn('desktop browser: guest not available to the agent', error)
      return
    }
    if (guest.isDestroyed()) return
    const cdpGuest = new SidebarCdpGuest(targetId, guest)
    let guests = this.cdpGuests.get(scope)
    if (guests === undefined) { guests = new Set(); this.cdpGuests.set(scope, guests) }
    guests.add(cdpGuest)
    guest.once('destroyed', () => {
      guests.delete(cdpGuest)
      if (guests.size === 0 && this.cdpGuests.get(scope) === guests) this.cdpGuests.delete(scope)
      for (const listener of [...this.cdpListeners.get(scope) ?? []]) listener.removed(cdpGuest)
    })
    for (const listener of [...this.cdpListeners.get(scope) ?? []]) listener.added(cdpGuest)
    const request = lease.agentRequest === undefined ? undefined : this.agentRequests.get(lease.agentRequest)
    if (request !== undefined && request.session === scope) request.resolve(cdpGuest)
  }

  /**
   * Release only a lease issued to this application window; workspace storage survives.
   * @param owner - authenticated IPC sender.
   * @param id - lease received over IPC.
   */
  async release(owner: WebContents, id: unknown): Promise<void> {
    if (typeof id !== 'string') throw new Error('desktop browser: invalid guest lease')
    const key = id as DesktopBrowserLeaseId
    const lease = this.leases.get(key)
    if (lease === undefined) return
    if (lease.owner !== owner) throw new Error('desktop browser: guest belongs to another window')
    lease.releaseInput?.()
    this.leases.delete(key)
    const guest = lease.guest
    if (guest !== undefined && !guest.isDestroyed()) {
      const destroyed = new Promise<void>((resolve) => { guest.once('destroyed', resolve) })
      guest.close({ waitForBeforeUnload: false })
      await destroyed
    }
  }

  /**
   * Install attachment checks before the application document can create a webview.
   * @param window - primary application window.
   * @param attachInput - attaches native input after guest ownership is verified and returns its disposer.
   */
  bind(window: BrowserWindow, attachInput: (guest: WebContents, name: DesktopBrowserLeaseId) => () => void): void {
    this.window = window
    const owner = window.webContents
    owner.on('will-attach-webview', (event, preferences, params) => {
      const id = typeof params.src === 'string' && params.src.startsWith('about:blank#')
        ? params.src.slice('about:blank#'.length) : ''
      const lease = this.leases.get(id as DesktopBrowserLeaseId)
      if (lease === undefined || lease.owner !== owner || lease.attached || params.partition !== lease.partition) {
        event.preventDefault()
        return
      }
      lease.attached = true
      // Keep Electron's allowpopups dispatch flag; the guest handler still denies native windows.
      for (const key of Object.keys(preferences)) {
        if (key !== 'disablePopups') Reflect.deleteProperty(preferences, key)
      }
      Object.assign(preferences, {
        partition: lease.partition,
        nodeIntegration: false, nodeIntegrationInWorker: false, nodeIntegrationInSubFrames: false,
        contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false,
        webviewTag: false, plugins: false, navigateOnDragDrop: false, disableDialogs: true,
        devTools: !app.isPackaged,
      })
      params.httpreferrer = ''
    })
    owner.on('did-attach-webview', (_event, guest) => {
      let attachedLease: DesktopBrowserLeaseId | undefined
      // The first document is an inert about:blank carrying the approved lease.
      // Bind on the main-process event before the renderer can navigate the ready guest.
      guest.once('dom-ready', () => {
        const url = guest.getURL()
        const id = (url.startsWith('about:blank#') ? url.slice('about:blank#'.length) : '') as DesktopBrowserLeaseId
        const lease = this.leases.get(id)
        if (lease === undefined || lease.owner !== owner || lease.guest !== undefined) {
          guest.close({ waitForBeforeUnload: false })
          return
        }
        lease.guest = guest
        attachedLease = id
        lease.releaseInput = attachInput(guest, id)
        guest.once('destroyed', () => { lease.releaseInput?.(); this.leases.delete(id) })
        void this.exposeToAgent(lease, guest)
      })
      guest.setWindowOpenHandler(({ url, postBody }) => {
        const lease = attachedLease === undefined ? undefined : this.leases.get(attachedLease)
        if (attachedLease !== undefined && lease?.guest === guest && lease.owner === owner && !owner.isDestroyed()
          && postBody === undefined && this.allowedNavigation(url)) {
          const request: DesktopBrowserOpenRequest = { lease: attachedLease, url: new URL(url).href }
          owner.send(DESKTOP_IPC.browserOpenRequested, request)
        }
        return { action: 'deny' }
      })
      guest.on('will-frame-navigate', (event) => {
        if (event.isMainFrame && !this.allowedNavigation(event.url)) event.preventDefault()
      })
      guest.on('will-redirect', (event, url, _inPlace, mainFrame) => {
        if (mainFrame && !this.allowedNavigation(url)) event.preventDefault()
      })
      guest.on('will-attach-webview', (event) => { event.preventDefault() })
      guest.on('login', (event, _details, _authInfo, callback) => { event.preventDefault(); callback() })
    })
    const releaseAll = (): void => {
      for (const [id, lease] of this.leases) {
        if (lease.owner === owner) void this.release(owner, id).catch((error: unknown) => { console.error(error) })
      }
    }
    owner.on('did-start-navigation', (_event, _url, inPlace, mainFrame) => {
      if (mainFrame && !inPlace) releaseAll()
    })
    owner.on('render-process-gone', releaseAll)
    owner.once('destroyed', releaseAll)
  }

  private configureSession(browserSession: Session): void {
    browserSession.setPermissionRequestHandler((_contents, _permission, callback) => { callback(false) })
    browserSession.setPermissionCheckHandler(() => false)
    browserSession.setDevicePermissionHandler(() => false)
    browserSession.setDisplayMediaRequestHandler((_request, callback) => { callback({}) })
    browserSession.on('will-download', (event) => { event.preventDefault() })
    browserSession.webRequest.onBeforeRequest((details, callback) => {
      const url = new URL(details.url)
      const network = ['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)
      callback({ cancel: network
        ? url.username !== '' || url.password !== '' || this.isApplicationHost(url)
        : !['about:', 'data:', 'blob:'].includes(url.protocol) })
    })
  }

  private allowedNavigation(value: string): boolean {
    if (!URL.canParse(value)) return false
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && url.username === '' && url.password === ''
      && !this.isApplicationHost(url)
  }

  private isApplicationHost(url: URL): boolean {
    const value = this.hostUrl()
    if (value === undefined) return false
    const host = new URL(value)
    return url.port === host.port
      && (url.hostname === host.hostname || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  }
}
