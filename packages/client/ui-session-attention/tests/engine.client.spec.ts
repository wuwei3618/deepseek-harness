/** Which Session changes notify, and when shown notifications are withdrawn. */
import { describe, expect, it } from 'vitest'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionPendingInteraction } from '@deepseek-ai/dsh-client-ui-session/client'
import type { SessionStatus } from '@deepseek-ai/dsh-client-ui-session-status/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { AttentionEngine } from '../src/client/engine.ts'
import type { SessionAttentionSettings } from '../src/settings.ts'

const A = 'session-a' as SessionId
const B = 'session-b' as SessionId

function row(id: SessionId, extra: Partial<SessionSummary> = {}): SessionSummary {
  return { id, displayTitle: `title ${id}`, running: false, retainedBy: {}, blank: false, updatedAt: 0, ...extra }
}

function list(...rows: SessionSummary[]): SessionListState {
  return { ids: rows.map(r => r.id), byId: Object.fromEntries(rows.map(r => [r.id, r])), phase: 'ready', projectionsBySession: {} }
}

function status(running: boolean | undefined, pending?: { key: string; kind: string; sessionId: SessionId }): SessionStatus {
  return { running, pendingInteraction: pending as SessionPendingInteraction | undefined, completionUnread: false, completionFailed: false }
}

function setup(focused = false, settings: SessionAttentionSettings = { attention: true, completion: true }) {
  const preferences = { ...settings }
  const engine = new AttentionEngine(() => preferences, focused)
  return { engine, preferences }
}

describe('AttentionEngine', () => {
  it('records the first snapshot as a baseline, then notifies new requests and finished turns', () => {
    const { engine } = setup()
    engine.onList(list(row(A), row(B)))
    expect(engine.onStatus(new Map([[A, status(true, { key: 'q1', kind: 'question', sessionId: A })], [B, status(true)]]))).toEqual([])
    expect(engine.onStatus(new Map([
      [A, status(true, { key: 'q2', kind: 'approval', sessionId: A })],
      [B, status(false)],
    ]))).toEqual([
      { type: 'attention', sessionId: A, reason: 'approval' },
      { type: 'completion', sessionId: B },
    ])
    expect(engine.title(A)).toBe('title session-a')
  })

  it('maps pending-interaction kinds to reasons and notifies each request once', () => {
    const { engine } = setup()
    engine.onList(list(row(A)))
    engine.onStatus(new Map([[A, status(true)]]))
    const pending = (key: string, kind: string) => new Map([[A, status(true, { key, kind, sessionId: A })]])
    expect(engine.onStatus(pending('k1', 'plan-review'))).toEqual([{ type: 'attention', sessionId: A, reason: 'plan-review' }])
    expect(engine.onStatus(pending('k1', 'plan-review'))).toEqual([])
    expect(engine.onStatus(pending('k2', 'question'))).toEqual([
      { type: 'withdraw', sessionId: A },
      { type: 'attention', sessionId: A, reason: 'question' },
    ])
    expect(engine.onStatus(pending('k3', 'custom'))).toContainEqual({ type: 'attention', sessionId: A, reason: 'other' })
  })

  it('withdraws an answered request and does not report a stop that ends in a new request as completion', () => {
    const { engine } = setup()
    engine.onList(list(row(A)))
    engine.onStatus(new Map([[A, status(true)]]))
    expect(engine.onStatus(new Map([[A, status(false, { key: 'q', kind: 'question', sessionId: A })]])))
      .toEqual([{ type: 'attention', sessionId: A, reason: 'question' }])
    expect(engine.onStatus(new Map([[A, status(true)]]))).toEqual([{ type: 'withdraw', sessionId: A }])
    expect(engine.onStatus(new Map([[A, status(false)]]))).toEqual([{ type: 'completion', sessionId: A }])
    expect(engine.onStatus(new Map())).toEqual([{ type: 'withdraw', sessionId: A }])
  })

  it('forgets a request whose Session leaves the snapshot, so a returning Session notifies again', () => {
    const { engine } = setup()
    engine.onList(list(row(A), row(B)))
    engine.onStatus(new Map([[B, status(true)]]))
    const open = new Map([[A, status(false, { key: 'q', kind: 'question', sessionId: A })], [B, status(true)]])
    expect(engine.onStatus(open)).toEqual([{ type: 'attention', sessionId: A, reason: 'question' }])
    expect(engine.onStatus(new Map([[B, status(true)]]))).toEqual([{ type: 'withdraw', sessionId: A }])
    expect(engine.onStatus(open)).toEqual([{ type: 'attention', sessionId: A, reason: 'question' }])
  })

  it('stays silent for the on-screen Session while focused and replays its open request on blur', () => {
    const { engine } = setup(true)
    engine.onList(list(row(A, { retainedBy: { mainView: 1 } }), row(B)))
    engine.onStatus(new Map([[A, status(true)], [B, status(true)]]))
    expect(engine.onStatus(new Map([
      [A, status(true, { key: 'q', kind: 'question', sessionId: A })],
      [B, status(false)],
    ]))).toEqual([{ type: 'completion', sessionId: B }])
    expect(engine.onStatus(new Map([[A, status(false, { key: 'q', kind: 'question', sessionId: A })], [B, status(false)]]))).toEqual([])
    expect(engine.onFocus(false)).toEqual([{ type: 'attention', sessionId: A, reason: 'question' }])
    expect(engine.onFocus(false)).toEqual([])
    expect(engine.onFocus(true)).toEqual([{ type: 'withdraw', sessionId: A }])
  })

  it('withdraws a shown notification when its Session comes on screen while focused', () => {
    const { engine } = setup(false)
    engine.onList(list(row(A)))
    engine.onStatus(new Map([[A, status(true)]]))
    expect(engine.onStatus(new Map([[A, status(false)]]))).toEqual([{ type: 'completion', sessionId: A }])
    expect(engine.onList(list(row(A, { retainedBy: { mainView: 1 } })))).toEqual([])
    expect(engine.onFocus(true)).toEqual([{ type: 'withdraw', sessionId: A }])
    expect(engine.onList(list(row(A, { retainedBy: { mainView: 1 } })))).toEqual([])
  })

  it('withdraws on screen through the list while already focused', () => {
    const { engine } = setup(true)
    engine.onList(list(row(A)))
    engine.onStatus(new Map([[A, status(true)]]))
    expect(engine.onStatus(new Map([[A, status(false)]]))).toEqual([{ type: 'completion', sessionId: A }])
    expect(engine.onList(list(row(A, { retainedBy: { mainView: 1 } })))).toEqual([{ type: 'withdraw', sessionId: A }])
  })

  it('honors each preference and never notifies subagent Sessions', () => {
    const { engine, preferences } = setup(false, { attention: false, completion: false })
    engine.onList(list(row(A), row(B, { origin: 'subagent' })))
    engine.onStatus(new Map([[A, status(true)], [B, status(true)]]))
    expect(engine.onStatus(new Map([[A, status(false, { key: 'q', kind: 'question', sessionId: A })], [B, status(false)]]))).toEqual([])
    preferences.attention = true
    preferences.completion = true
    expect(engine.onFocus(false)).toEqual([{ type: 'attention', sessionId: A, reason: 'question' }])
    engine.onStatus(new Map([[A, status(true)], [B, status(true)]]))
    expect(engine.onStatus(new Map([[A, status(false)], [B, status(false)]]))).toEqual([{ type: 'completion', sessionId: A }])
  })

  it('does not treat an unknown running state as a finished turn', () => {
    const { engine } = setup()
    engine.onStatus(new Map([[A, status(undefined)]]))
    expect(engine.onStatus(new Map([[A, status(false)]]))).toEqual([])
    expect(engine.title(A)).toBeUndefined()
  })
})
