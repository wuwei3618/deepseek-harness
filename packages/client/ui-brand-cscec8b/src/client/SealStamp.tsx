/** Home frame layer: clicks on blank home space press a fading seal impression below the Conversation content. */
import { useEffect, useId, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import type { HeroFrameOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { SEAL_STAMP_PATH, SEAL_VIEWBOX } from './artwork.ts'
import css from './SealStamp.module.css'

/** Interactive descendants whose clicks belong to the control, not to blank home space. */
const CONTROLS = 'button, a, input, textarea, select, label, [contenteditable], [role="button"], [role="dialog"], [role="menu"], [role="listbox"], [data-composer-card]'

/** Impressions kept at once; a further click replaces the oldest. */
const MAX_STAMPS = 3

/**
 * Rotation in degrees of an impression, between -6 and 6, so successive stamps do not line up.
 * @param id - the impression's sequence number.
 * @returns the impression's tilt.
 */
function tiltOf(id: number): number {
  return (id * 5) % 13 - 6
}

/** Ink droplets thrown from the rim as the seal lands. */
const DROPLETS = 8

/**
 * Direction and reach of one droplet, varied per impression so splashes differ.
 * @param id - the impression's sequence number.
 * @param index - the droplet's position around the rim.
 * @returns the droplet's angle in degrees and its travel in pixels.
 */
function dropletOf(id: number, index: number): { angle: number; distance: number } {
  return { angle: index * (360 / DROPLETS) + ((id * 7 + index * 11) % 17) - 8, distance: 14 + ((id * 3 + index * 5) % 4) * 4 }
}

/** One impression, positioned in the stamp layer's own coordinates. */
interface Stamp {
  readonly id: number
  readonly x: number
  readonly y: number
  readonly tilt: number
}

/** Frame owner state and the wrapped content. */
export type SealStampProps = HeroFrameOwnerProps & { children: ReactNode }

/**
 * Classify a click that bubbled to the frame. React bubbles portaled overlays through their React parent, so a
 * target outside the frame's DOM subtree is excluded. A click that ends a text selection made inside the frame is
 * not a blank click; a selection elsewhere in the document does not block the stamp.
 * @param event - the click observed on the frame.
 * @returns whether the click is a primary click on blank home space.
 */
function isBlankClick(event: MouseEvent<HTMLDivElement>): boolean {
  // React reports element targets; text-node targets resolve to their parent element.
  const target = event.target as Element
  const frame = event.currentTarget
  const selection = window.getSelection()
  return event.button === 0
    && frame.contains(target)
    && target.closest(CONTROLS) === null
    && !(selection !== null && !selection.isCollapsed && frame.contains(selection.anchorNode))
}

/**
 * Wrap the Conversation scroll body; while the home is shown, press a seal impression where blank space is clicked.
 * @param props - the home state and the wrapped scroll body.
 * @returns a layout-neutral frame around the children.
 */
export function SealStamp({ hero, children }: SealStampProps) {
  const layer = useRef<HTMLDivElement>(null)
  const nextId = useRef(0)
  const [stamps, setStamps] = useState<readonly Stamp[]>([])
  const inkId = `seal-stamp-ink-${useId().replace(/:/gu, '')}`
  useEffect(() => { if (!hero) setStamps([]) }, [hero])
  const onClick = (event: MouseEvent<HTMLDivElement>): void => {
    const surface = layer.current
    if (surface === null || !isBlankClick(event)) return
    const box = surface.getBoundingClientRect()
    const id = nextId.current++
    const stamp = { id, x: event.clientX - box.left, y: event.clientY - box.top, tilt: tiltOf(id) }
    setStamps(current => [...current.slice(1 - MAX_STAMPS), stamp])
  }
  const remove = (id: number): void => { setStamps(current => current.filter(stamp => stamp.id !== id)) }
  return (
    <div className={css.frame} onClick={onClick}>
      {hero && (
        <div ref={layer} className={css.layer} data-home-stamp="" aria-hidden="true">
          <svg className={css.defs} width="0" height="0">
            {/* Uneven ink: roughened edges and a grain that leaves small uninked specks. */}
            <filter id={inkId} x="-10%" y="-10%" width="120%" height="120%">
              <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="3" result="noise" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.55" xChannelSelector="R" yChannelSelector="G" result="rough" />
              <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  3.2 0 0 0 -0.6" result="grain" />
              <feComposite in="rough" in2="grain" operator="in" />
            </filter>
          </svg>
          {stamps.map(stamp => (
            <span
              key={stamp.id}
              className={css.stamp}
              style={{ left: stamp.x, top: stamp.y, '--seal-stamp-tilt': `${stamp.tilt}deg` } as CSSProperties}
              onAnimationEnd={(event) => { if (event.target === event.currentTarget) remove(stamp.id) }}
            >
              <span className={css.shadow} />
              <span className={css.ripple} />
              <span className={css.ripple} data-late="" />
              {Array.from({ length: DROPLETS }, (_, index) => {
                const { angle, distance } = dropletOf(stamp.id, index)
                return <span key={index} className={css.droplet} style={{ '--seal-drop-angle': `${angle}deg`, '--seal-drop-distance': `${distance}px` } as CSSProperties} />
              })}
              <svg className={css.impression} viewBox={`0 0 ${SEAL_VIEWBOX} ${SEAL_VIEWBOX}`} fill="none">
                <path d={SEAL_STAMP_PATH} fill="currentColor" fillRule="evenodd" filter={`url(#${inkId})`} />
              </svg>
            </span>
          ))}
        </div>
      )}
      {children}
    </div>
  )
}
