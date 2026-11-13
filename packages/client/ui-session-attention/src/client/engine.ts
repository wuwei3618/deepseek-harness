/** Notification decisions derived from Session status, the Session list, and window focus. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session-status/client'
import type { SessionAttentionSettings } from '../settings.ts'

/** Why a Session needs the user, from its pending-interaction kind. */
export type AttentionReason = 'question' | 'approval' | 'plan-review' | 'other'

/** One notification or withdrawal for the Desktop bridge. */
export type AttentionAction =
  | { readonly type: 'attention'; readonly sessionId: SessionId; readonly reason: AttentionReason }
  | { readonly type: 'completion'; readonly sessionId: SessionId }
  | { readonly type: 'withdraw'; readonly sessionId: SessionId }

interface Tracked {
  readonly running: boolean | undefined
  readonly pendingKey: string | undefined
}

function reasonOf(kind: string): AttentionReason {
  if (kind === 'question' || kind === 'approval' || kind === 'plan-review') return kind
  return 'other'
}

/**
 * Decides which Session changes produce notifications.
 *
 * The first non-empty status snapshot only records baselines, so a reload never repeats
 * notifications for state that already existed. A Session on screen while the window has
 * focus never notifies; an attention request withheld for that reason notifies when the
 * window loses focus while the request is still open. Subagent Sessions never notify.
 */
export class AttentionEngine {
  private readonly tracked = new Map<SessionId, Tracked>()
  private readonly open = new Map<SessionId, { readonly key: string; readonly reason: AttentionReason }>()
  private readonly delivered = new Set<string>()
  private readonly shown = new Set<SessionId>()
  private list: SessionListState | undefined
  private seeded = false
  private focused: boolean

  /**
   * @param settings - current notification preferences.
   * @param focused - whether the application window has focus at construction.
   */
  constructor(private readonly settings: () => SessionAttentionSettings, focused: boolean) {
    this.focused = focused
  }

  /**
   * Record the latest Session list and withdraw notifications of Sessions now on screen.
   * @param list - Session list snapshot carrying titles, origins, and main-view retention.
   * @returns withdrawals for Sessions the user is now looking at.
   */
  onList(list: SessionListState): AttentionAction[] {
    this.list = list
    return this.withdrawVisible()
  }

  /**
   * Derive notifications from a Session status snapshot.
   * @param snapshot - current status of every known Session.
   * @returns notifications and withdrawals in Session order.
   */
  onStatus(snapshot: SessionStatusSnapshot): AttentionAction[] {
    const actions: AttentionAction[] = []
    for (const [sessionId, status] of snapshot) {
      const previous = this.tracked.get(sessionId)
      const pending = status.pendingInteraction
      if (previous?.pendingKey !== undefined && previous.pendingKey !== pending?.key) {
        this.delivered.delete(previous.pendingKey)
        this.open.delete(sessionId)
        actions.push(...this.withdraw(sessionId))
      }
      if (pending !== undefined) {
        const reason = reasonOf(pending.kind)
        this.open.set(sessionId, { key: pending.key, reason })
        if (!this.seeded) this.delivered.add(pending.key)
        else if (!this.delivered.has(pending.key) && this.allows(sessionId, 'attention')) {
          this.delivered.add(pending.key)
          actions.push(this.notify({ type: 'attention', sessionId, reason }))
        }
      }
      if (this.seeded && previous?.running === true && status.running === false && pending === undefined
        && this.allows(sessionId, 'completion')) {
        actions.push(this.notify({ type: 'completion', sessionId }))
      }
      this.tracked.set(sessionId, { running: status.running, pendingKey: pending?.key })
    }
    for (const sessionId of [...this.tracked.keys()]) {
      if (snapshot.has(sessionId)) continue
      const gone = this.tracked.get(sessionId)
      if (gone?.pendingKey !== undefined) this.delivered.delete(gone.pendingKey)
      this.tracked.delete(sessionId)
      this.open.delete(sessionId)
      actions.push(...this.withdraw(sessionId))
    }
    if (snapshot.size > 0) this.seeded = true
    return actions
  }

  /**
   * Record a window focus change.
   * @param focused - whether the application window now has focus.
   * @returns withdrawals for on-screen Sessions when focus returns, or the attention
   * notifications withheld while those Sessions were on screen when focus leaves.
   */
  onFocus(focused: boolean): AttentionAction[] {
    this.focused = focused
    if (focused) return this.withdrawVisible()
    const actions: AttentionAction[] = []
    for (const [sessionId, request] of this.open) {
      if (this.delivered.has(request.key) || !this.allows(sessionId, 'attention')) continue
      this.delivered.add(request.key)
      actions.push(this.notify({ type: 'attention', sessionId, reason: request.reason }))
    }
    return actions
  }

  /**
   * Read the label a notification shows for a Session.
   * @param sessionId - Session to label.
   * @returns the Session's display title, or absence while the list has no row for it.
   */
  title(sessionId: SessionId): string | undefined {
    return this.list?.byId[sessionId]?.displayTitle
  }

  private allows(sessionId: SessionId, preference: keyof SessionAttentionSettings): boolean {
    if (!this.settings()[preference]) return false
    if (this.list?.byId[sessionId]?.origin === 'subagent') return false
    return !(this.focused && this.visible(sessionId))
  }

  private visible(sessionId: SessionId): boolean {
    return (this.list?.byId[sessionId]?.retainedBy.mainView ?? 0) > 0
  }

  private notify(action: AttentionAction): AttentionAction {
    this.shown.add(action.sessionId)
    return action
  }

  private withdraw(sessionId: SessionId): AttentionAction[] {
    if (!this.shown.delete(sessionId)) return []
    return [{ type: 'withdraw', sessionId }]
  }

  private withdrawVisible(): AttentionAction[] {
    if (!this.focused) return []
    return [...this.shown].filter(sessionId => this.visible(sessionId)).flatMap(sessionId => this.withdraw(sessionId))
  }
}
