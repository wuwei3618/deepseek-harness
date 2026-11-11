/** Mount of the workbench Remote namespace and the registration of the workbench page. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-audit-workbench/remote'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { createWorkbenchSource } from './source.ts'
import { WorkbenchIcon } from './WorkbenchIcon.tsx'
import { WorkbenchPage, type WorkbenchInjected } from './WorkbenchPage.tsx'
import { de, en, es, fr, ja, NS, pt, ru, zh } from './locales.ts'

/** Main panel id of the workbench page and its sidebar entry. */
export const PANEL_ID = 'audit-workbench' as MainPanelId

/** Services the page uses besides the mounted `remote.auditWorkbench` namespace. */
export const inject = ['remote', 'slots', 'locale', 'uiWorkspace', 'workspaces']

/** Workspace ids and paths in order; Project Archives are read again only when this changes. */
function workspaceKey(snapshot: WorkspaceSnapshot): string {
  return JSON.stringify(snapshot.items.map(item => [item.workspaceId, item.path]))
}

function registerPage(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'audit-workbench: dictionaries')
  const t = ctx.locale.bind(NS)
  const source = createWorkbenchSource(ctx.remote.auditWorkbench)
  ctx.effect(() => () => { source.dispose() }, 'audit-workbench: Host reads')
  let workspaces = workspaceKey(ctx.workspaces.list.getSnapshot())
  ctx.effect(() => ctx.workspaces.list.subscribe(() => {
    const next = workspaceKey(ctx.workspaces.list.getSnapshot())
    if (next === workspaces) return
    workspaces = next
    // Before the page first opens there is nothing to keep current; its opening reads everything.
    if (source.snapshot.getSnapshot().projects.status !== 'loading') void source.refreshProjects()
  }), 'audit-workbench: Workspace changes')
  const injected = (): WorkbenchInjected => ({
    hooks: { workbench: source.snapshot },
    onOpen: () => { void source.open() },
    onRefresh: () => { void source.refresh() },
    onRefreshProjects: () => { void source.refreshProjects() },
    onCheck: (id) => { void source.check(id) },
    onLogin: (id) => { void source.login(id) },
    preparePrompt: request => source.prompt(request),
    openOutput: request => source.openOutput(request),
    readScope: (request) => { void source.readScope(request) },
    openMembersTable: request => source.openMembersTable(request),
    startSession: (workspaceId, prompt) => { ctx.uiWorkspace.startSession(workspaceId, { prompt, whenDraftExists: 'append' }) },
    openSession: (sessionId) => { ctx.uiWorkspace.openSession(sessionId) },
    pickDirectory: () => ctx.uiWorkspace.pickDirectory(),
    createWorkspace: async (path) => {
      try {
        return (await ctx.workspaces.create({ path })).workspaceId
      } catch (_error: unknown) {
        // The Host refused the directory or the call failed; the dialog reports that it could not add the Workspace.
        return undefined
      }
    },
  })
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: PANEL_ID, locale: NS, inject: injected,
  }, WorkbenchPage))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: PANEL_ID, order: 20, locale: NS, label: () => t('panel'),
  }, WorkbenchIcon))
}

/**
 * Mount the workbench Remote namespace, then register the page under it; both leave together.
 * @param ctx - Client plugin lifetime.
 * @param contribution - generated `auditWorkbench` Remote definitions.
 * @returns disposer that withdraws the page before the Remote namespace.
 */
export async function mountWorkbench(ctx: Context, contribution: TypertRemoteContribution): Promise<() => Promise<void>> {
  const unmountRemote = await ctx.remote.$mount(contribution)
  const page = ctx.inject(['remote.auditWorkbench', ...inject.slice(1)], registerPage)
  try { await page } catch (error) { await page.dispose(); await unmountRemote(); throw error }
  return async () => { await page.dispose(); await unmountRemote() }
}
