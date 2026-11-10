/** Workbench overview: System Login Status cards and one card per audit project. */
import { Button, IconPlusOutlineRegular, IconRefreshOutlineRegular, Tag, type TagTone } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ArchiveRead, ProjectEntry, SystemCheckFailure, WorkbenchOverview, WorkbenchSystem } from '@deepseek-ai/dsh-audit-workbench/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { SystemState, WorkbenchSnapshot } from './source.ts'
import { assertNever } from '@deepseek-ai/dsh-util-values'
import { clockTime, spanText, tallyTasks, text, type Translate } from './format.ts'
import css from './WorkbenchPage.module.css'

/** Overview props: the Host reads, Workspace titles, and the actions the cards start. */
export interface OverviewProps {
  readonly snapshot: WorkbenchSnapshot
  readonly workspaceTitle: (workspaceId: WorkspaceId, path: string) => string
  readonly t: Translate
  readonly onRefresh: () => void
  readonly onRefreshProjects: () => void
  readonly onCheck: (id: string) => void
  readonly onLogin: (id: string) => void
  readonly onOpenProject: (workspaceId: WorkspaceId) => void
  readonly onBackfill: (workspaceId: WorkspaceId) => void
  readonly onNewProject: () => void
}

/**
 * Render the systems section, when the pack's manifest is ready, and the projects section.
 * @param props - reads, titles, copy, and actions.
 * @returns the overview sections.
 */
export function Overview(props: OverviewProps) {
  const { snapshot, t } = props
  const overview = snapshot.overview.status === 'ready' ? snapshot.overview.value : undefined
  const manifestReady = overview?.pack.kind === 'loaded' && overview.pack.manifest.kind === 'ready'
  return (
    <>
      {overview !== undefined && manifestReady && (
        <Systems
          overview={overview}
          systems={snapshot.systems}
          t={t}
          onRefresh={props.onRefresh}
          onCheck={props.onCheck}
          onLogin={props.onLogin}
        />
      )}
      <section className={css.section} aria-labelledby="audit-workbench-projects">
        <div className={css.sectionHead}>
          <div className={css.sectionTitle}>
            <h2 id="audit-workbench-projects" className={css.sectionHeading}>{t('projects.title')}</h2>
            <span className={css.caption}>{t('projects.caption')}</span>
          </div>
          <div className={css.sectionActions}>
            <Button size="sm" variant="ghost" icon={<IconRefreshOutlineRegular size={16} />} onClick={props.onRefreshProjects}>
              {t('refresh')}
            </Button>
            {overview?.prompts.kickoff === true && (
              <Button size="sm" variant="outline" icon={<IconPlusOutlineRegular size={16} />} onClick={props.onNewProject}>
                {t('projects.new')}
              </Button>
            )}
          </div>
        </div>
        <Projects {...props} backfill={overview?.prompts.backfill === true} />
      </section>
    </>
  )
}

interface SystemsProps {
  readonly overview: WorkbenchOverview
  readonly systems: WorkbenchSnapshot['systems']
  readonly t: Translate
  readonly onRefresh: () => void
  readonly onCheck: (id: string) => void
  readonly onLogin: (id: string) => void
}

function Systems({ overview, systems, t, onRefresh, onCheck, onLogin }: SystemsProps) {
  return (
    <section className={css.section} aria-labelledby="audit-workbench-systems">
      <div className={css.sectionHead}>
        <div className={css.sectionTitle}>
          <h2 id="audit-workbench-systems" className={css.sectionHeading}>{t('systems.title')}</h2>
        </div>
        <div className={css.sectionActions}>
          <Button size="sm" variant="ghost" icon={<IconRefreshOutlineRegular size={16} />} onClick={onRefresh}>{t('systems.refreshAll')}</Button>
        </div>
      </div>
      {overview.systems.length === 0
        ? <p className={css.caption}>{t('systems.empty')}</p>
        : (
          <ul className={css.systemGrid}>
            {overview.systems.map(system => (
              <SystemCard key={system.id} system={system} state={systems[system.id]} t={t} onCheck={onCheck} onLogin={onLogin} />
            ))}
          </ul>
        )}
    </section>
  )
}

const FAILURE_KEYS: Readonly<Record<SystemCheckFailure, 'system.failure.unavailable' | 'system.failure.timeout'
  | 'system.failure.callFailed' | 'system.failure.unreadable'>> = {
  'unavailable': 'system.failure.unavailable',
  'timeout': 'system.failure.timeout',
  'call-failed': 'system.failure.callFailed',
  'unreadable': 'system.failure.unreadable',
}

interface SystemCardProps {
  readonly system: WorkbenchSystem
  readonly state: SystemState | undefined
  readonly t: Translate
  readonly onCheck: (id: string) => void
  readonly onLogin: (id: string) => void
}

function systemBadge(state: SystemState | undefined, t: Translate): { readonly tone: TagTone; readonly label: string } {
  if (state?.busy === 'checking') return { tone: 'neutral', label: t('system.checking') }
  if (state?.busy === 'login') return { tone: 'info', label: t('system.waitingLogin') }
  switch (state?.check?.state) {
    case 'ready': return { tone: 'success', label: t('system.ready') }
    case 'login-required': return { tone: 'warning', label: t('system.loginRequired') }
    case 'failed': return { tone: 'danger', label: t('system.failed') }
    default: return { tone: 'outline', label: t('system.notChecked') }
  }
}

function SystemCard({ system, state, t, onCheck, onLogin }: SystemCardProps) {
  const check = state?.check
  const badge = systemBadge(state, t)
  const idle = state === undefined || state.busy === 'idle'
  let detail = ''
  if (state?.busy === 'login') detail = t('system.loginHint')
  else if (check?.state === 'failed') detail = check.message === '' ? t(FAILURE_KEYS[check.reason]) : check.message
  else if (check?.state === 'login-required') detail = check.message
  return (
    <li className={css.card}>
      <div className={css.cardHead}>
        <span className={css.cardTitle}>{system.title}</span>
        <Tag tone={badge.tone}>{badge.label}</Tag>
      </div>
      {system.description !== '' && <p className={css.cardBody}>{system.description}</p>}
      {detail !== '' && <p className={css.cardDetail}>{detail}</p>}
      <div className={css.cardFoot}>
        <span className={css.caption}>{check === undefined ? '' : t('system.checkedAt', { time: clockTime(check.checkedAt) })}</span>
        <div className={css.cardActions}>
          {system.login && check?.state === 'login-required' && (
            <Button size="sm" variant="primary" disabled={!idle} onClick={() => { onLogin(system.id) }}>{t('system.login')}</Button>
          )}
          <Button size="sm" variant="ghost" disabled={!idle} onClick={() => { onCheck(system.id) }}>{t('system.recheck')}</Button>
        </div>
      </div>
    </li>
  )
}

interface ProjectsProps extends OverviewProps {
  readonly backfill: boolean
}

function Projects({ snapshot, workspaceTitle, t, onRefreshProjects, onOpenProject, onBackfill, backfill }: ProjectsProps) {
  const { projects } = snapshot
  if (projects.status === 'loading') {
    return (
      <ul className={css.projectGrid} aria-busy="true">
        <li className={css.skeleton} />
        <li className={css.skeleton} />
      </ul>
    )
  }
  if (projects.status === 'error') {
    return (
      <div className={css.notice} role="alert">
        <span>{t('projects.error')}</span>
        <Button size="sm" variant="outline" onClick={onRefreshProjects}>{t('retry')}</Button>
      </div>
    )
  }
  if (projects.value.length === 0) return <p className={css.caption}>{t('projects.empty')}</p>
  return (
    <ul className={css.projectGrid}>
      {projects.value.map(entry => (
        <ProjectCard
          key={entry.workspaceId}
          entry={entry}
          title={workspaceTitle(entry.workspaceId, entry.path)}
          t={t}
          backfill={backfill}
          onOpen={() => { onOpenProject(entry.workspaceId) }}
          onBackfill={() => { onBackfill(entry.workspaceId) }}
        />
      ))}
    </ul>
  )
}

interface ProjectCardProps {
  readonly entry: ProjectEntry
  readonly title: string
  readonly t: Translate
  readonly backfill: boolean
  readonly onOpen: () => void
  readonly onBackfill: () => void
}

function ProjectCard({ entry, title, t, backfill, onOpen, onBackfill }: ProjectCardProps) {
  return (
    <li className={css.card}>
      <div className={css.cardHead}>
        <span className={css.cardTitle}>{title}</span>
        <ProjectTag read={entry.read} t={t} />
      </div>
      <ProjectCardBody entry={entry} t={t} backfill={backfill} onOpen={onOpen} onBackfill={onBackfill} />
    </li>
  )
}

function ProjectTag({ read, t }: { readonly read: ArchiveRead; readonly t: Translate }) {
  switch (read.kind) {
    case 'missing': return <Tag tone="warning">{t('project.unarchived')}</Tag>
    case 'unreadable': return <Tag tone="danger">{t('project.unreadable')}</Tag>
    case 'read': return <span className={css.caption}>{t('project.updated', { time: text(read.archive.updatedAt, t) })}</span>
    /* v8 ignore next -- ArchiveRead is a closed union of the three handled kinds. */
    default: return assertNever(read, 'audit workbench archive read')
  }
}

function ProjectCardBody({ entry, t, backfill, onOpen, onBackfill }: Omit<ProjectCardProps, 'title'>) {
  const { read } = entry
  if (read.kind === 'missing') {
    return (
      <>
        <p className={css.cardBody}>{t('project.unarchivedBody')}</p>
        <p className={css.path}>{entry.path}</p>
        <div className={css.cardFoot}>
          <span />
          <div className={css.cardActions}>
            {backfill && <Button size="sm" variant="outline" onClick={onBackfill}>{t('project.backfill')}</Button>}
          </div>
        </div>
      </>
    )
  }
  if (read.kind === 'unreadable') {
    return (
      <>
        <p className={css.cardDetail}>{t(`project.unreadable.${read.reason}`)}</p>
        <p className={css.path}>{entry.path}</p>
      </>
    )
  }
  const { archive } = read
  const tally = tallyTasks(archive.tasks)
  const percent = (count: number): string => `${tally.total === 0 ? 0 : (count * 100) / tally.total}%`
  return (
    <>
      <dl className={css.fields}>
        <dt>{t('field.auditees')}</dt>
        <dd>{text(archive.auditees.map(auditee => auditee.name).filter(name => name !== '').join(t('listSeparator')), t)}</dd>
        <dt>{t('field.auditType')}</dt>
        <dd>{text(archive.auditType, t)}</dd>
        <dt>{t('field.period')}</dt>
        <dd>{spanText(archive.period, t)}</dd>
        <dt>{t('field.scope')}</dt>
        <dd>{t(archive.scope.confirmedAt === '' ? 'scope.pending' : 'scope.confirmed')}</dd>
      </dl>
      <div className={css.progress} aria-hidden="true">
        <span className={css.progressDone} style={{ width: percent(tally.done) }} />
        <span className={css.progressRunning} style={{ width: percent(tally.running) }} />
        <span className={css.progressFailed} style={{ width: percent(tally.failed) }} />
      </div>
      <p className={css.caption}>{t('project.tasks', { ...tally })}</p>
      <div className={css.cardFoot}>
        <span />
        <div className={css.cardActions}>
          <Button size="sm" variant="outline" onClick={onOpen}>{t('project.open')}</Button>
        </div>
      </div>
    </>
  )
}
