// @vitest-environment jsdom
/** The switches follow accepted Host state and stay disabled while a write is pending or not allowed. */
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ComponentProps } from 'react'
import { AttentionRows, AttentionToast, type AttentionMutation } from '../src/client/AttentionRows.tsx'
import { en, zh } from '../src/client/locales.ts'
import type { SessionAttentionSettings } from '../src/settings.ts'

afterEach(cleanup)

function fixture(snapshot: Partial<ConfigFormSnapshot<SessionAttentionSettings>> = {}) {
  const preferences = createSnapshotStore<ConfigFormSnapshot<SessionAttentionSettings>>({
    status: 'ready', value: { attention: true, completion: false }, base: {}, user: {}, revision: 0, writable: true, ...snapshot,
  })
  const mutation = createSnapshotStore<AttentionMutation>({ busy: false, failed: false, sequence: 0 })
  const set = vi.fn(async () => {})
  const dismiss = vi.fn()
  const props = {
    usePreferences: bindSnapshotSelector(preferences), useMutation: bindSnapshotSelector(mutation),
    set, dismiss, t: (key: keyof typeof en) => zh[key],
  } as ComponentProps<typeof AttentionRows> & ComponentProps<typeof AttentionToast>
  return { mutation, set, dismiss, props }
}

it('shows one switch per preference and writes the changed field', () => {
  const { props, set } = fixture()
  render(<AttentionRows {...props} />)
  const attention = screen.getByRole('switch', { name: zh['settings.attention.title'] })
  const completion = screen.getByRole('switch', { name: zh['settings.completion.title'] })
  expect(attention.getAttribute('aria-checked')).toBe('true')
  expect(completion.getAttribute('aria-checked')).toBe('false')
  expect(screen.getByText(zh['settings.completion.description'])).toBeTruthy()
  fireEvent.click(completion)
  expect(set).toHaveBeenCalledWith('completion', true)
})

it.each([
  ['a pending write', { busy: true }, {}],
  ['a read-only document', {}, { writable: false }],
  ['a form that is still loading', {}, { status: 'loading' as const, value: undefined }],
])('disables both switches during %s', (_name, mutation, snapshot) => {
  const f = fixture(snapshot)
  f.mutation.update((state) => { Object.assign(state, mutation) })
  render(<AttentionRows {...f.props} />)
  for (const element of screen.getAllByRole('switch')) expect(element.hasAttribute('disabled')).toBe(true)
})

it('shows the failure notice only after a failed write', () => {
  const { props, mutation } = fixture()
  const { container } = render(<AttentionToast {...props} />)
  expect(container.textContent).toBe('')
  act(() => { mutation.update((state) => { state.failed = true; state.sequence = 1 }) })
  expect(screen.getByText(zh['settings.failed'])).toBeTruthy()
})
