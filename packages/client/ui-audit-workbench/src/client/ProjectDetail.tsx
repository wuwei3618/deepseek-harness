/** One audit project: its Project Archive, the Kickoff Tasks with their outputs, and the project's Sessions. */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import {
  Button, IconChevronLeftOutlineRegular, IconFolderOpenOutlineRegular, IconPlayOutlineRegular, IconRefreshOutlineRegular,
  relativeTime, Tag,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type {
  ArchiveReading, KickoffTask, OutputRequest, ProjectArchive, ProjectEntry, WorkbenchModel, WorkbenchOverview,
} from '@deepseek-ai/dsh-audit-workbench/types'
import type { OpenFailure } from './source.ts'
import { Spinner } from './dialogs.tsx'
import { baseName, spanText, statusLabel, statusTone, text, type Translate } from './format.ts'
import css from './WorkbenchPage.module.css'

/** Highest Archive Version this page shows in full; the Host reader's `KNOWN_ARCHIVE_VERSION`. */
const KNOWN_ARCHIVE_VERSION = 1

/** Project detail props. */
export interface ProjectDetailProps {
  readonly workspaceId: WorkspaceId
  /** The project's latest read; absent while the first read runs or after its Workspace was removed. */
  readonly project: ProjectEntry | undefined
  readonly loading: boolean
  readonly workspaces: WorkspaceSnapshot
  readonly sessions: SessionListState['byId']
  readonly models: WorkbenchOverview['models']
  readonly prompts: WorkbenchOverview['prompts']
  readonly t: Translate
  readonly onBack: () => void
  readonly onRefresh: () => void
  readonly onRunModel: () => void
  /** Run a recorded Kickoff Task again, by its type and its index in the archive. */
  readonly onRerun: (type: string, index: number) => void
  readonly onBackfill: () => void
  readonly openOutput: (request: OutputRequest) => Promise<'opened' | OpenFailure>
  readonly openSession: (sessionId: SessionId) => void
}

const OPEN_FAILURE_KEYS = { refused: 'open.refused', 'not-found': 'open.notFound', failed: 'open.failed' } as const

/**
 * Render one project's archive, Kickoff Tasks, change log, and Sessions.
 * @param props - the project read, Workspace and Session lists, copy, and actions.
 * @returns the detail view.
 */
export function ProjectDetail(props: ProjectDetailProps) {
  const { workspaceId, project, workspaces, t } = props
  const [openNotice, setOpenNotice] = useState<string | undefined>(undefined)
  const workspace = workspaces.items.find(item => item.workspaceId === workspaceId)
  const archivedIds = workspaces.archivedSessionIds
  const path = project?.path ?? workspace?.path ?? ''
  const title = workspace?.title ?? baseName(path)
  const read = project?.read
  const archive = read?.kind === 'read' ? read.archive : undefined
  const openOutput = async (task: number, output: number): Promise<void> => {
    setOpenNotice(undefined)
    const outcome = await props.openOutput({ workspaceId, task, output })
    if (outcome !== 'opened') setOpenNotice(t(OPEN_FAILURE_KEYS[outcome]))
  }
  return (
    <>
      <nav className={css.breadcrumb} aria-label={t('title')}>
        <Button size="sm" variant="ghost" icon={<IconChevronLeftOutlineRegular size={16} />} onClick={props.onBack}>{t('title')}</Button>
      </nav>
      <header className={css.head}>
        <div className={css.headText}>
          <h1 className={css.heading}>{title}</h1>
          <p className={css.subtitle}>
            {path !== '' && t('detail.meta', { path })}
            {archive !== undefined && archive.updatedAt !== '' && <span className={css.metaPart}>{t('detail.updated', { time: archive.updatedAt })}</span>}
          </p>
        </div>
        <div className={css.sectionActions}>
          <Button size="sm" variant="ghost" icon={<IconRefreshOutlineRegular size={16} />} onClick={props.onRefresh}>{t('refresh')}</Button>
          {archive !== undefined && props.models.length > 0 && (
            <Button size="sm" variant="primary" icon={<IconPlayOutlineRegular size={16} />} onClick={props.onRunModel}>{t('detail.runModel')}</Button>
          )}
        </div>
      </header>
      {project === undefined && (props.loading
        ? <Spinner />
        : <div className={css.notice} role="status">{t('detail.missing')}</div>)}
      {read?.kind === 'missing' && (
        <div className={css.card}>
          <p className={css.cardBody}>{t('project.unarchivedBody')}</p>
          {props.prompts.backfill && (
            <div className={css.cardFoot}>
              <span />
              <Button size="sm" variant="outline" onClick={props.onBackfill}>{t('project.backfill')}</Button>
            </div>
          )}
        </div>
      )}
      {read?.kind === 'unreadable' && <div className={css.notice} role="alert">{t(`project.unreadable.${read.reason}`)}</div>}
      {read?.kind === 'read' && read.newer && (
        <div className={css.notice} role="status">
          {t('detail.newer', { version: read.archive.version ?? KNOWN_ARCHIVE_VERSION, known: KNOWN_ARCHIVE_VERSION })}
        </div>
      )}
      {archive !== undefined && (
        <>
          <div className={css.detailGrid}>
            <KickoffCard archive={archive} t={t} />
            <ScopeCard archive={archive} t={t} />
          </div>
          <TaskTable
            archive={archive}
            models={props.models}
            rerun={props.prompts.rerun}
            notice={openNotice}
            t={t}
            onOpen={(task, output) => { void openOutput(task, output) }}
            onRerun={props.onRerun}
          />
          <div className={css.detailGrid}>
            <Changes archive={archive} t={t} />
            <Sessions workspace={workspace} archived={archivedIds} sessions={props.sessions} t={t} onOpen={props.openSession} />
          </div>
        </>
      )}
      {archive === undefined && read !== undefined && (
        <Sessions workspace={workspace} archived={archivedIds} sessions={props.sessions} t={t} onOpen={props.openSession} />
      )}
    </>
  )
}

function KickoffCard({ archive, t }: { readonly archive: ProjectArchive; readonly t: Translate }) {
  return (
    <section className={css.card} aria-labelledby="audit-workbench-kickoff">
      <h2 id="audit-workbench-kickoff" className={css.cardHeading}>{t('detail.kickoff')}</h2>
      <dl className={css.fields}>
        <dt>{t('field.auditees')}</dt>
        <dd>
          {archive.auditees.length === 0 ? t('empty') : archive.auditees.map((auditee, index) => {
            const facts = [auditee.kind, ...auditee.codes].filter(fact => fact !== '')
            return (
              <span key={index} className={css.fieldLine}>
                {text(auditee.name, t)}
                {facts.length > 0 && <span className={css.caption}>{facts.join(' · ')}</span>}
              </span>
            )
          })}
        </dd>
        <dt>{t('field.auditType')}</dt>
        <dd>{text(archive.auditType, t)}</dd>
        <dt>{t('field.specialAudits')}</dt>
        <dd>{text(archive.specialAudits.join(t('listSeparator')), t)}</dd>
        <dt>{t('field.period')}</dt>
        <dd>{spanText(archive.period, t)}</dd>
        <dt>{t('field.tenure')}</dt>
        <dd>{spanText(archive.tenure, t)}</dd>
      </dl>
      {archive.focus.length > 0 && (
        <>
          <h3 className={css.subHeading}>{t('field.focus')}</h3>
          <ul className={css.bullets}>
            {archive.focus.map((item, index) => (
              <li key={index}>
                {text(item.content, t)}
                {item.section !== '' && <span className={css.caption}> · {item.section}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function Reading({ reading, t }: { readonly reading: ArchiveReading; readonly t: Translate }) {
  if (reading.readAt === '' && reading.file === '') return <p className={css.caption}>{t('detail.notRead')}</p>
  return (
    <>
      {reading.readAt !== '' && <p className={css.caption}>{t('detail.readAt', { time: reading.readAt })}</p>}
      {reading.file !== '' && <p className={css.path}>{reading.file}</p>}
    </>
  )
}

function ScopeCard({ archive, t }: { readonly archive: ProjectArchive; readonly t: Translate }) {
  const { scope } = archive
  const confirmed = scope.confirmedAt !== ''
  return (
    <section className={css.card} aria-labelledby="audit-workbench-scope">
      <div className={css.cardHead}>
        <h2 id="audit-workbench-scope" className={css.cardHeading}>{t('detail.scope')}</h2>
        <Tag tone={confirmed ? 'success' : 'warning'}>{t(confirmed ? 'scope.confirmed' : 'scope.pending')}</Tag>
      </div>
      <dl className={css.fields}>
        <dt>{t('detail.scopeTable')}</dt>
        <dd>{text(scope.tablePath, t)}</dd>
        <dt>{t('detail.scopeVersion')}</dt>
        <dd>{text(scope.tableVersion, t)}</dd>
      </dl>
      {confirmed && <p className={css.caption}>{t('detail.scopeConfirmedAt', { time: scope.confirmedAt })}</p>}
      <h3 className={css.subHeading}>{t('detail.precheck')}</h3>
      <Reading reading={archive.precheck} t={t} />
      <h3 className={css.subHeading}>{t('detail.freshness')}</h3>
      <Reading reading={archive.freshness} t={t} />
    </section>
  )
}

interface TaskTableProps {
  readonly archive: ProjectArchive
  readonly models: readonly WorkbenchModel[]
  readonly rerun: boolean
  readonly notice: string | undefined
  readonly t: Translate
  readonly onOpen: (task: number, output: number) => void
  readonly onRerun: (type: string, index: number) => void
}

function TaskTable({ archive, models, rerun, notice, t, onOpen, onRerun }: TaskTableProps) {
  const modelTitles = useMemo(() => new Set(models.map(model => model.title)), [models])
  return (
    <section className={css.section} aria-labelledby="audit-workbench-tasks">
      <div className={css.sectionHead}>
        <div className={css.sectionTitle}>
          <h2 id="audit-workbench-tasks" className={css.sectionHeading}>{t('detail.tasks')}</h2>
          <span className={css.caption}>{t('detail.tasksCaption')}</span>
        </div>
      </div>
      {notice !== undefined && <div className={css.notice} role="alert">{notice}</div>}
      {archive.tasks.length === 0
        ? <p className={css.caption}>{t('detail.tasksEmpty')}</p>
        : (
          <div className={css.tableScroll}>
            <table className={css.table}>
              <thead>
                <tr>
                  <th scope="col">{t('col.task')}</th>
                  <th scope="col">{t('col.status')}</th>
                  <th scope="col">{t('col.summary')}</th>
                  <th scope="col">{t('col.started')}</th>
                  <th scope="col">{t('col.finished')}</th>
                  <th scope="col">{t('col.outputs')}</th>
                  <th scope="col">{t('col.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {archive.tasks.map((task, index) => (
                  <TaskRow
                    key={index}
                    task={task}
                    index={index}
                    model={modelTitles.has(task.type)}
                    rerun={rerun}
                    t={t}
                    onOpen={onOpen}
                    onRerun={onRerun}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
    </section>
  )
}

interface TaskRowProps {
  readonly task: KickoffTask
  readonly index: number
  readonly model: boolean
  readonly rerun: boolean
  readonly t: Translate
  readonly onOpen: (task: number, output: number) => void
  readonly onRerun: (type: string, index: number) => void
}

function TaskRow({ task, index, model, rerun, t, onOpen, onRerun }: TaskRowProps) {
  return (
    <tr>
      <td>
        <span className={css.taskName}>{text(task.type, t)}</span>
        {model && <Tag tone="info">{t('task.model')}</Tag>}
      </td>
      <td><Tag tone={statusTone(task.status)}>{statusLabel(task, t)}</Tag></td>
      <td>{text(task.summary, t)}</td>
      <td className={css.nowrap}>{text(task.startedAt, t)}</td>
      <td className={css.nowrap}>{text(task.finishedAt, t)}</td>
      <td>
        {task.outputs.map((output, outputIndex) => (
          <button key={outputIndex} type="button" className={css.outputLink} title={output} onClick={() => { onOpen(index, outputIndex) }}>
            <IconFolderOpenOutlineRegular size={14} />
            <span>{baseName(output)}</span>
          </button>
        ))}
        {task.note !== '' && <span className={css.fieldLine}>{task.note}</span>}
        {task.outputs.length === 0 && task.note === '' && t('empty')}
      </td>
      <td>
        {task.status === 'failed' && rerun && (
          <Button size="sm" variant="outline" onClick={() => { onRerun(task.type, index) }}>{t('task.rerun')}</Button>
        )}
        {task.status === 'running' && <span className={css.caption}>{t('task.inSession')}</span>}
      </td>
    </tr>
  )
}

function Changes({ archive, t }: { readonly archive: ProjectArchive; readonly t: Translate }) {
  return (
    <section className={css.card} aria-labelledby="audit-workbench-changes">
      <h2 id="audit-workbench-changes" className={css.cardHeading}>{t('detail.changes')}</h2>
      {archive.changes.length === 0
        ? <p className={css.caption}>{t('detail.changesEmpty')}</p>
        : (
          <ul className={css.log}>
            {archive.changes.map((change, index) => (
              <li key={index}>
                <span className={css.logTime}>{text(change.date, t)}</span>
                <span>
                  {text(change.what, t)}
                  {change.basis !== '' && <span className={clsx(css.fieldLine, css.caption)}>{change.basis}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
    </section>
  )
}

interface SessionsProps {
  readonly workspace: WorkspaceSnapshot['items'][number] | undefined
  readonly archived: readonly SessionId[]
  readonly sessions: SessionListState['byId']
  readonly t: Translate
  readonly onOpen: (sessionId: SessionId) => void
}

function Sessions({ workspace, archived, sessions, t, onOpen }: SessionsProps) {
  const rows = useMemo(() => {
    const hidden = new Set(archived)
    return (workspace?.sessionIds ?? [])
      .flatMap((id) => {
        const row = sessions[id]
        return row === undefined || row.blank || row.parentId !== undefined || row.origin !== undefined || hidden.has(id) ? [] : [row]
      })
      .toSorted((left, right) => right.updatedAt - left.updatedAt)
  }, [workspace, archived, sessions])
  const now = Date.now()
  return (
    <section className={css.card} aria-labelledby="audit-workbench-sessions">
      <h2 id="audit-workbench-sessions" className={css.cardHeading}>{t('detail.sessions')}</h2>
      {rows.length === 0
        ? <p className={css.caption}>{t('detail.sessionsEmpty')}</p>
        : (
          <ul className={css.sessionList}>
            {rows.map((row) => {
              const age = relativeTime(row.updatedAt, now)
              return (
                <li key={row.id}>
                  <button type="button" className={css.sessionRow} onClick={() => { onOpen(row.id) }}>
                    <span className={css.sessionTitle}>{row.displayTitle}</span>
                    <span className={css.caption}>{t(`time.${age.unit}`, { n: age.n })}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
    </section>
  )
}
