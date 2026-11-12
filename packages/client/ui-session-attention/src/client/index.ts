/** Desktop system notifications for Sessions that await the user or finish a turn. */
import type { Context } from '@deepseek-ai/cordis'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { SESSION_ATTENTION_NAMESPACE, SessionAttentionSettingsSchema, type SessionAttentionSettings } from '../settings.ts'
import type { DesktopSessionAttention } from '../types.ts'
import { AttentionRows, AttentionToast, type AttentionInjected, type AttentionMutation } from './AttentionRows.tsx'
import { AttentionEngine, type AttentionAction } from './engine.ts'
import { en, ja, es, fr, de, ru, pt, zh } from './locales.ts'

export { AttentionEngine, type AttentionAction, type AttentionReason } from './engine.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Session notification and preference copy. */
    sessionAttention: keyof typeof en
  }
}

/** Services the notifications and preference rows read. */
export const inject = ['slots', 'locale', 'configForms', 'sessions', 'uiSession']

const LOCALE = 'sessionAttention'

function desktopBridge(): DesktopSessionAttention | undefined {
  const bridge = (globalThis as typeof globalThis & {
    dshDesktop?: { protocolVersion: number; sessionAttention?: DesktopSessionAttention }
  }).dshDesktop
  return bridge?.protocolVersion === 1 ? bridge.sessionAttention : undefined
}

/**
 * Notify through Desktop while its bridge is present; elsewhere register nothing.
 * @param ctx - browser plugin context.
 */
export function apply(ctx: Context): void {
  const desktop = desktopBridge()
  if (desktop === undefined) return
  ctx.effect(() => ctx.locale.register(LOCALE, { en, zh, ja, es, fr, de, ru, pt }), 'ui-session-attention: dictionaries')
  const t = ctx.locale.bind(LOCALE)
  const form = ctx.configForms.get<SessionAttentionSettings>(SESSION_ATTENTION_NAMESPACE)
  // Until the Host form is served the schema defaults apply, so a reload does not drop notifications.
  const defaults: SessionAttentionSettings = SessionAttentionSettingsSchema({})
  const settings = (): SessionAttentionSettings => form.getSnapshot().value ?? defaults
  const engine = new AttentionEngine(settings, document.hasFocus())

  const label = (sessionId: SessionId): string => engine.title(sessionId) ?? t('notice.untitled')
  const deliver = (actions: readonly AttentionAction[]): void => {
    for (const action of actions) {
      if (action.type === 'withdraw') desktop.withdraw(action.sessionId)
      else if (action.type === 'attention') {
        desktop.notify({ sessionId: action.sessionId, title: t('notice.attention.title'),
          body: t(`notice.${action.reason}`, { session: label(action.sessionId) }) })
      } else {
        desktop.notify({ sessionId: action.sessionId, title: t('notice.completion.title'),
          body: t('notice.completion', { session: label(action.sessionId) }) })
      }
    }
  }

  ctx.effect(() => {
    const sessions = ctx.sessions.list
    const status = ctx.uiSession.sessionStatus
    const onList = (): void => { deliver(engine.onList(sessions.getSnapshot())) }
    const onStatus = (): void => { deliver(engine.onStatus(status.getSnapshot())) }
    const onFocus = (): void => { deliver(engine.onFocus(true)) }
    const onBlur = (): void => { deliver(engine.onFocus(false)) }
    onList()
    onStatus()
    const stopList = sessions.subscribe(onList)
    const stopStatus = status.subscribe(onStatus)
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)
    const stopClicks = desktop.subscribe((sessionId) => { ctx.get('uiWorkspace')?.openSession(sessionId) })
    return () => {
      stopList()
      stopStatus()
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)
      stopClicks()
    }
  }, 'ui-session-attention: notifications')

  const mutation = createSnapshotStore<AttentionMutation>({ busy: false, failed: false, sequence: 0 })
  const face = (): AttentionInjected => ({
    hooks: { preferences: form, mutation },
    set: async (field, enabled) => {
      if (mutation.getSnapshot().busy) return
      mutation.update((state) => { state.busy = true; state.failed = false })
      let accepted = false
      try {
        accepted = await form.set(field, enabled)
      } catch (_error) {
        // The failure notice reports the write while the form keeps the accepted value.
      }
      mutation.update((state) => { state.busy = false; state.failed = !accepted; state.sequence++ })
    },
    dismiss: () => { mutation.update((state) => { state.failed = false }) },
  })
  ctx.effect(() => ctx.configForms.whileServed([SESSION_ATTENTION_NAMESPACE], () => ctx.slots.inject('settings.general.item', () =>
    ctx.slots.register({ name: 'settings.general.item', id: SESSION_ATTENTION_NAMESPACE, order: 80, locale: LOCALE, inject: face },
      AttentionRows))), 'ui-session-attention: preference rows')
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'session-attention-toast', locale: LOCALE, inject: face,
  }, AttentionToast))
}
