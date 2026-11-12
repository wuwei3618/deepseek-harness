/** System notifications for Sessions that await the user or finish a turn, posted by the main process. */
import { app, Notification } from 'electron'
import type { DesktopSessionAttentionNotice } from '@deepseek-ai/dsh-client-ui-session-attention/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

const MAX_SESSION_ID = 256
const MAX_TITLE = 120
const MAX_BODY = 300

function boundedString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max
}

/**
 * Validate a notice received over IPC from the application renderer.
 * @param value - IPC payload.
 * @returns the notice, or absence when a field is missing, empty, or over its bound.
 */
export function parseSessionAttentionNotice(value: unknown): DesktopSessionAttentionNotice | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { sessionId, title, body } = value as Record<string, unknown>
  if (!boundedString(sessionId, MAX_SESSION_ID) || !boundedString(title, MAX_TITLE) || !boundedString(body, MAX_BODY)) return undefined
  return { sessionId: sessionId as SessionId, title, body }
}

/**
 * Validate a Session identity received over IPC.
 * @param value - IPC payload.
 * @returns the identity, or absence when it is not a bounded non-empty string.
 */
export function parseSessionAttentionId(value: unknown): SessionId | undefined {
  return boundedString(value, MAX_SESSION_ID) ? value as SessionId : undefined
}

/** Application window facts and native attention operations the notifications use. */
export interface SessionAttentionWindow {
  isFocused(): boolean
  isDestroyed(): boolean
  /** @param flag - whether the Windows taskbar button flashes. */
  flashFrame(flag: boolean): void
  /** @param event - window focus. @param listener - runs on the next focus. @returns the window. */
  once(event: 'focus', listener: () => void): unknown
  /** @param event - window focus. @param listener - listener to remove. @returns the window. */
  off(event: 'focus', listener: () => void): unknown
}

/**
 * Owns at most one shown notification per Session and the taskbar or Dock attention request.
 * Notification failures are logged and never reach the renderer: a notification is best-effort.
 */
export class DesktopSessionAttention {
  private readonly notices = new Map<SessionId, Notification>()
  private stopRequest: (() => void) | undefined

  /**
   * @param activate - shows and focuses the application window, then opens the Session.
   * @param platform - native attention implementation, replaceable for platform tests.
   */
  constructor(
    private readonly activate: (sessionId: SessionId) => void,
    private readonly platform: string = process.platform,
  ) {}

  /**
   * Replace the Session's notification and request attention while the window is not focused.
   * @param window - application window whose focus ends the attention request.
   * @param notice - validated localized notice.
   */
  notify(window: SessionAttentionWindow, notice: DesktopSessionAttentionNotice): void {
    this.withdraw(notice.sessionId)
    if (!window.isFocused()) this.request(window)
    try {
      if (!Notification.isSupported()) return
      const notification = new Notification({ title: notice.title, body: notice.body })
      this.notices.set(notice.sessionId, notification)
      const release = (): void => {
        if (this.notices.get(notice.sessionId) !== notification) return
        this.notices.delete(notice.sessionId)
        notification.removeAllListeners()
      }
      notification.on('failed', (_event, error) => {
        console.warn('desktop session attention: notification failed', error)
        release()
      })
      notification.on('close', release)
      notification.once('click', () => {
        if (this.notices.get(notice.sessionId) !== notification) return
        release()
        this.activate(notice.sessionId)
      })
      notification.show()
    } catch (error) { console.warn('desktop session attention: notification unavailable', error) }
  }

  /**
   * Close the Session's notification, if one is shown.
   * @param sessionId - Session whose notification is no longer current.
   */
  withdraw(sessionId: SessionId): void {
    const notification = this.notices.get(sessionId)
    if (notification === undefined) return
    this.notices.delete(sessionId)
    notification.removeAllListeners()
    try { notification.close() }
    catch (error) { console.warn('desktop session attention: could not close notification', error) }
  }

  /** Close every notification and end the attention request. */
  dispose(): void {
    for (const sessionId of [...this.notices.keys()]) this.withdraw(sessionId)
    this.clearRequest()
  }

  private request(window: SessionAttentionWindow): void {
    if (this.stopRequest !== undefined) return
    let bounce: number | undefined
    const clear = (): void => { this.clearRequest() }
    window.once('focus', clear)
    this.stopRequest = () => {
      window.off('focus', clear)
      if (this.platform === 'win32' && !window.isDestroyed()) window.flashFrame(false)
      if (bounce !== undefined) app.dock?.cancelBounce(bounce)
    }
    try {
      if (this.platform === 'win32') window.flashFrame(true)
      if (this.platform === 'darwin') bounce = app.dock?.bounce('informational')
    } catch (error) { console.warn('desktop session attention: attention unavailable', error) }
  }

  private clearRequest(): void {
    const stop = this.stopRequest
    this.stopRequest = undefined
    try { stop?.() }
    catch (error) { console.warn('desktop session attention: could not clear attention', error) }
  }
}
