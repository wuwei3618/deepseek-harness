/** One audit project: its Project Archive, the Kickoff Tasks with their outputs, and the project's Sessions. */
import { useEffect, useMemo, useRef, useState, type Ref } from 'react'
import clsx from 'clsx'
import {
  Button, IconChevronDownOutlineRegular, IconChevronLeftOutlineRegular, IconChevronRightOutlineRegular, IconFolderOpenOutlineRegular,
  IconPlayOutlineRegular, IconRefreshOutlineRegular, relativeTime, Tag,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type {
  ArchiveReading, KickoffTask, OrgScopeRequest, OutputRequest, ProjectArchive, ProjectEntry, WorkbenchModel, WorkbenchOverview,
} from '@deepseek-ai/dsh-audit-workbench/types'
import { scopeKey, type OpenFailure, type WorkbenchSnapshot } from './source.ts'
import { Spinner } from './dialogs.tsx'
import {
  baseName, groupFocus, hasScope, newestChanges, shortDate, spanText, statusLabel, statusTone, text, type Translate,
} from './format.ts'
import { tallyScope } from './orgtree.ts'
import css from './WorkbenchPage.module.css'

/** Focus items each section shows before the person expands it. */
const FOCUS_SHOWN = 3

/** Change log entries shown before the person asks for all of them. */
const CHANGES_SHOWN = 5

/** Highest Archive Version this page shows in full; the Host reader's `KNOWN_ARCHIVE_VERSION`. */
const KNOWN_ARCHIVE_VERSION = 1

/** Project head props: what the head row names and the actions it offers. */
export interface ProjectHeadProps {
  readonly workspaceId: WorkspaceId
  /** The project's latest read; absent while the first read runs or after its Workspace was removed. */
  readonly project: ProjectEntry | undefined
  readonly workspaces: WorkspaceSnapshot
  readonly models: WorkbenchOverview['models']
  readonly t: Translate
  readonly onBack: () => void
  readonly onRefresh: () => void
  readonly onRunModel: () => void
}

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
  /** Run a recorded Kickoff Task again, by its type and its index in the archive. */
  readonly onRerun: (type: string, index: number) => void
  readonly onBackfill: () => void
  readonly openOutput: (request: OutputRequest) => Promise<'opened' | OpenFailure>
  readonly openSession: (sessionId: SessionId) => void
  /** Organization Scope reads of every project, by `scopeKey`. */
  readonly scopes: WorkbenchSnapshot['scopes']
  /** Read one Auditee's Organization Scope again. */
  readonly readScope: (request: OrgScopeRequest) => void
  /** Show one Auditee's organization scope view. */
  readonly onOpenScope: (auditee: number) => void
}

/**
 * The project's Workspace, directory, and title, from its read or its Workspace.
 * @param workspaceId - the project's Workspace.
 * @param project - its latest read, if any.
 * @param workspaces - the Workspace list.
 * @returns the Workspace if listed, the directory, and the title.
 */
export function projectNames(workspaceId: WorkspaceId, project: ProjectEntry | undefined, workspaces: WorkspaceSnapshot) {
  const workspace = workspaces.items.find(item => item.workspaceId === workspaceId)
  const path = project?.path ?? workspace?.path ?? ''
  return { workspace, path, title: workspace?.title ?? baseName(path) }
}

/**
 * Render the detail view's head row: the way back, the project's title and directory, and its actions.
 * @param props - the project read, Workspace list, copy, and actions.
 * @returns the breadcrumb and head.
 */
export function ProjectHead(props: ProjectHeadProps) {
  const { t } = props
  const { path, title } = projectNames(props.workspaceId, props.project, props.workspaces)
  const read = props.project?.read
  const archive = read?.kind === 'read' ? read.archive : undefined
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
    </>
  )
}

const OPEN_FAILURE_KEYS = { refused: 'open.refused', 'not-found': 'open.notFound', failed: 'open.failed' } as const

/**
 * Render one project's archive, Kickoff Tasks, change log, and Sessions.
 * @param props - the project read, Workspace and Session lists, copy, and actions.
 * @returns the detail view below the head row.
 */
export function ProjectDetail(props: ProjectDetailProps) {
  const { workspaceId, project, workspaces, t } = props
  const [openNotice, setOpenNotice] = useState<string | undefined>(undefined)
  const { workspace } = projectNames(workspaceId, project, workspaces)
  const archivedIds = workspaces.archivedSessionIds
  const read = project?.read
  const archive = read?.kind === 'read' ? read.archive : undefined
  const { readScope } = props
  // Each archive read may follow a rewritten scope file, so each one reads the recorded scopes again.
  useEffect(() => {
    archive?.auditees.forEach((auditee, index) => { if (auditee.scopeFile !== '') readScope({ workspaceId, auditee: index }) })
  }, [archive, workspaceId, readScope])
  const focusCard = useRef<HTMLElement>(null)
  const openOutput = async (task: number, output: number): Promise<void> => {
    setOpenNotice(undefined)
    const outcome = await props.openOutput({ workspaceId, task, output })
    if (outcome !== 'opened') setOpenNotice(t(OPEN_FAILURE_KEYS[outcome]))
  }
  return (
    <>
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
            <KickoffCard
              archive={archive}
              scopes={props.scopes}
              workspaceId={workspaceId}
              t={t}
              onOpenScope={props.onOpenScope}
              onShowFocus={() => { focusCard.current?.scrollIntoView({ block: 'start' }) }}
            />
            <ScopeCard archive={archive} t={t} />
          </div>
          {archive.focus.length > 0 && <FocusCard cardRef={focusCard} focus={archive.focus} t={t} />}
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

interface KickoffCardProps {
  readonly archive: ProjectArchive
  readonly scopes: WorkbenchSnapshot['scopes']
  readonly workspaceId: WorkspaceId
  readonly t: Translate
  readonly onOpenScope: (auditee: number) => void
  readonly onShowFocus: () => void
}

function KickoffCard({ archive, scopes, workspaceId, t, onOpenScope, onShowFocus }: KickoffCardProps) {
  const sections = useMemo(() => new Set(archive.focus.map(item => item.section)).size, [archive.focus])
  return (
    <section className={css.card} aria-labelledby="audit-workbench-kickoff">
      <h2 id="audit-workbench-kickoff" className={css.cardHeading}>{t('detail.kickoff')}</h2>
      <dl className={css.fields}>
        <dt>{t('field.auditees')}</dt>
        <dd>
          {archive.auditees.length === 0 ? t('empty') : archive.auditees.map((auditee, index) => {
            const scope = scopes[scopeKey(workspaceId, index)]
            const read = scope?.status === 'ready' && scope.value.kind === 'read' ? tallyScope(scope.value.scope) : undefined
            const counts = read !== undefined
              ? t('auditee.counts', { codes: read.in, centers: read.profitCenters })
              : auditee.codes.length > 0 ? t('auditee.codes', { codes: auditee.codes.length }) : ''
            const facts = [auditee.kind, counts].filter(fact => fact !== '')
            return (
              <span key={index} className={css.auditee}>
                {text(auditee.name, t)}
                {facts.length > 0 && <span className={css.caption}>{facts.join(t('metaSeparator'))}</span>}
                {hasScope(auditee) && (
                  <button type="button" className={css.textLink} onClick={() => { onOpenScope(index) }}>
                    {t('auditee.viewScope')}
                    <IconChevronRightOutlineRegular size={14} />
                  </button>
                )}
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
        {archive.focus.length > 0 && (
          <>
            <dt>{t('field.focus')}</dt>
            <dd>
              {t('focus.summary', { n: archive.focus.length, sections })}
              {' '}
              <button type="button" className={css.textLink} onClick={onShowFocus}>
                {t('focus.show')}
                <IconChevronDownOutlineRegular size={14} />
              </button>
            </dd>
          </>
        )}
      </dl>
    </section>
  )
}

function FocusCard({ cardRef, focus, t }: { readonly cardRef: Ref<HTMLElement>; readonly focus: ProjectArchive['focus']; readonly t: Translate }) {
  const groups = useMemo(() => groupFocus(focus), [focus])
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set())
  const long = groups.filter(group => group.items.length > FOCUS_SHOWN)
  const allOpen = long.every(group => opened.has(group.section))
  const toggle = (section: string): void => {
    setOpened((current) => {
      const next = new Set(current)
      if (!next.delete(section)) next.add(section)
      return next
    })
  }
  return (
    <section ref={cardRef} className={css.card} aria-labelledby="audit-workbench-focus">
      <div className={css.cardHead}>
        <div className={css.sectionTitle}>
          <h2 id="audit-workbench-focus" className={css.cardHeading}>{t('field.focus')}</h2>
          <span className={css.caption}>{t('focus.summary', { n: focus.length, sections: groups.length })}</span>
        </div>
        {long.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => { setOpened(allOpen ? new Set() : new Set(long.map(group => group.section))) }}>
            {t(allOpen ? 'focus.collapseAll' : 'focus.expandAll')}
          </Button>
        )}
      </div>
      <div className={css.focusGrid}>
        {groups.map((group) => {
          const open = opened.has(group.section)
          const rest = group.items.length - FOCUS_SHOWN
          return (
            <section key={group.section} className={css.focusGroup} aria-label={group.section === '' ? t('focus.noSection') : group.section}>
              <h3 className={css.focusHeading}>
                {group.section === '' ? t('focus.noSection') : group.section}
                <span className={css.caption}>{t('focus.count', { n: group.items.length })}</span>
              </h3>
              <ol className={css.focusList}>
                {(open ? group.items : group.items.slice(0, FOCUS_SHOWN)).map(item => (
                  <li key={item.no}>
                    <span className={css.focusNo}>{t('focus.no', { n: item.no })}</span>
                    <span>{text(item.content, t)}</span>
                  </li>
                ))}
              </ol>
              {rest > 0 && (
                <button type="button" className={css.textLink} aria-expanded={open} onClick={() => { toggle(group.section) }}>
                  {open ? t('focus.less') : t('focus.more', { n: rest })}
                </button>
              )}
            </section>
          )
        })}
      </div>
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
  const rows = useMemo(() => newestChanges(archive.changes), [archive.changes])
  const [all, setAll] = useState(false)
  const [opened, setOpened] = useState<ReadonlySet<number>>(new Set())
  const toggle = (index: number): void => {
    setOpened((current) => {
      const next = new Set(current)
      if (!next.delete(index)) next.add(index)
      return next
    })
  }
  const latest = rows[0]
  return (
    <section className={css.card} aria-labelledby="audit-workbench-changes">
      <div className={css.cardHead}>
        <div className={css.sectionTitle}>
          <h2 id="audit-workbench-changes" className={css.cardHeading}>{t('detail.changes')}</h2>
          {latest !== undefined && <span className={css.caption}>{t('changes.summary', { n: rows.length, time: text(latest.date, t) })}</span>}
        </div>
        {rows.length > CHANGES_SHOWN && (
          <Button size="sm" variant="ghost" onClick={() => { setAll(!all) }}>
            {all ? t('changes.recent', { n: CHANGES_SHOWN }) : t('changes.all', { n: rows.length })}
          </Button>
        )}
      </div>
      {latest === undefined
        ? <p className={css.caption}>{t('detail.changesEmpty')}</p>
        : (
          <ul className={css.log}>
            {(all ? rows : rows.slice(0, CHANGES_SHOWN)).map((change) => {
              const open = opened.has(change.index)
              const line = (
                <>
                  <span className={css.logTime}>{text(shortDate(change.date), t)}</span>
                  <span className={clsx(css.logWhat, open && css.logOpen)}>{text(change.what, t)}</span>
                </>
              )
              return (
                <li key={change.index}>
                  {change.basis === ''
                    ? <div className={css.logRow}>{line}</div>
                    : (
                      <button type="button" className={css.logRow} aria-expanded={open} onClick={() => { toggle(change.index) }}>
                        {line}
                        <IconChevronRightOutlineRegular size={14} className={css.logCaret} />
                      </button>
                    )}
                  {open && <p className={css.logBasis}><span className={css.logBasisLabel}>{t('changes.basis')}</span>{change.basis}</p>}
                </li>
              )
            })}
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
