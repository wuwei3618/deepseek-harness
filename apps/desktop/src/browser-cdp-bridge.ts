/**
 * Browser-level Chrome DevTools Protocol endpoint over Sidebar browser guests.
 *
 * Each connection serves one DSH Session (its scope) and exposes only the
 * page guests the {@link CdpGuestSource} lists for that scope, never the
 * application window. Browser-level `Browser.*` and `Target.*` commands are
 * answered here; commands addressed to a page session are forwarded to that
 * guest's own debugger, including the child sessions the page attaches.
 */

import { randomBytes, randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import { WebSocketServer, type RawData, type WebSocket } from 'ws'

/** One Sidebar page that a bridge connection may expose. */
export interface CdpGuest {
  /** Chromium target id of the page, stable for the guest's lifetime. */
  readonly targetId: string
  /** @returns the page's current URL and title. */
  info(): { readonly url: string; readonly title: string }
  /** Attach this guest's debugger; called once before the first {@link send}. */
  attach(): void
  /** Detach this guest's debugger, discarding the domain state the connection enabled. */
  detach(): void
  /**
   * Send one command to the page, or to a child session it attached.
   * @param method - CDP method name.
   * @param params - CDP command parameters.
   * @param childSessionId - child session id; omitted for the page itself.
   * @returns the command result.
   */
  send(method: string, params: Record<string, unknown>, childSessionId?: string): Promise<unknown>
  /**
   * @param listener - receives each protocol event; `childSessionId` is empty for the page itself.
   * @returns unsubscribe callback.
   */
  onMessage(listener: (method: string, params: unknown, childSessionId: string) => void): () => void
  /** @param listener - called when the debugger detaches outside {@link detach}. @returns unsubscribe callback. */
  onDetach(listener: () => void): () => void
}

/** Membership changes of one scope's guests. */
export interface CdpGuestListener {
  /** @param guest - a guest that joined the scope. */
  added(guest: CdpGuest): void
  /** @param guest - a guest that left the scope. */
  removed(guest: CdpGuest): void
}

/** The guests each Session scope may reach. */
export interface CdpGuestSource {
  /** @param scope - DSH Session id. @returns the scope's current guests. */
  list(scope: string): readonly CdpGuest[]
  /** @param scope - DSH Session id. @param listener - membership sink. @returns unsubscribe callback. */
  subscribe(scope: string, listener: CdpGuestListener): () => void
  /**
   * Open a new visible Sidebar page for a scope.
   * @param scope - DSH Session id.
   * @param url - initial page URL.
   * @returns the new guest once it belongs to the scope.
   * @throws when the scope's Sidebar cannot open a page.
   */
  open(scope: string, url: string): Promise<CdpGuest>
  /** @param guest - a guest of the connection's scope. @returns after the page closes. */
  close(guest: CdpGuest): Promise<void>
}

/** The single browser context every exposed page reports. */
const BROWSER_CONTEXT_ID = 'dsh-sidebar'

interface AttachedGuest {
  readonly guest: CdpGuest
  readonly sessionId: string
  readonly stop: () => void
}

interface CdpRequest {
  readonly id: number
  readonly method: string
  readonly params: Record<string, unknown>
  readonly sessionId?: string
}

function parseRequest(text: string): CdpRequest | undefined {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (_error) {
    // A frame that is not JSON carries no request id to answer.
    return undefined
  }
  if (typeof value !== 'object' || value === null) return undefined
  const { id, method, params, sessionId } = value as Record<string, unknown>
  if (typeof id !== 'number' || typeof method !== 'string') return undefined
  if (sessionId !== undefined && typeof sessionId !== 'string') return undefined
  const fields = typeof params === 'object' && params !== null && !Array.isArray(params) ? params as Record<string, unknown> : {}
  return { id, method, params: fields, ...sessionId === undefined ? {} : { sessionId } }
}

/** One client connection's browser-level protocol state for one scope. */
export class CdpBridgeConnection {
  private readonly attached = new Map<string, AttachedGuest>()
  private readonly byGuest = new Map<CdpGuest, AttachedGuest>()
  private readonly children = new Map<string, string>()
  private readonly unsubscribe: () => void
  private autoAttach = false
  private discover = false
  private disposed = false

  /**
   * @param source - guests the scope may reach.
   * @param scope - DSH Session id this connection serves.
   * @param write - sends one protocol frame to the client.
   */
  constructor(private readonly source: CdpGuestSource, private readonly scope: string, private readonly write: (frame: string) => void) {
    this.unsubscribe = source.subscribe(scope, {
      added: (guest) => {
        if (this.discover) this.emit('Target.targetCreated', { targetInfo: this.targetInfo(guest) })
        if (this.autoAttach) this.attach(guest)
      },
      removed: (guest) => { this.removed(guest) },
    })
  }

  /**
   * Handle one client frame; malformed frames are ignored.
   * @param frame - JSON text received from the client.
   * @returns after the reply is written.
   */
  async receive(frame: string): Promise<void> {
    const request = parseRequest(frame)
    if (request === undefined || this.disposed) return
    const { id, method, params, sessionId } = request
    try {
      const result = sessionId === undefined ? await this.browser(method, params) : await this.page(sessionId, method, params)
      this.send({ id, result: result ?? {}, ...sessionId === undefined ? {} : { sessionId } })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.send({ id, error: { code: -32000, message }, ...sessionId === undefined ? {} : { sessionId } })
    }
  }

  /** Detach every guest and stop following the scope; the client socket is the caller's. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.unsubscribe()
    for (const entry of [...this.attached.values()]) this.detach(entry, false)
  }

  private send(message: Record<string, unknown>): void {
    if (!this.disposed) this.write(JSON.stringify(message))
  }

  private emit(method: string, params: unknown, sessionId?: string): void {
    this.send({ method, params, ...sessionId === undefined ? {} : { sessionId } })
  }

  private targetInfo(guest: CdpGuest): Record<string, unknown> {
    const { url, title } = guest.info()
    return {
      targetId: guest.targetId, type: 'page', title, url,
      attached: this.byGuest.has(guest), canAccessOpener: false, browserContextId: BROWSER_CONTEXT_ID,
    }
  }

  private guest(targetId: unknown): CdpGuest {
    const guest = this.source.list(this.scope).find(candidate => candidate.targetId === targetId)
    if (guest === undefined) throw new Error('No target with given id found')
    return guest
  }

  private attach(guest: CdpGuest): string {
    const existing = this.byGuest.get(guest)
    if (existing !== undefined) return existing.sessionId
    guest.attach()
    const sessionId = randomUUID().replaceAll('-', '').toUpperCase()
    const stopMessages = guest.onMessage((method, params, child) => {
      const childSession = typeof params === 'object' && params !== null && 'sessionId' in params ? params.sessionId : undefined
      if (method === 'Target.attachedToTarget' && typeof childSession === 'string') this.children.set(childSession, sessionId)
      if (method === 'Target.detachedFromTarget' && typeof childSession === 'string') this.children.delete(childSession)
      this.emit(method, params, child === '' ? sessionId : child)
    })
    const stopDetach = guest.onDetach(() => { this.removed(guest) })
    const entry: AttachedGuest = { guest, sessionId, stop: () => { stopMessages(); stopDetach() } }
    this.attached.set(sessionId, entry)
    this.byGuest.set(guest, entry)
    this.emit('Target.attachedToTarget', { sessionId, targetInfo: this.targetInfo(guest), waitingForDebugger: false })
    return sessionId
  }

  private detach(entry: AttachedGuest, notify: boolean): void {
    entry.stop()
    this.attached.delete(entry.sessionId)
    this.byGuest.delete(entry.guest)
    for (const [child, owner] of this.children) if (owner === entry.sessionId) this.children.delete(child)
    entry.guest.detach()
    if (notify) this.emit('Target.detachedFromTarget', { sessionId: entry.sessionId, targetId: entry.guest.targetId })
  }

  private removed(guest: CdpGuest): void {
    const entry = this.byGuest.get(guest)
    if (entry !== undefined) this.detach(entry, true)
    if (this.discover) this.emit('Target.targetDestroyed', { targetId: guest.targetId })
  }

  private async page(sessionId: string, method: string, params: Record<string, unknown>): Promise<unknown> {
    const owner = this.attached.has(sessionId) ? sessionId : this.children.get(sessionId)
    const entry = owner === undefined ? undefined : this.attached.get(owner)
    if (entry === undefined) throw new Error('Session with given id not found.')
    return entry.guest.send(method, params, owner === sessionId ? undefined : sessionId)
  }

  private async browser(method: string, params: Record<string, unknown>): Promise<unknown> {
    switch (method) {
      case 'Browser.getVersion':
        return { protocolVersion: '1.3', product: 'Chrome/SidebarBrowser', revision: '', userAgent: '', jsVersion: '' }
      // Sidebar sessions refuse downloads and the browser outlives every client.
      case 'Browser.setDownloadBehavior':
      case 'Browser.close':
      case 'Target.activateTarget':
        return {}
      case 'Target.setDiscoverTargets':
        this.discover = params.discover === true
        if (this.discover) for (const guest of this.source.list(this.scope)) this.emit('Target.targetCreated', { targetInfo: this.targetInfo(guest) })
        return {}
      case 'Target.setAutoAttach':
        this.autoAttach = params.autoAttach === true
        if (this.autoAttach) for (const guest of this.source.list(this.scope)) this.attach(guest)
        return {}
      case 'Target.getTargets':
        return { targetInfos: this.source.list(this.scope).map(guest => this.targetInfo(guest)) }
      case 'Target.getTargetInfo':
        return params.targetId === undefined
          ? { targetInfo: { targetId: 'browser', type: 'browser', title: '', url: '', attached: true, canAccessOpener: false } }
          : { targetInfo: this.targetInfo(this.guest(params.targetId)) }
      case 'Target.getBrowserContexts':
        return { browserContextIds: [] }
      case 'Target.createTarget': {
        const guest = await this.source.open(this.scope, typeof params.url === 'string' && params.url !== '' ? params.url : 'about:blank')
        return { targetId: guest.targetId }
      }
      case 'Target.closeTarget':
        await this.source.close(this.guest(params.targetId))
        return { success: true }
      case 'Target.attachToTarget':
        return { sessionId: this.attach(this.guest(params.targetId)) }
      case 'Target.detachFromTarget': {
        const entry = typeof params.sessionId === 'string' ? this.attached.get(params.sessionId) : undefined
        if (entry !== undefined) this.detach(entry, true)
        return {}
      }
      default:
        throw new Error(`'${method}' wasn't found`)
    }
  }
}

/** @param data - one received WebSocket message. @returns its UTF-8 text. */
function frameText(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8')
  return Buffer.isBuffer(data) ? data.toString('utf8') : Buffer.from(data).toString('utf8')
}

/** A running loopback bridge endpoint. */
export interface CdpBridgeServer {
  /** WebSocket endpoint with a `{sessionId}` placeholder; it embeds the per-launch secret. */
  readonly endpoint: string
  /** @returns after every connection and the listener close. */
  close(): Promise<void>
}

/**
 * Serve the bridge on a random loopback port. A connection must name the
 * per-launch secret and a Session id in its path and must not carry an
 * `Origin` header, so pages in any browser cannot connect.
 * @param source - guests each Session scope may reach.
 * @returns the endpoint and its shutdown.
 */
export async function startCdpBridge(source: CdpGuestSource): Promise<CdpBridgeServer> {
  const secret = randomBytes(32).toString('hex')
  const prefix = `/devtools/browser/${secret}/`
  const server = createServer((_request, response) => { response.writeHead(404).end() })
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 * 1024 })
  const scopeOf = (request: IncomingMessage): string | undefined => {
    if (request.headers.origin !== undefined || request.url === undefined || !request.url.startsWith(prefix)) return undefined
    const encoded = request.url.slice(prefix.length)
    if (encoded === '' || encoded.includes('/') || encoded.includes('?')) return undefined
    try {
      return decodeURIComponent(encoded)
    } catch (_error) {
      // A malformed escape cannot name a Session.
      return undefined
    }
  }
  server.on('upgrade', (request, socket, head) => {
    const scope = scopeOf(request)
    if (scope === undefined) {
      socket.end('HTTP/1.1 403 Forbidden\r\n\r\n')
      return
    }
    sockets.handleUpgrade(request, socket, head, (client: WebSocket) => {
      const connection = new CdpBridgeConnection(source, scope, (frame) => { client.send(frame) })
      // CDP clients send text frames; a binary frame carries no request.
      client.on('message', (data: RawData, isBinary: boolean) => { if (!isBinary) void connection.receive(frameText(data)) })
      client.on('close', () => { connection.dispose() })
      client.on('error', () => { connection.dispose() })
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve() })
  })
  const { port } = server.address() as AddressInfo
  return {
    endpoint: `ws://127.0.0.1:${String(port)}${prefix}{sessionId}`,
    async close() {
      for (const client of sockets.clients) client.terminate()
      await new Promise<void>((resolve) => { sockets.close(() => { resolve() }) })
      await new Promise<void>((resolve, reject) => { server.close((error) => { if (error === undefined) resolve(); else reject(error) }) })
    },
  }
}
