/** Desktop-owned system notifications for Sessions that await the user or finish a turn. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** One localized system notification for a Session. */
export interface DesktopSessionAttentionNotice {
  /** Session the notification reports; a newer notice for the same Session replaces the older one. */
  readonly sessionId: SessionId
  /** Notification title, at most 120 characters. */
  readonly title: string
  /** Notification body, at most 300 characters. */
  readonly body: string
}

/** System notification operations exposed only to the trusted Desktop application frame. */
export interface DesktopSessionAttention {
  /**
   * Show a system notification and request window attention while the window is not focused.
   * @param notice - localized notification for one Session.
   */
  notify(this: void, notice: DesktopSessionAttentionNotice): void
  /**
   * Close the Session's shown notification, if any.
   * @param sessionId - Session whose notification is no longer current.
   */
  withdraw(this: void, sessionId: SessionId): void
  /**
   * Observe notification clicks; Desktop has already shown and focused the window.
   * @param listener - receives the clicked notification's Session.
   * @returns unsubscribe.
   */
  subscribe(this: void, listener: (sessionId: SessionId) => void): () => void
}
