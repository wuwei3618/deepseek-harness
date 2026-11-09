// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { createPortal } from 'react-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SealStamp } from '../src/client/SealStamp.tsx'

// jsdom has no AnimationEvent, so React listens for the vendor-prefixed animation-end event.
const animationEnd = (element: Element) => { fireEvent(element, new Event('webkitAnimationEnd', { bubbles: true })) }

afterEach(() => {
  vi.restoreAllMocks()
  cleanup()
  document.body.replaceChildren()
})

function stamps(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>('[data-home-stamp] > span')]
}

describe('seal stamp frame layer', () => {
  it('places a decorative layer before its content only while the home is shown', () => {
    const view = render(<SealStamp hero><p>content</p></SealStamp>)
    const layer = view.container.querySelector('[data-home-stamp]')
    expect(layer?.getAttribute('aria-hidden')).toBe('true')
    expect(layer?.nextElementSibling?.textContent).toBe('content')
    view.rerender(<SealStamp hero={false}><p>content</p></SealStamp>)
    expect(view.container.querySelector('[data-home-stamp]')).toBeNull()
    fireEvent.click(view.getByText('content'))
    expect(view.getByText('content')).toBeTruthy()
  })

  it('stamps where blank space is clicked, relative to its layer', () => {
    const view = render(<SealStamp hero><section data-testid="blank" /></SealStamp>)
    const layer = view.container.querySelector('[data-home-stamp]')!
    vi.spyOn(layer, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 400, 300))
    fireEvent.click(view.getByTestId('blank'), { clientX: 110, clientY: 70 })
    const [stamp] = stamps(view.container)
    expect([stamp?.style.left, stamp?.style.top]).toEqual(['100px', '50px'])
    expect(stamp?.style.getPropertyValue('--seal-stamp-tilt')).toBe('-6deg')
    const impression = stamp?.querySelector('path')
    expect(impression?.getAttribute('fill-rule')).toBe('evenodd')
    const filter = view.container.querySelector('[data-home-stamp] filter')!
    expect(impression?.getAttribute('filter')).toBe(`url(#${filter.id})`)
    expect(filter.id).toMatch(/^seal-stamp-ink-[^:]+$/u)
    expect(stamp!.children).toHaveLength(4)
    expect(stamp!.querySelectorAll('path[filter]')).toHaveLength(1)
  })

  it('ignores controls, the composer card, portaled overlays, and secondary clicks', () => {
    const overlay = document.createElement('div')
    document.body.append(overlay)
    const view = render(
      <SealStamp hero>
        <section data-testid="blank">
          <button type="button">control</button>
          <div data-composer-card=""><span>card</span></div>
          {createPortal(<span>overlay</span>, overlay)}
        </section>
      </SealStamp>,
    )
    fireEvent.click(view.getByText('control'))
    fireEvent.click(view.getByText('card'))
    fireEvent.click(view.getByText('overlay'))
    fireEvent.click(view.getByTestId('blank'), { button: 2 })
    expect(stamps(view.container)).toHaveLength(0)
    fireEvent.click(view.getByTestId('blank'))
    expect(stamps(view.container)).toHaveLength(1)
  })

  it('does not stamp when the click ends a text selection made inside its frame', () => {
    const outside = document.createElement('p')
    outside.textContent = 'elsewhere'
    document.body.append(outside)
    const view = render(<SealStamp hero><p data-testid="text">selectable headline</p></SealStamp>)
    const text = view.getByTestId('text')
    const selection = window.getSelection()!
    selection.selectAllChildren(text)
    fireEvent.click(text)
    expect(stamps(view.container)).toHaveLength(0)
    selection.selectAllChildren(outside)
    fireEvent.click(text)
    expect(stamps(view.container)).toHaveLength(1)
    selection.removeAllRanges()
  })

  it('stamps when the document exposes no selection', () => {
    vi.spyOn(window, 'getSelection').mockReturnValue(null)
    const view = render(<SealStamp hero><p data-testid="text">headline</p></SealStamp>)
    fireEvent.click(view.getByTestId('text'))
    expect(stamps(view.container)).toHaveLength(1)
  })

  it('keeps the three newest impressions with varied tilts and removes each when its animation ends', () => {
    const view = render(<SealStamp hero><section data-testid="blank" /></SealStamp>)
    for (let i = 0; i < 4; i++) fireEvent.click(view.getByTestId('blank'))
    const kept = stamps(view.container)
    expect(kept.map(stamp => stamp.style.getPropertyValue('--seal-stamp-tilt'))).toEqual(['-1deg', '4deg', '-4deg'])
    // An inner layer finishing first leaves the impression in place.
    animationEnd(kept[1]!.querySelector('svg')!)
    expect(stamps(view.container)).toHaveLength(3)
    animationEnd(kept[1]!)
    expect(stamps(view.container).map(stamp => stamp.style.getPropertyValue('--seal-stamp-tilt'))).toEqual(['-1deg', '-4deg'])
  })

  it('clears impressions when the home closes', () => {
    const view = render(<SealStamp hero><section data-testid="blank" /></SealStamp>)
    fireEvent.click(view.getByTestId('blank'))
    view.rerender(<SealStamp hero={false}><section data-testid="blank" /></SealStamp>)
    act(() => { view.rerender(<SealStamp hero><section data-testid="blank" /></SealStamp>) })
    expect(stamps(view.container)).toHaveLength(0)
  })
})
