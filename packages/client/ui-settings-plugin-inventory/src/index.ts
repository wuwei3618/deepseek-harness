/** Host loader entry for the inventory-tab browser implementation exported from `./client`. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { CONFIG_GLOBAL, type Config } from './config.ts'

export { Config } from './config.ts'

/**
 * Publish the validated card choices before browser plugins activate.
 * @param ctx - Host context collecting page initialization data.
 * @param config - validated deployment choices.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.on('webserver/index-inject', (table) => {
    table.push({ kind: 'global', name: CONFIG_GLOBAL, value: config satisfies Config })
  })
}
