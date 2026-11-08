/** Browser-level CDP emulation over scoped Sidebar guests and its loopback endpoint admission. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import WebSocket from 'ws'
import { CdpBridgeConnection, startCdpBridge, type CdpBridgeServer, type CdpGuest, type CdpGuestListener, type CdpGuestSource } from '../src/browser-cdp-bridge.ts'

type Message = (method: string, params: unknown, childSessionId: string) => void

function fakeGuest(targetId: string, url = `https://${targetId}.test/`) {
  const messages = new Set<Message>()
  const detaches = new Set<() => void>()
  const guest = {
    targetId,
    info: () => ({ url, title: targetId }),
    attach: vi.fn(),
    detach: vi.fn(),
    send: vi.fn(async (method: string, _params: Record<string, unknown>, child?: string) => ({ method, child })),
    onMessage: (listener: Message) => { messages.add(listener); return () => { messages.delete(listener) } },
    onDetach: (listener: () => void) => { detaches.add(listener); return () => { detaches.delete(listener) } },
    emit: (method: string, params: unknown, child = '') => { for (const listener of messages) listener(method, params, child) },
    lose: () => { for (const listener of detaches) listener() },
    listeners: () => messages.size + detaches.size,
  } satisfies CdpGuest & Record<string, unknown>
  return guest
}

function fakeSource(scopes: Record<string, CdpGuest[]>) {
  const listeners = new Map<string, Set<CdpGuestListener>>()
  const source = {
    list: (scope: string) => scopes[scope] ?? [],
    subscribe: vi.fn((scope: string, listener: CdpGuestListener) => {
      const set = listeners.get(scope) ?? new Set()
      listeners.set(scope, set)
      set.add(listener)
      return () => { set.delete(listener) }
    }),
    open: vi.fn(async (scope: string, url: string) => {
      const guest = fakeGuest(`opened-${String((scopes[scope] ??= []).length)}`, url)
      scopes[scope].push(guest)
      for (const listener of listeners.get(scope) ?? []) listener.added(guest)
      return guest
    }),
    close: vi.fn(async (guest: CdpGuest) => {
      for (const [scope, guests] of Object.entries(scopes)) {
        const index = guests.indexOf(guest)
        if (index === -1) continue
        guests.splice(index, 1)
        for (const listener of listeners.get(scope) ?? []) listener.removed(guest)
      }
    }),
    subscribers: (scope: string) => listeners.get(scope)?.size ?? 0,
  } satisfies CdpGuestSource & Record<string, unknown>
  return source
}

function connect(source: CdpGuestSource, scope = 'session-a') {
  const frames: Record<string, unknown>[] = []
  const connection = new CdpBridgeConnection(source, scope, (frame) => { frames.push(JSON.parse(frame) as Record<string, unknown>) })
  let id = 0
  const call = async (method: string, params: Record<string, unknown> = {}, sessionId?: string) => {
    const request = ++id
    await connection.receive(JSON.stringify({ id: request, method, params, ...sessionId === undefined ? {} : { sessionId } }))
    return frames.find(frame => frame.id === request)
  }
  return { connection, frames, call, events: (method: string) => frames.filter(frame => frame.method === method) }
}

describe('CdpBridgeConnection', () => {
  it('lists, discovers, and auto-attaches only the guests of its own scope', async () => {
    const mine = fakeGuest('mine')
    const other = fakeGuest('other')
    const h = connect(fakeSource({ 'session-a': [mine], 'session-b': [other] }))
    expect(await h.call('Target.getTargets')).toMatchObject({ result: { targetInfos: [
      { targetId: 'mine', type: 'page', url: 'https://mine.test/', attached: false, browserContextId: 'dsh-sidebar' },
    ] } })
    await h.call('Target.setDiscoverTargets', { discover: true })
    expect(h.events('Target.targetCreated').map(frame => (frame.params as { targetInfo: { targetId: string } }).targetInfo.targetId)).toEqual(['mine'])
    await h.call('Target.setAutoAttach', { autoAttach: true, flatten: true })
    expect(mine.attach).toHaveBeenCalledOnce()
    expect(other.attach).not.toHaveBeenCalled()
    const [attached] = h.events('Target.attachedToTarget')
    expect(attached?.params).toMatchObject({ targetInfo: { targetId: 'mine', attached: true }, waitingForDebugger: false })
    const sessionId = (attached?.params as { sessionId: string }).sessionId
    expect(await h.call('Target.attachToTarget', { targetId: 'mine', flatten: true })).toMatchObject({ result: { sessionId } })
    expect(await h.call('Target.attachToTarget', { targetId: 'other' })).toMatchObject({ error: { message: 'No target with given id found' } })
    expect(await h.call('Target.getTargetInfo', { targetId: 'other' })).toMatchObject({ error: { message: 'No target with given id found' } })
    expect(await h.call('Target.getTargetInfo')).toMatchObject({ result: { targetInfo: { type: 'browser' } } })
    expect(await h.call('Target.getTargetInfo', { targetId: 'mine' })).toMatchObject({ result: { targetInfo: { targetId: 'mine', attached: true } } })
  })

  it('forwards page and child session commands and events to the owning guest', async () => {
    const guest = fakeGuest('page')
    const h = connect(fakeSource({ 'session-a': [guest] }))
    const sessionId = (await h.call('Target.attachToTarget', { targetId: 'page' }))?.result as { sessionId: string }
    expect(await h.call('Runtime.evaluate', { expression: '1' }, sessionId.sessionId))
      .toMatchObject({ sessionId: sessionId.sessionId, result: { method: 'Runtime.evaluate' } })
    expect(guest.send).toHaveBeenLastCalledWith('Runtime.evaluate', { expression: '1' }, undefined)
    guest.emit('Page.loadEventFired', { timestamp: 1 })
    expect(h.events('Page.loadEventFired')).toEqual([{ method: 'Page.loadEventFired', params: { timestamp: 1 }, sessionId: sessionId.sessionId }])
    guest.emit('Target.attachedToTarget', { sessionId: 'CHILD', targetInfo: { type: 'iframe' } })
    expect(await h.call('DOM.enable', {}, 'CHILD')).toMatchObject({ sessionId: 'CHILD', result: { child: 'CHILD' } })
    guest.emit('Network.requestWillBeSent', {}, 'CHILD')
    expect(h.events('Network.requestWillBeSent')).toEqual([{ method: 'Network.requestWillBeSent', params: {}, sessionId: 'CHILD' }])
    guest.emit('Target.detachedFromTarget', { sessionId: 'CHILD' })
    expect(await h.call('DOM.enable', {}, 'CHILD')).toMatchObject({ error: { message: 'Session with given id not found.' } })
    guest.send.mockRejectedValueOnce(new Error('Cannot find context'))
    expect(await h.call('Runtime.evaluate', {}, sessionId.sessionId)).toMatchObject({ error: { code: -32000, message: 'Cannot find context' } })
    await h.call('Target.detachFromTarget', { sessionId: sessionId.sessionId })
    expect(guest.detach).toHaveBeenCalledOnce()
    expect(guest.listeners()).toBe(0)
    expect(h.events('Target.detachedFromTarget').at(-1)?.params).toEqual({ sessionId: sessionId.sessionId, targetId: 'page' })
    expect(await h.call('Runtime.evaluate', {}, sessionId.sessionId)).toMatchObject({ error: { message: 'Session with given id not found.' } })
  })

  it('opens, closes, and loses pages through the scope source', async () => {
    const source = fakeSource({ 'session-a': [] })
    const h = connect(source)
    await h.call('Target.setDiscoverTargets', { discover: true })
    await h.call('Target.setAutoAttach', { autoAttach: true })
    expect(await h.call('Target.createTarget', { url: '' })).toMatchObject({ result: { targetId: 'opened-0' } })
    expect(source.open).toHaveBeenLastCalledWith('session-a', 'about:blank')
    await h.call('Target.createTarget', { url: 'https://example.test/' })
    expect(source.open).toHaveBeenLastCalledWith('session-a', 'https://example.test/')
    expect(h.events('Target.attachedToTarget')).toHaveLength(2)
    expect(await h.call('Target.closeTarget', { targetId: 'opened-0' })).toMatchObject({ result: { success: true } })
    expect(h.events('Target.targetDestroyed').map(frame => frame.params)).toEqual([{ targetId: 'opened-0' }])
    const lost = source.list('session-a')[0] as ReturnType<typeof fakeGuest>
    lost.lose()
    expect(h.events('Target.detachedFromTarget')).toHaveLength(2)
    source.open.mockRejectedValueOnce(new Error('The application window is not open.'))
    expect(await h.call('Target.createTarget', {})).toMatchObject({ error: { message: 'The application window is not open.' } })
  })

  it('answers the browser commands Playwright sends and rejects every other browser command', async () => {
    const h = connect(fakeSource({}))
    expect(await h.call('Browser.getVersion')).toMatchObject({ result: { protocolVersion: '1.3' } })
    for (const method of ['Browser.setDownloadBehavior', 'Browser.close', 'Target.activateTarget', 'Target.detachFromTarget']) {
      expect(await h.call(method)).toMatchObject({ result: {} })
    }
    expect(await h.call('Target.getBrowserContexts')).toMatchObject({ result: { browserContextIds: [] } })
    expect(await h.call('Target.createBrowserContext')).toMatchObject({ error: { message: "'Target.createBrowserContext' wasn't found" } })
    expect(await h.call('SystemInfo.getProcessInfo')).toMatchObject({ error: { code: -32000 } })
  })

  it('ignores malformed frames and stops all traffic once disposed', async () => {
    const guest = fakeGuest('page')
    const source = fakeSource({ 'session-a': [guest] })
    const h = connect(source)
    for (const frame of ['not json', 'null', '{"method":"Browser.getVersion"}', '{"id":1}', '{"id":1,"method":"Browser.getVersion","sessionId":2}']) {
      await h.connection.receive(frame)
    }
    expect(h.frames).toEqual([])
    expect(await h.call('Browser.getVersion', [] as never)).toMatchObject({ result: { protocolVersion: '1.3' } })
    await h.call('Target.attachToTarget', { targetId: 'page' })
    h.connection.dispose()
    h.connection.dispose()
    expect(guest.detach).toHaveBeenCalledOnce()
    expect(source.subscribers('session-a')).toBe(0)
    const count = h.frames.length
    await h.connection.receive(JSON.stringify({ id: 99, method: 'Browser.getVersion' }))
    expect(h.frames).toHaveLength(count)
  })
})

describe('startCdpBridge', () => {
  let bridge: CdpBridgeServer | undefined
  afterEach(async () => { await bridge?.close(); bridge = undefined })

  function open(url: string, headers: Record<string, string> = {}) {
    const socket = new WebSocket(url, { headers })
    return new Promise<WebSocket>((resolve, reject) => {
      socket.once('open', () => { resolve(socket) })
      socket.once('error', reject)
      socket.once('unexpected-response', (_request, response) => { reject(new Error(`HTTP ${String(response.statusCode)}`)) })
    })
  }

  it('serves one scope per path behind the per-launch secret and refuses browser pages', async () => {
    const source = fakeSource({ 'session/a': [fakeGuest('mine')] })
    bridge = await startCdpBridge(source)
    expect(bridge.endpoint).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[0-9a-f]{64}\/\{sessionId\}$/)
    const url = bridge.endpoint.replace('{sessionId}', encodeURIComponent('session/a'))
    const socket = await open(url)
    const reply = new Promise<string>((resolve) => { socket.once('message', (data: Buffer) => { resolve(data.toString('utf8')) }) })
    socket.send(Buffer.from(JSON.stringify({ id: 0, method: 'Browser.getVersion' })), { binary: true })
    socket.send(JSON.stringify({ id: 1, method: 'Target.getTargets' }))
    expect(JSON.parse(await reply)).toMatchObject({ id: 1, result: { targetInfos: [{ targetId: 'mine' }] } })
    expect(source.subscribe).toHaveBeenCalledWith('session/a', expect.anything())
    const closed = new Promise<void>((resolve) => { socket.once('close', () => { resolve() }) })
    socket.close()
    await closed
    await vi.waitFor(() => { expect(source.subscribers('session/a')).toBe(0) })

    const base = bridge.endpoint.replace('{sessionId}', '')
    await expect(open(url, { Origin: 'https://attacker.test' })).rejects.toThrow('HTTP 403')
    await expect(open(url.replace(/[0-9a-f]{64}/, '0'.repeat(64)))).rejects.toThrow('HTTP 403')
    await expect(open(base)).rejects.toThrow('HTTP 403')
    await expect(open(`${base}a/b`)).rejects.toThrow('HTTP 403')
    await expect(open(`${base}a?x=1`)).rejects.toThrow('HTTP 403')
    await expect(open(`${base}%E0%A4%A`)).rejects.toThrow('HTTP 403')
    const response = await fetch(bridge.endpoint.replace('ws:', 'http:').replace('{sessionId}', 'x'))
    expect(response.status).toBe(404)
  })

  it('terminates open clients when it closes', async () => {
    const source = fakeSource({})
    bridge = await startCdpBridge(source)
    const socket = await open(bridge.endpoint.replace('{sessionId}', 's'))
    const closed = new Promise<void>((resolve) => { socket.once('close', () => { resolve() }) })
    await bridge.close()
    bridge = undefined
    await closed
    await vi.waitFor(() => { expect(source.subscribers('s')).toBe(0) })
  })
})
