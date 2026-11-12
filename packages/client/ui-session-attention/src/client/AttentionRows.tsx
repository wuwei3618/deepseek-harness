/** General settings rows for the two Session notification preferences. */
import { Switch, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionAttentionSettings } from '../settings.ts'
import css from './AttentionRows.module.css'

/** Save state shared by the rows and the failure notice. */
export interface AttentionMutation {
  /** Whether a write is in flight. */
  busy: boolean
  /** Whether the latest write failed and its notice is still shown. */
  failed: boolean
  /** Increments per settled write so a repeated failure restarts the notice. */
  sequence: number
}

/** Accepted preferences and the writer supplied by the plugin. */
export interface AttentionInjected {
  hooks: {
    preferences: ObservableSnapshot<ConfigFormSnapshot<SessionAttentionSettings>>
    mutation: ObservableSnapshot<AttentionMutation>
  }
  /**
   * Persist one preference; a refused or failed write leaves the accepted value shown.
   * @param field - preference to change.
   * @param enabled - requested value.
   * @returns completion after the write settles.
   */
  set(field: keyof SessionAttentionSettings, enabled: boolean): Promise<void>
  /** Clear the failure notice. */
  dismiss(): void
}

type Face = InjectFace<AttentionInjected> & PropsLocale<'sessionAttention'>

const FIELDS = ['attention', 'completion'] as const

/**
 * Render one switch row per preference.
 * @param props - preference hooks, writer, and localized copy.
 * @returns the two preference rows.
 */
export function AttentionRows({ usePreferences, useMutation, set, t }: PropsRuntime<'settings.general.item'> & Face) {
  const preferences = usePreferences(value => value)
  const busy = useMutation(value => value.busy)
  const disabled = busy || preferences.status !== 'ready' || !preferences.writable
  return <>
    {FIELDS.map(field => <div key={field} className={css.row}>
      <div>
        <div className={css.title}>{t(`settings.${field}.title`)}</div>
        <div className={css.description}>{t(`settings.${field}.description`)}</div>
      </div>
      <Switch checked={preferences.value?.[field] === true} label={t(`settings.${field}.title`)} disabled={disabled}
        onChange={(enabled) => { void set(field, enabled) }} />
    </div>)}
  </>
}

/**
 * Keep a save failure visible after Settings closes.
 * @param props - mutation hook, dismissal, and localized copy.
 * @returns the failure toast, or nothing.
 */
export function AttentionToast({ useMutation, dismiss, t }: PropsRuntime<'shell.overlay'> & Face) {
  const state = useMutation(value => value)
  if (!state.failed) return null
  return <Toast key={state.sequence} text={t('settings.failed')} onDone={dismiss} />
}
