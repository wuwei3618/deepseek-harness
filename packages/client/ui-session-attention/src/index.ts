/** Host registration for the Desktop Session notification preferences. */
import type {} from '@deepseek-ai/dsh-settings'

import type { Volatile, Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { SessionAttentionSettingsFields } from './settings.ts'

export { SESSION_ATTENTION_NAMESPACE, type SessionAttentionSettings } from './settings.ts'

/** Runtime preferences projected to the browser. */
export interface Config {
  /** Notify when a Session awaits an answer, an approval, or a plan confirmation. */
  attention: Volatile<boolean>
  /** Notify when a Session finishes a turn. */
  completion: Volatile<boolean>
}

/** Live preferences projected to the browser. */
export const Config = z.object({
  attention: SessionAttentionSettingsFields.attention.volatile(),
  completion: SessionAttentionSettingsFields.completion.volatile(),
})

/** The browser plugin presents the preferences in General settings.
 * @param ctx Plugin context used for optional settings presentation.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (child) => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)) })
}
