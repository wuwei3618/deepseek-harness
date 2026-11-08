/** Animated seal mask and static SVG fallback for the running Chat status. */
import css from './ChatView.module.css'

/** Static seal: the outer ring around a square impression. */
const REST_PATH = 'M14.5 8A6.5 6.5 0 1 1 1.5 8A6.5 6.5 0 1 1 14.5 8ZM5.5 5.5H10.5V10.5H5.5Z'

/**
 * Render the decorative running icon; the APNG asset owns its animation timing.
 * @returns mask and static SVG selected by browser capabilities and accessibility preferences.
 */
export function RunningWhaleTail() {
  return (
    <span className={css.runningIcon} aria-hidden="true">
      <span className={css.runningWhaleAnimated} />
      <svg className={css.runningWhaleStill} width="100%" height="100%" viewBox="0 0 16 16" fill="none">
        <path d={REST_PATH} stroke="currentColor" strokeWidth={1} />
      </svg>
    </span>
  )
}
