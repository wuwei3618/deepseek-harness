import { EventEmitter } from 'node:events'
import { afterEach, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { DesktopSessionAttention, parseSessionAttentionId, parseSessionAttentionNotice } from '../src/session-attention.ts'

const native = await vi.hoisted(async () => {
  const { EventEmitter } = await import('node:events')
  const notices: Notice[] = []
  class Notice extends EventEmitter {
    static isSupported = vi.fn(() => true)
    show = vi.fn()
    close = vi.fn()
    constructor(readonly options: unknown) { super(); notices.push(this) }
  }
  return { notices, Notice, dock: { bounce: vi.fn(() => 17), cancelBounce: vi.fn() } }
})
vi.mock('electron', () => ({ Notification: native.Notice, app: { dock: native.dock } }))

const A = 'session-a' as SessionId
const B = 'session-b' as SessionId
let attention: DesktopSessionAttention | undefined
afterEach(() => { attention?.dispose(); native.notices.length = 0; vi.clearAllMocks(); native.Notice.isSupported.mockReturnValue(true) })

function setup(platform: string, focused = false) {
  const window = Object.assign(new EventEmitter(), { focused, isFocused() { return this.focused },
    isDestroyed: () => false, flashFrame: vi.fn() })
  const activate = vi.fn()
  attention = new DesktopSessionAttention(activate, platform)
  const notify = (sessionId: SessionId, body = 'body') => {
    attention!.notify(window, { sessionId, title: 'title', body })
  }
  return { window, activate, notify }
}

it('accepts only bounded non-empty notice fields from the renderer', () => {
  expect(parseSessionAttentionNotice({ sessionId: 'a', title: 't', body: 'b', extra: 1 })).toEqual({ sessionId: 'a', title: 't', body: 'b' })
  for (const value of [null, 'x', { sessionId: 'a', title: '', body: 'b' }, { sessionId: 'a', title: 't' },
    { sessionId: 'a', title: 'x'.repeat(121), body: 'b' }, { sessionId: 'a', title: 't', body: 'x'.repeat(301) },
    { sessionId: 'x'.repeat(257), title: 't', body: 'b' }]) {
    expect(parseSessionAttentionNotice(value)).toBeUndefined()
  }
  expect(parseSessionAttentionId('a')).toBe('a')
  expect(parseSessionAttentionId(3)).toBeUndefined()
})

it.each(['win32', 'darwin'])('shows a sounding notification, requests attention once, and opens the Session on click: %s', (platform) => {
  const f = setup(platform)
  f.notify(A)
  f.notify(B)
  expect(native.notices).toHaveLength(2)
  expect(native.notices[0]!.options).toEqual({ title: 'title', body: 'body' })
  expect(native.notices[0]!.show).toHaveBeenCalledOnce()
  if (platform === 'win32') expect(f.window.flashFrame).toHaveBeenCalledTimes(1)
  else expect(native.dock.bounce).toHaveBeenCalledTimes(1)
  native.notices[1]!.emit('click')
  expect(f.activate).toHaveBeenCalledWith(B)
  native.notices[1]!.emit('click')
  expect(f.activate).toHaveBeenCalledOnce()
  f.window.emit('focus')
  if (platform === 'win32') expect(f.window.flashFrame).toHaveBeenLastCalledWith(false)
  else expect(native.dock.cancelBounce).toHaveBeenCalledWith(17)
  expect(f.window.listenerCount('focus')).toBe(0)
})

it('replaces and withdraws per Session and ignores clicks on replaced notifications', () => {
  const f = setup('win32', true)
  f.notify(A, 'first')
  f.notify(A, 'second')
  expect(f.window.flashFrame).not.toHaveBeenCalled()
  expect(native.notices[0]!.close).toHaveBeenCalledOnce()
  native.notices[0]!.emit('click')
  expect(f.activate).not.toHaveBeenCalled()
  attention!.withdraw(A)
  expect(native.notices[1]!.close).toHaveBeenCalledOnce()
  attention!.withdraw(A)
  expect(native.notices[1]!.close).toHaveBeenCalledOnce()
})

it('forgets closed or failed notifications and tolerates platforms without notification support', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const f = setup('linux')
  f.notify(A)
  native.notices[0]!.emit('close')
  attention!.withdraw(A)
  expect(native.notices[0]!.close).not.toHaveBeenCalled()
  f.notify(B)
  native.notices[1]!.emit('failed', {}, 'denied')
  expect(warn).toHaveBeenCalledWith('desktop session attention: notification failed', 'denied')
  attention!.withdraw(B)
  expect(native.notices[1]!.close).not.toHaveBeenCalled()
  native.Notice.isSupported.mockReturnValue(false)
  f.notify(A)
  expect(native.notices).toHaveLength(2)
  warn.mockRestore()
})

it('closes every notification and ends the attention request on disposal', () => {
  const f = setup('darwin')
  f.notify(A)
  f.notify(B)
  attention!.dispose()
  expect(native.notices.every(notice => notice.close.mock.calls.length === 1)).toBe(true)
  expect(native.dock.cancelBounce).toHaveBeenCalledWith(17)
  expect(f.window.listenerCount('focus')).toBe(0)
})
