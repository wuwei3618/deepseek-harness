/** CSCEC8B occupants: the sidebar brand slots, the blank-home seal, and the home stamp frame layer. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { SealMark, SealWordmark } from './Brand.tsx'
import { SealStamp } from './SealStamp.tsx'

/** Required service: the UI slot registry. */
export const inject = ['slots']

/**
 * Fill the sidebar and blank-home brand slots with the seal and frame the blank home with the stamp layer. Every
 * client build profile registers the same occupants.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('conversation.hero.frame', () => ctx.slots.register({
    name: 'conversation.hero.frame',
    id: 'seal-stamp',
  }, SealStamp))
  ctx.slots.inject('conversation.hero.brand.mark', () => ctx.slots.register({ name: 'conversation.hero.brand.mark' }, SealMark))
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.name', function* () {
      yield ctx.slots.register({ name: 'sidebar.brand.mark' }, SealMark)
      yield ctx.slots.register({ name: 'sidebar.brand.name' }, SealWordmark)
    }))
}
