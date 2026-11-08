/** Sidebar guests as the agent's CDP source: Session scopes, agent page requests, partitions, and data clearing. */
import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, onTestFinished, vi } from 'vitest'
import type { DesktopBrowserAgentOpenRequest, DesktopBrowserReservation } from '@deepseek-ai/dsh-client-ui-sidebar-browser/types'
import type { CdpGuest, CdpGuestListener } from '../src/browser-cdp-bridge.ts'
import { DESKTOP_IPC } from '../src/ipc.ts'

const sessions = vi.hoisted(() => new Map<string, {
  clearStorageData: () => Promise<void>
  clearCache: () => Promise<void>
  clearAuthCache: () => Promise<void>
}>())
vi.mock('electron', () => ({ app: { isPackaged: true }, session: { fromPartition: (partition: string) => {
  let entry = sessions.get(partition)
  if (entry === undefined) {
    entry = { clearStorageData: vi.fn(async () => {}), clearCache: vi.fn(async () => {}), clearAuthCache: vi.fn(async () => {}) }
    sessions.set(partition, entry)
  }
  return {
    ...entry, setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn(), setDevicePermissionHandler: vi.fn(),
    setDisplayMediaRequestHandler: vi.fn(), on: vi.fn(), webRequest: { onBeforeRequest: vi.fn() },
  }
} } }))
const { DesktopBrowserGuests } = await import('../src/browser-guests.ts')
afterEach(() => { sessions.clear(); vi.useRealTimers() })

// Electron is substituted at module load; fixtures implement the native members these paths exercise.
type GuestsFixture = Omit<InstanceType<typeof DesktopBrowserGuests>, 'acquire' | 'bind'> & {
  acquire(owner: object, workspace: unknown, sessionId?: unknown, agentRequest?: unknown): DesktopBrowserReservation
  bind(window: object, attachInput: () => () => void): void
}

function fixture() {
  const owner = Object.assign(new EventEmitter(), { isDestroyed: () => false, send: vi.fn() })
  const guests = new DesktopBrowserGuests(() => 'http://127.0.0.1:4000/') as GuestsFixture
  guests.bind({ webContents: owner }, () => () => {})
  let targets = 0
  const attachGuest = (reservation: DesktopBrowserReservation, debuggerTaken = false) => {
    const debug = Object.assign(new EventEmitter(), {
      attached: false,
      isAttached() { return this.attached },
      attach: vi.fn(function (this: { attached: boolean }) {
        if (debuggerTaken) throw new Error('Another debugger is already attached')
        this.attached = true
      }),
      detach: vi.fn(function (this: { attached: boolean }) { this.attached = false }),
      sendCommand: vi.fn(async (method: string) => method === 'Target.getTargetInfo'
        ? { targetInfo: { targetId: `target-${String(++targets)}` } } : { method }),
    })
    let destroyed = false
    const guest = Object.assign(new EventEmitter(), {
      debugger: debug, getURL: () => `about:blank#${reservation.lease}`, getTitle: () => '', isDestroyed: () => destroyed,
      setWindowOpenHandler: vi.fn(), close: vi.fn(() => { destroyed = true; guest.emit('destroyed') }),
    })
    owner.emit('will-attach-webview', { preventDefault: vi.fn() }, {}, { src: `about:blank#${reservation.lease}`, partition: reservation.partition })
    owner.emit('did-attach-webview', {}, guest)
    guest.emit('dom-ready')
    onTestFinished(() => { if (!destroyed) guest.close() })
    return guest
  }
  const listen = (scope: string) => {
    const events: [string, CdpGuest][] = []
    const listener: CdpGuestListener = { added: (guest) => { events.push(['added', guest]) }, removed: (guest) => { events.push(['removed', guest]) } }
    return { events, stop: guests.subscribe(scope, listener) }
  }
  return { owner, guests, attachGuest, listen }
}

it('exposes each attached guest only in the scope of the Session that holds it', async () => {
  const f = fixture()
  const a = f.listen('session-a')
  const guest = f.attachGuest(f.guests.acquire(f.owner, 'cwd:/work', 'session-a'))
  await vi.waitFor(() => { expect(f.guests.list('session-a')).toHaveLength(1) })
  f.attachGuest(f.guests.acquire(f.owner, 'cwd:/work'))
  f.attachGuest(f.guests.acquire(f.owner, 'cwd:/work', 'session-b'), true)
  await Promise.resolve()
  expect(f.guests.list('session-b')).toEqual([])
  const [exposed] = f.guests.list('session-a')
  expect(exposed?.targetId).toBe('target-1')
  expect(exposed?.info()).toEqual({ url: `about:blank#${guest.getURL().slice('about:blank#'.length)}`, title: '' })
  expect(guest.debugger.isAttached()).toBe(false)
  expect(a.events).toEqual([['added', exposed]])

  exposed?.attach()
  exposed?.attach()
  expect(guest.debugger.attach).toHaveBeenCalledTimes(2)
  await expect(exposed?.send('Page.navigate', { url: 'https://example.test/' }, 'CHILD')).resolves.toEqual({ method: 'Page.navigate' })
  expect(guest.debugger.sendCommand).toHaveBeenLastCalledWith('Page.navigate', { url: 'https://example.test/' }, 'CHILD')
  const messages = vi.fn()
  const detaches = vi.fn()
  const stopMessages = exposed!.onMessage(messages)
  const stopDetach = exposed!.onDetach(detaches)
  guest.debugger.emit('message', {}, 'Page.loadEventFired', { timestamp: 1 }, '')
  expect(messages).toHaveBeenCalledWith('Page.loadEventFired', { timestamp: 1 }, '')
  exposed?.detach()
  expect(detaches).not.toHaveBeenCalled()
  exposed?.detach()
  guest.debugger.emit('detach')
  expect(detaches).toHaveBeenCalledOnce()
  stopMessages()
  stopDetach()

  await f.guests.close(exposed!)
  expect(f.guests.list('session-a')).toEqual([])
  expect(a.events.at(-1)).toEqual(['removed', exposed])
  expect(exposed?.info()).toEqual({ url: 'about:blank', title: '' })
  await f.guests.close(exposed!)
  a.stop()
})

it('asks the window to open an agent page and resolves with the guest that answers the request', async () => {
  const f = fixture()
  const opened = f.guests.open('session-a', 'https://example.test/path')
  const request = f.owner.send.mock.calls.at(-1)?.[1] as DesktopBrowserAgentOpenRequest
  expect(f.owner.send).toHaveBeenLastCalledWith(DESKTOP_IPC.browserAgentOpenRequested,
    { id: request.id, sessionId: 'session-a', url: 'https://example.test/path' })
  expect(() => f.guests.acquire(f.owner, 'cwd:/work', 'session-a', 'forged')).toThrow('unknown agent page request')
  f.attachGuest(f.guests.acquire(f.owner, 'cwd:/work', 'session-a', request.id))
  const guest = await opened
  expect(f.guests.list('session-a')).toEqual([guest])
  expect(() => f.guests.acquire(f.owner, 'cwd:/work', 'session-a', request.id)).toThrow('unknown agent page request')

  const blank = f.guests.open('session-a', 'about:blank')
  const blankRequest = f.owner.send.mock.calls.at(-1)?.[1] as DesktopBrowserAgentOpenRequest
  expect(blankRequest).toMatchObject({ sessionId: 'session-a', url: undefined })
  f.attachGuest(f.guests.acquire(f.owner, 'cwd:/work', 'session-a', blankRequest.id))
  const blankGuest = await blank
  expect(f.guests.list('session-a')).toEqual([guest, blankGuest])
  await expect(f.guests.open('session-a', 'http://localhost:4000/')).rejects.toThrow('cannot open http://localhost:4000/')
  await expect(f.guests.open('session-a', 'file:///etc/passwd')).rejects.toThrow('cannot open file:///etc/passwd')
})

it('fails an agent page request that no Sidebar answers in time', async () => {
  vi.useFakeTimers()
  const f = fixture()
  const opened = f.guests.open('session-a', 'https://example.test/')
  const request = f.owner.send.mock.calls.at(-1)?.[1] as DesktopBrowserAgentOpenRequest
  const failure = expect(opened).rejects.toThrow('The Sidebar did not open the page')
  await vi.advanceTimersByTimeAsync(20_000)
  await failure
  expect(() => f.guests.acquire(f.owner, 'cwd:/work', 'session-a', request.id)).toThrow('unknown agent page request')
})

it('refuses agent pages without an application window and invalid Session identities', async () => {
  const guests = new DesktopBrowserGuests(() => undefined) as GuestsFixture
  await expect(guests.open('session-a', 'https://example.test/')).rejects.toThrow('The application window is not open.')
  expect(() => guests.acquire({}, 'cwd:/work', '')).toThrow('invalid Session identity')
  expect(() => guests.acquire({}, 'cwd:/work', 7)).toThrow('invalid Session identity')
})

it('persists workspace partitions by a key digest and clears every Sidebar partition on disk', async () => {
  const f = fixture()
  const first = f.guests.acquire(f.owner, 'cwd:/work')
  expect(first.partition).toMatch(/^persist:dsh-sidebar-browser-[0-9a-f]{32}$/)
  expect(f.guests.acquire(f.owner, 'cwd:/work').partition).toBe(first.partition)
  expect((new DesktopBrowserGuests(() => undefined) as GuestsFixture).acquire(f.owner, 'cwd:/work').partition).toBe(first.partition)
  expect(f.guests.acquire(f.owner, 'cwd:/other').partition).not.toBe(first.partition)
  const ungrouped = f.guests.acquire(f.owner, 'session:abc').partition
  expect(ungrouped).toMatch(/^dsh-sidebar-browser-[0-9a-f-]{36}$/)

  const root = await mkdtemp(join(tmpdir(), 'dsh-partitions-'))
  onTestFinished(async () => { await rm(root, { recursive: true, force: true }) })
  await mkdir(join(root, 'dsh-sidebar-browser-earlier'))
  await mkdir(join(root, 'unrelated'))
  await f.guests.clearBrowsingData(root)
  for (const partition of [first.partition, ungrouped, 'persist:dsh-sidebar-browser-earlier']) {
    const entry = sessions.get(partition)
    expect(entry?.clearStorageData).toHaveBeenCalledOnce()
    expect(entry?.clearCache).toHaveBeenCalledOnce()
    expect(entry?.clearAuthCache).toHaveBeenCalledOnce()
  }
  expect(sessions.has('persist:unrelated')).toBe(false)
  await new DesktopBrowserGuests(() => undefined).clearBrowsingData(join(root, 'missing'))
})
