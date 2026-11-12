// @vitest-environment jsdom
/** The browser plugin posts localized notices through the Desktop bridge and owns its rows and listeners. */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { TestRemote } from '@deepseek-ai/dsh-client-test-runtime'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply as settingsApply, inject as settingsInject } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionPendingInteraction, SessionStatus, SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { apply, inject } from '../src/client/index.ts'
import { apply as hostApply, Config } from '../src/index.ts'
import type { AttentionInjected } from '../src/client/AttentionRows.tsx'
import type { DesktopSessionAttention } from '../src/types.ts'

const A = 'session-a' as SessionId

function snapshot(running: boolean, pending?: { key: string; kind: string }): SessionStatusSnapshot {
  const interaction = pending === undefined ? undefined : { ...pending, sessionId: A } as SessionPendingInteraction
  return new Map<SessionId, SessionStatus>([[A, { running, pendingInteraction: interaction, completionUnread: false }]])
}

afterEach(() => { delete (globalThis as { dshDesktop?: unknown }).dshDesktop })

function bridge() {
  const clicks = new Set<(sessionId: SessionId) => void>()
  const desktop = {
    notify: vi.fn(),
    withdraw: vi.fn(),
    subscribe: vi.fn((listener: (sessionId: SessionId) => void) => {
      clicks.add(listener)
      return () => { clicks.delete(listener) }
    }),
  } satisfies DesktopSessionAttention
  ;(globalThis as { dshDesktop?: unknown }).dshDesktop = { protocolVersion: 1, sessionAttention: desktop }
  return { desktop, clicks }
}

async function boot({ workspace = true, served = true } = {}) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  const describe = vi.fn(async () => ({ ok: true as const, value: {
    writable: true, hasDocument: true,
    namespaces: served ? [{ ns: 'ui-session-attention', schema: {}, value: { attention: true, completion: true },
      applies: 'live' as const, secrets: [] as never[], revision: 1 }] : [],
  } }))
  new TestRemote(ctx, { settings: { describe } })
  await ctx.plugin({ inject: [...settingsInject], apply: settingsApply }).await()
  const list = createSnapshotStore<SessionListState>({
    ids: [A], phase: 'ready', projectionsBySession: {},
    byId: { [A]: { id: A, displayTitle: '凭证抽查', running: true, retainedBy: {}, blank: false, updatedAt: 0 } },
  })
  const status = createSnapshotStore<SessionStatusSnapshot>(snapshot(true))
  ctx.provide('sessions', { list })
  ctx.provide('uiSession', { sessionStatus: status })
  const openSession = vi.fn()
  if (workspace) ctx.provide('uiWorkspace', { openSession })
  const slots = ctx.get('slots') as SlotRegistry
  slots.register({ name: 'root', children: {
    'settings.general.item': { kind: 'list', scope: 'root' },
    'shell.overlay': { kind: 'list', scope: 'root' },
  } } as never, () => null)
  return { ctx, locale, list, status, openSession, slots }
}

it('declares both preferences as live fields that default to on', () => {
  const config = Config({})
  expect([config.attention.get(), config.completion.get()]).toEqual([true, true])
})

it('tells Settings that the browser plugin presents the preferences', async () => {
  const ctx = new Context()
  try {
    const configure = vi.fn((_presentation: { auto?: boolean }) => () => {})
    ctx.provide('settings', { configure })
    await ctx.plugin({ apply: hostApply }).await()
    await vi.waitFor(() => { expect(configure).toHaveBeenCalledOnce() })
    expect(configure.mock.calls[0]![0]).toEqual({ auto: false })
  } finally {
    await ctx.fiber.dispose()
  }
})

it('registers nothing outside Desktop', async () => {
  const { ctx, slots } = await boot()
  try {
    await ctx.plugin({ inject, apply }).await()
    expect(slots.entries('shell.overlay')).toHaveLength(0)
  } finally {
    await ctx.fiber.dispose()
  }
})

it('notifies through Desktop in the active language, opens clicked Sessions, and releases everything on disposal', async () => {
  const { desktop, clicks } = bridge()
  const { ctx, locale, status, openSession, slots } = await boot()
  try {
    locale.setLocale('zh')
    const fiber = ctx.plugin({ inject, apply })
    await fiber.await()
    status.set(snapshot(false, { key: 'q', kind: 'question' }))
    expect(desktop.notify).toHaveBeenLastCalledWith({ sessionId: A, title: '智能体需要您处理', body: '凭证抽查：等待您回答问题' })
    status.set(snapshot(true))
    expect(desktop.withdraw).toHaveBeenCalledWith(A)
    status.set(snapshot(false))
    expect(desktop.notify).toHaveBeenLastCalledWith({ sessionId: A, title: '智能体已完成任务', body: '凭证抽查：本轮任务已完成' })
    for (const click of clicks) click(A)
    expect(openSession).toHaveBeenCalledWith(A)

    await vi.waitFor(() => { expect(slots.entries('settings.general.item')).toHaveLength(1) })
    expect(slots.entries('settings.general.item')[0]!.options).toMatchObject({ id: 'ui-session-attention', order: 80 })
    const face = slots.entries('settings.general.item')[0]!.inject!() as AttentionInjected & Record<string, unknown>
    const set = vi.spyOn(ctx.configForms.get('ui-session-attention'), 'set').mockRejectedValue(new Error('offline'))
    await face.set('completion', false)
    expect(set).toHaveBeenCalledWith('completion', false)
    expect(face.hooks.mutation.getSnapshot()).toMatchObject({ busy: false, failed: true, sequence: 1 })
    face.dismiss()
    expect(face.hooks.mutation.getSnapshot().failed).toBe(false)

    await fiber.dispose()
    expect(clicks.size).toBe(0)
    expect(slots.entries('settings.general.item')).toHaveLength(0)
    expect(slots.entries('shell.overlay')).toHaveLength(0)
    desktop.notify.mockClear()
    status.set(snapshot(false, { key: 'q2', kind: 'approval' }))
    expect(desktop.notify).not.toHaveBeenCalled()
  } finally {
    await ctx.fiber.dispose()
  }
})

it('uses the defaults before the form is served, labels untitled Sessions, and follows window focus', async () => {
  const { desktop, clicks } = bridge()
  const { ctx, locale, list, status, openSession } = await boot({ workspace: false, served: false })
  try {
    locale.setLocale('zh')
    await ctx.plugin({ inject, apply }).await()
    list.set({ ids: [], byId: {}, phase: 'ready', projectionsBySession: {} })
    status.set(snapshot(false))
    expect(desktop.notify).toHaveBeenLastCalledWith({ sessionId: A, title: '智能体已完成任务', body: '未命名会话：本轮任务已完成' })
    for (const click of clicks) click(A)
    expect(openSession).not.toHaveBeenCalled()

    list.set({ ids: [A], phase: 'ready', projectionsBySession: {},
      byId: { [A]: { id: A, displayTitle: '凭证抽查', running: false, retainedBy: { mainView: 1 }, blank: false, updatedAt: 0 } } })
    window.dispatchEvent(new Event('focus'))
    expect(desktop.withdraw).toHaveBeenCalledWith(A)
    status.set(snapshot(false, { key: 'p', kind: 'plan-review' }))
    expect(desktop.notify).toHaveBeenCalledOnce()
    window.dispatchEvent(new Event('blur'))
    expect(desktop.notify).toHaveBeenLastCalledWith({ sessionId: A, title: '智能体需要您处理', body: '凭证抽查：等待您确认方案' })
  } finally {
    await ctx.fiber.dispose()
  }
})

it('ignores a preference change while the previous write is pending', async () => {
  bridge()
  const { ctx, slots } = await boot()
  try {
    await ctx.plugin({ inject, apply }).await()
    await vi.waitFor(() => { expect(slots.entries('settings.general.item')).toHaveLength(1) })
    const face = slots.entries('settings.general.item')[0]!.inject!() as AttentionInjected & Record<string, unknown>
    const pending = Promise.withResolvers<boolean>()
    const set = vi.spyOn(ctx.configForms.get('ui-session-attention'), 'set').mockReturnValue(pending.promise)
    const first = face.set('attention', false)
    await face.set('completion', false)
    expect(set).toHaveBeenCalledOnce()
    pending.resolve(true)
    await first
    expect(face.hooks.mutation.getSnapshot()).toMatchObject({ busy: false, failed: false })
  } finally {
    await ctx.fiber.dispose()
  }
})
