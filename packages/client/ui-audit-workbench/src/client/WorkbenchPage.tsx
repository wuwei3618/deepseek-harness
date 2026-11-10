/** Audit workbench main page: the overview, one project's detail, and the dialogs that fill a new Session's prompt. */
import { useEffect, useRef, useState } from 'react'
import { Button, IconRefreshOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { assertNever } from '@deepseek-ai/dsh-util-values'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { OutputRequest, PackStatus, PromptRequest } from '@deepseek-ai/dsh-audit-workbench/types'
import type { OpenFailure, PromptResult, WorkbenchSnapshot } from './source.ts'
import { Overview } from './Overview.tsx'
import { ProjectDetail, ProjectHead } from './ProjectDetail.tsx'
import { ModelsDialog, NewProjectDialog, PromptDialog, type NewProjectState, type PromptDialogState } from './dialogs.tsx'
import type { Translate } from './format.ts'
import css from './WorkbenchPage.module.css'

/** A prepared prompt, or why none was produced. */
export type PromptOutcome = PromptResult

/** Workbench reads and the Workspace and Session actions the page starts. */
export interface WorkbenchInjected {
  /** The workbench's Host reads. */
  readonly hooks: { readonly workbench: HostObservable<WorkbenchSnapshot> }
  /** Read for an opened page: everything the first time, then the Project Archives. */
  readonly onOpen: () => void
  /** Read the overview and the Project Archives again and check every system. */
  readonly onRefresh: () => void
  /** Read the Project Archives again. */
  readonly onRefreshProjects: () => void
  /** Check one system's login. */
  readonly onCheck: (id: string) => void
  /** Run one system's login tool. */
  readonly onLogin: (id: string) => void
  /** Fill a prompt template on the Host. */
  readonly preparePrompt: (request: PromptRequest) => Promise<PromptOutcome>
  /** Open one recorded output on the Host desktop. */
  readonly openOutput: (request: OutputRequest) => Promise<'opened' | OpenFailure>
  /** Open a Workspace's new-Session draft with `prompt` added to it; nothing is sent. */
  readonly startSession: (workspaceId: WorkspaceId, prompt: string) => void
  /** Show one Session. */
  readonly openSession: (sessionId: SessionId) => void
  /** Ask the person for a directory. */
  readonly pickDirectory: () => Promise<string | null>
  /** Register a directory as a Workspace; `undefined` when the Host refused it. */
  readonly createWorkspace: (path: string) => Promise<WorkspaceId | undefined>
}

/** Workbench page props. */
export type WorkbenchPageProps = PropsRuntime<'main'> & InjectFace<WorkbenchInjected> & PropsLocale<'auditWorkbench'>

type Dialog =
  | { readonly kind: 'none' }
  | { readonly kind: 'prompt'; readonly state: PromptDialogState }
  | { readonly kind: 'models'; readonly workspaceId: WorkspaceId }
  | { readonly kind: 'new'; readonly state: NewProjectState }

const FAILURE_KEYS = { 'no-prompt': 'prompt.noPrompt', 'not-found': 'prompt.notFound', 'failed': 'prompt.failed' } as const

/**
 * Render the workbench over the Host reads and the Workspace and Session lists.
 * @param props - workbench reads, actions, standard Workspace and Session hooks, and copy.
 * @returns the page.
 */
export function WorkbenchPage(props: WorkbenchPageProps) {
  const { useWorkbench, useWorkspaces, useSessions, onOpen, t } = props
  const snapshot = useWorkbench(value => value)
  const workspaces = useWorkspaces(value => value)
  const sessions = useSessions(value => value.byId)
  const [selected, setSelected] = useState<WorkspaceId | undefined>(undefined)
  const [dialog, setDialog] = useState<Dialog>({ kind: 'none' })
  // Each prompt request takes a number; a result that is no longer the latest request is dropped.
  const promptRequest = useRef(0)
  useEffect(() => { onOpen() }, [onOpen])

  const title = (workspaceId: WorkspaceId, path: string): string =>
    workspaces.items.find(item => item.workspaceId === workspaceId)?.title ?? path
  const closeDialog = (): void => {
    promptRequest.current++
    setDialog({ kind: 'none' })
  }
  const askPrompt = (request: PromptRequest, heading: string): void => {
    const id = ++promptRequest.current
    const workspace = workspaces.items.find(item => item.workspaceId === request.workspaceId)
    const base = { request, title: heading, workspace: workspace?.title ?? '' }
    setDialog({ kind: 'prompt', state: { ...base, phase: 'loading' } })
    void props.preparePrompt(request).then((outcome) => {
      if (id !== promptRequest.current) return
      setDialog({ kind: 'prompt', state: outcome.ok
        ? { ...base, phase: 'ready', prompt: outcome.prompt }
        : { ...base, phase: 'failed', message: t(FAILURE_KEYS[outcome.reason]) } })
    })
  }
  const confirmPrompt = (workspaceId: WorkspaceId, prompt: string): void => {
    closeDialog()
    props.startSession(workspaceId, prompt)
  }
  const pickDirectory = async (state: NewProjectState): Promise<void> => {
    const path = await props.pickDirectory()
    if (path === null) return
    setDialog(current => current.kind === 'new' && current.state === state
      ? { kind: 'new', state: { phase: 'chosen', path } } : current)
  }
  const createProject = async (path: string): Promise<void> => {
    const id = ++promptRequest.current
    setDialog({ kind: 'new', state: { phase: 'creating', path } })
    const workspaceId = await props.createWorkspace(path)
    if (id !== promptRequest.current) return
    if (workspaceId === undefined) {
      setDialog({ kind: 'new', state: { phase: 'chosen', path, message: t('new.createFailed') } })
      return
    }
    const outcome = await props.preparePrompt({ kind: 'kickoff', workspaceId })
    if (id !== promptRequest.current) return
    if (!outcome.ok) {
      setDialog({ kind: 'new', state: { phase: 'created', path, message: t(FAILURE_KEYS[outcome.reason]) } })
      return
    }
    closeDialog()
    props.startSession(workspaceId, outcome.prompt)
  }

  const project = selected === undefined || snapshot.projects.status !== 'ready'
    ? undefined
    : snapshot.projects.value.find(entry => entry.workspaceId === selected)
  const overview = snapshot.overview.status === 'ready' ? snapshot.overview.value : undefined
  const models = overview?.models ?? []
  return (
    <div className={css.page}>
      <div className={css.bar} data-window-drag>
        <div className={css.barColumn}>
          {selected === undefined
            ? (
              <header className={css.head}>
                <div className={css.headText}>
                  <h1 className={css.heading}>{t('title')}</h1>
                  <p className={css.subtitle}>{t('subtitle')}</p>
                </div>
              </header>
            )
            : (
              <ProjectHead
                workspaceId={selected}
                project={project}
                workspaces={workspaces}
                models={models}
                t={t}
                onBack={() => { setSelected(undefined) }}
                onRefresh={props.onRefreshProjects}
                onRunModel={() => { setDialog({ kind: 'models', workspaceId: selected }) }}
              />
            )}
        </div>
      </div>
      <div className={css.scroller}>
        <div className={css.body}>
          {selected === undefined
            ? (
              <>
                {snapshot.overview.status === 'error' && <PageNotice t={t} onRetry={props.onRefresh} />}
                {overview !== undefined && <PackNotice pack={overview.pack} t={t} onRetry={props.onRefresh} />}
                <Overview
                  snapshot={snapshot}
                  workspaceTitle={title}
                  t={t}
                  onRefresh={props.onRefresh}
                  onRefreshProjects={props.onRefreshProjects}
                  onCheck={props.onCheck}
                  onLogin={props.onLogin}
                  onOpenProject={setSelected}
                  onBackfill={(workspaceId) => { askPrompt({ kind: 'backfill', workspaceId }, t('prompt.backfillTitle')) }}
                  onNewProject={() => { setDialog({ kind: 'new', state: { phase: 'empty' } }) }}
                />
              </>
            )
            : (
              <ProjectDetail
                workspaceId={selected}
                project={project}
                loading={snapshot.projects.status === 'loading'}
                workspaces={workspaces}
                sessions={sessions}
                models={models}
                prompts={overview?.prompts ?? { kickoff: false, backfill: false, rerun: false }}
                t={t}
                onRerun={(task, index) => {
                  askPrompt({ kind: 'rerun', workspaceId: selected, task: index }, t('prompt.rerunTitle', { task }))
                }}
                onBackfill={() => { askPrompt({ kind: 'backfill', workspaceId: selected }, t('prompt.backfillTitle')) }}
                openOutput={props.openOutput}
                openSession={props.openSession}
              />
            )}
        </div>
      </div>
      {dialog.kind === 'prompt' && (
        <PromptDialog state={dialog.state} t={t} onClose={closeDialog} onConfirm={confirmPrompt} />
      )}
      {dialog.kind === 'models' && (
        <ModelsDialog
          models={models}
          t={t}
          onClose={closeDialog}
          onPick={(model) => {
            askPrompt({ kind: 'model', workspaceId: dialog.workspaceId, model: model.id }, t('prompt.modelTitle', { model: model.title }))
          }}
        />
      )}
      {dialog.kind === 'new' && (
        <NewProjectDialog
          state={dialog.state}
          t={t}
          onClose={closeDialog}
          onPick={() => { void pickDirectory(dialog.state) }}
          onConfirm={(path) => { void createProject(path) }}
        />
      )}
    </div>
  )
}

function PageNotice({ t, onRetry }: { readonly t: Translate; readonly onRetry: () => void }) {
  return (
    <div className={css.notice} role="alert">
      <span>{t('overview.error')}</span>
      <Button size="sm" variant="outline" icon={<IconRefreshOutlineRegular size={16} />} onClick={onRetry}>{t('retry')}</Button>
    </div>
  )
}

function PackNotice({ pack, t, onRetry }: { readonly pack: PackStatus; readonly t: Translate; readonly onRetry: () => void }) {
  switch (pack.kind) {
    case 'missing':
    case 'invalid':
      return (
        <section className={css.emptyState} aria-labelledby="audit-workbench-pack">
          <h2 id="audit-workbench-pack" className={css.emptyTitle}>{t(pack.kind === 'missing' ? 'pack.missing.title' : 'pack.invalid.title')}</h2>
          <p className={css.emptyBody}>
            {pack.kind === 'missing'
              ? t('pack.missing.body', { root: pack.root })
              : t('pack.invalid.body', { root: pack.root, message: pack.message })}
          </p>
          <Button variant="outline" icon={<IconRefreshOutlineRegular size={16} />} onClick={onRetry}>{t('refresh')}</Button>
        </section>
      )
    case 'loaded':
      if (pack.manifest.kind === 'ready') return null
      return (
        <div className={css.notice} role="status">
          {pack.manifest.kind === 'missing'
            ? t('manifest.missing', { name: pack.name, version: pack.version })
            : t('manifest.invalid', { message: pack.manifest.message })}
        </div>
      )
    /* v8 ignore next -- PackStatus is a closed union of the three handled kinds. */
    default: return assertNever(pack, 'audit workbench pack status')
  }
}
