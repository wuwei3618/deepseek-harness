/** CSCEC8B seal mark and 八局审计智能体 wordmark rendered in the current text color. */
import type { HeroBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { SEAL_MARK_PATH, SEAL_VIEWBOX, WORDMARK_PATH, WORDMARK_WIDTH } from './artwork.ts'

/**
 * Render the filled seal at the edge length the host surface requests. The sidebar passes only a size; the blank
 * home also passes its geometry class, which carries the host's hover sway.
 * @param props - Host-supplied mark presentation.
 * @returns the decorative seal svg.
 */
export function SealMark({ size, className }: HeroBrandMarkOwnerProps) {
  return (
    <svg width={size} height={size} className={className} viewBox={`0 0 ${SEAL_VIEWBOX} ${SEAL_VIEWBOX}`} fill="none" aria-hidden="true">
      <path d={SEAL_MARK_PATH} fill="currentColor" fillRule="evenodd" />
    </svg>
  )
}

/**
 * Render the product name artwork without its independently slotted mark.
 * @returns the decorative 24px-high wordmark svg.
 */
export function SealWordmark() {
  return (
    <svg width={WORDMARK_WIDTH} height={24} viewBox={`0 0 ${WORDMARK_WIDTH} 24`} fill="none" aria-hidden="true">
      <path d={WORDMARK_PATH} fill="currentColor" />
    </svg>
  )
}
