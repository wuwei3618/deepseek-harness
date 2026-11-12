/** Notification preferences shared by the Host schema and the browser plugin. */
import z from '@deepseek-ai/schemastery'

/** Profile entry id whose configuration form carries the preferences. */
export const SESSION_ATTENTION_NAMESPACE = 'ui-session-attention'

/** Notification preferences. */
export interface SessionAttentionSettings {
  /** Notify when a Session asks a question, requests approval, or awaits plan confirmation. */
  attention: boolean
  /** Notify when a Session finishes a turn. */
  completion: boolean
}

/** Preference fields; both default to on. */
export const SessionAttentionSettingsFields = {
  attention: z.boolean().default(true),
  completion: z.boolean().default(true),
}

/** Preference schema; resolving `{}` yields the defaults used before the Host form is served. */
export const SessionAttentionSettingsSchema = z.object(SessionAttentionSettingsFields)
