/** Pure text and tally helpers over Project Archive values for the workbench page. */
import type { TagTone } from '@deepseek-ai/dsh-client-ui-primitives'
import type { KickoffTask, KickoffTaskStatus, MonthSpan } from '@deepseek-ai/dsh-audit-workbench/types'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'

/** Translator of the workbench namespace. */
export type Translate = PropsLocale<'auditWorkbench'>['t']

/** Kickoff Task counts shown on a project card; `skipped` tasks are left out of every count. */
export interface TaskTally {
  readonly total: number
  readonly done: number
  readonly running: number
  readonly failed: number
  /** Pending tasks and tasks whose recorded status the workbench does not know. */
  readonly pending: number
}

/**
 * Count the Kickoff Tasks a project still has to finish.
 * @param tasks - recorded tasks.
 * @returns counts per status, without skipped tasks.
 */
export function tallyTasks(tasks: readonly KickoffTask[]): TaskTally {
  let done = 0, running = 0, failed = 0, pending = 0
  for (const task of tasks) {
    if (task.status === 'done') done++
    else if (task.status === 'running') running++
    else if (task.status === 'failed') failed++
    else if (task.status !== 'skipped') pending++
  }
  return { total: done + running + failed + pending, done, running, failed, pending }
}

const TONES: Readonly<Record<KickoffTaskStatus, TagTone>> = {
  pending: 'neutral', running: 'info', done: 'success', failed: 'danger', skipped: 'quiet', unknown: 'outline',
}

/**
 * Tag tone of a Kickoff Task status.
 * @param status - recorded status.
 * @returns the tone.
 */
export function statusTone(status: KickoffTaskStatus): TagTone {
  return TONES[status]
}

/**
 * Status label of a Kickoff Task: the localized status, or the recorded text for a status the workbench does not know.
 * @param task - recorded task.
 * @param t - workbench translator.
 * @returns the label.
 */
export function statusLabel(task: KickoffTask, t: Translate): string {
  if (task.status === 'unknown') return text(task.statusText, t)
  return t(`status.${task.status}`)
}

/**
 * Recorded text, or the empty-value mark.
 * @param value - recorded text.
 * @param t - workbench translator.
 * @returns `value`, or `—` when it is empty.
 */
export function text(value: string, t: Translate): string {
  return value === '' ? t('empty') : value
}

/**
 * A start and end month as one line.
 * @param span - recorded months.
 * @param t - workbench translator.
 * @returns `from to to`, with the empty-value mark for a missing end, or only the mark when both are missing.
 */
export function spanText(span: MonthSpan, t: Translate): string {
  if (span.from === '' && span.to === '') return t('empty')
  return t('span', { from: text(span.from, t), to: text(span.to, t) })
}

/**
 * Hour and minute of an ISO time in the viewer's locale.
 * @param iso - ISO-8601 time.
 * @returns the local clock time, or `iso` unchanged when it does not parse.
 */
export function clockTime(iso: string): string {
  const at = Date.parse(iso)
  if (Number.isNaN(at)) return iso
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/**
 * Last path segment of a directory, for a Workspace without a title.
 * @param path - absolute path with `/` or `\` separators.
 * @returns the last non-empty segment, or `path` when it has none.
 */
export function baseName(path: string): string {
  const parts = path.split(/[\\/]/).filter(part => part !== '')
  return parts.at(-1) ?? path
}
