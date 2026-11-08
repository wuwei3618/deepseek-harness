// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { apply, inject } from '../src/client/index.ts'
import { SealMark, SealWordmark } from '../src/client/Brand.tsx'
import { SealStamp } from '../src/client/SealStamp.tsx'
import { WORDMARK_WIDTH } from '../src/client/artwork.ts'
import { apply as hostApply } from '../src/index.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

const HOLES = [
  'sidebar.brand.mark',
  'sidebar.brand.name',
  'conversation.hero.brand.mark',
  'conversation.hero.frame',
] as const

async function bench(declare = true) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots') as SlotRegistry
  const declareHoles = () => slots.register({
    name: 'root',
    children: Object.fromEntries(HOLES.map(name => [name, {
      kind: name === 'conversation.hero.frame' ? 'hoc' : 'single',
      scope: 'root',
    }])),
  } as never, () => null)
  const disposeHoles = declare ? declareHoles() : undefined
  return { ctx, slots, declareHoles, disposeHoles }
}

describe('CSCEC8B browser-brand plugin', () => {
  it('keeps the host Loader entry inert', () => {
    expect(hostApply).not.toThrow()
  })

  it('declares only the slot service it uses', () => {
    expect(inject).toEqual(['slots'])
  })

  it.each(['official', 'local'])('fills every brand slot in a %s client build', async (profile) => {
    vi.stubEnv('DSH_CLIENT_BUILD_PROFILE', profile)
    const subject = await bench()
    await subject.ctx.plugin({ inject: [...inject], apply }).await()
    expect(subject.slots.entries('sidebar.brand.mark')[0]?.component).toBe(SealMark)
    expect(subject.slots.entries('sidebar.brand.name')[0]?.component).toBe(SealWordmark)
    expect(subject.slots.entries('conversation.hero.brand.mark')[0]?.component).toBe(SealMark)
    const [frame] = subject.slots.entries('conversation.hero.frame')
    expect(frame?.component).toBe(SealStamp)
    expect(frame?.options.id).toBe('seal-stamp')
  })

  it('fills declarations before or after apply and removes every occupant on teardown', async () => {
    const before = await bench()
    const fiber = before.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    for (const hole of HOLES) expect(before.slots.entries(hole)).toHaveLength(1)

    before.disposeHoles?.()
    for (const hole of HOLES) expect(before.slots.entries(hole)).toHaveLength(0)
    before.declareHoles()
    await Promise.resolve()
    for (const hole of HOLES) expect(before.slots.entries(hole)).toHaveLength(1)

    await fiber.dispose()
    for (const hole of HOLES) expect(before.slots.entries(hole)).toHaveLength(0)

    const after = await bench(false)
    await after.ctx.plugin({ inject: [...inject], apply }).await()
    for (const hole of HOLES) expect(after.slots.entries(hole)).toHaveLength(0)
    after.declareHoles()
    await Promise.resolve()
    for (const hole of HOLES) expect(after.slots.entries(hole)).toHaveLength(1)
  })

  it('renders the seal at the requested size with the host class and the wordmark at 24px height', () => {
    const mark = render(<SealMark size={24} />)
    const svg = mark.container.querySelector('svg')!
    expect([svg.getAttribute('width'), svg.getAttribute('viewBox'), svg.getAttribute('aria-hidden')]).toEqual(['24', '0 0 24 24', 'true'])
    expect(svg.querySelector('path')?.getAttribute('fill-rule')).toBe('evenodd')
    mark.rerender(<SealMark size={34} className="host" />)
    expect(svg.getAttribute('width')).toBe('34')
    expect(svg.getAttribute('class')).toBe('host')
    mark.unmount()

    const name = render(<SealWordmark />)
    const wordmark = name.container.querySelector('svg')!
    expect([wordmark.getAttribute('height'), wordmark.getAttribute('viewBox')]).toEqual(['24', `0 0 ${WORDMARK_WIDTH} 24`])
    expect(wordmark.getAttribute('aria-hidden')).toBe('true')
  })
})
