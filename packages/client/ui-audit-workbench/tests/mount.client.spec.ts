// @vitest-environment jsdom
/** The workbench page and its sidebar entry mount under the Remote namespace and leave with it. */
import { createElement } from 'react'
import { render } from '@testing-library/react'
import { allowAllAccess, contextMenuHook } from '@deepseek-ai/dsh-client-test-runtime'
import assert from 'node:assert/strict'
import { Context, Service } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { resolveSlotLabel, type StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { OrgScopeRead, ProjectEntry } from '@deepseek-ai/dsh-audit-workbench/types'
import remote from '@deepseek-ai/dsh-audit-workbench/remote'
import { apply } from '../src/client/index.ts'
import { apply as applyNode } from '../src/index.ts'
import { inject, mountWorkbench, PANEL_ID } from '../src/client/mount.ts'
import type { WorkbenchInjected } from '../src/client/WorkbenchPage.tsx'
import { WorkbenchPage } from '../src/client/WorkbenchPage.tsx'
import { WorkbenchIcon } from '../src/client/WorkbenchIcon.tsx'
import { scopeKey } from '../src/client/source.ts'
import { ALPHA, ORG_SCOPE, OVERVIEW, PROJECTS, READY } from './fixtures.ts'

const contribution: TypertRemoteContribution = { package: '@deepseek-ai/dsh-audit-workbench', descriptors: [] }
const ok = <T>(value: T): RemoteResult<T> => ({ ok: true, value })

function workspaces(items: Array<{ workspaceId: string; path: string }>): WorkspaceSnapshot {
  return {
    items: items.map(item => ({ workspaceId: item.workspaceId as WorkspaceId, path: item.path, title: item.path, sessionIds: [], createdAt: '', updatedAt: '' })),
    archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
  }
}

async function fixture(options: { failMount?: boolean } = {}) {
  const ctx = new Context()
  const unmount = vi.fn(async () => {})
  const mounted: TypertRemoteContribution[] = []
  class TestRemote extends Service {
    constructor() { super(ctx, 'remote') }
    async $mount(value: TypertRemoteContribution) { mounted.push(value); return unmount }
  }
  new TestRemote()
  const host = {
    overview: vi.fn(async () => ok(OVERVIEW)),
    projects: vi.fn(async () => ok<ProjectEntry[]>(PROJECTS)),
    prompt: vi.fn(async () => ok('提示词')),
    checkSystem: vi.fn(async () => ok(READY)),
    login: vi.fn(async () => ok(READY)),
    openOutput: vi.fn(async () => ok(undefined)),
    orgScope: vi.fn(async () => ok<OrgScopeRead>({ kind: 'read', scope: ORG_SCOPE })),
    openMembersTable: vi.fn(async () => ok(undefined)),
  }
  ctx.provide('remote.auditWorkbench', host as never)
  ctx.provide('locale', new LocaleRuntime(ctx))
  const list = createSnapshotStore(workspaces([{ workspaceId: 'ws-alpha', path: '/projects/alpha' }]))
  const create = vi.fn(async ({ path }: { path: string }) => {
    if (path === '/refused') throw new Error('refused')
    return { workspaceId: 'ws-new', path, title: 'new', sessionIds: [], createdAt: '', updatedAt: '' }
  })
  const broken = { getSnapshot: () => { throw new Error('no Workspace list') }, subscribe: () => () => {} }
  ctx.provide('workspaces', { list: options.failMount === true ? broken : list, create } as never)
  const uiWorkspace = { startSession: vi.fn(), openSession: vi.fn(), pickDirectory: vi.fn(async () => '/projects/new') }
  ctx.provide('uiWorkspace', uiWorkspace as never)
  await ctx.plugin(SlotRegistry)
  ctx.slots.register({ name: 'root', children: {
    'main': { kind: 'keyed', scope: 'root' },
    'sidebar.panellist': { kind: 'list', scope: 'root' },
  } } as never, () => null)
  return { ctx, host, list, create, uiWorkspace, unmount, mounted }
}

function isFace(value: object): value is WorkbenchInjected {
  return 'preparePrompt' in value
}

function face(entry: StoredEntry): WorkbenchInjected {
  const value = entry.inject?.()
  assert(value !== undefined && isFace(value))
  return value
}

describe('workbench plugin', () => {
  it('names its dependencies, keeps the Host half empty, and mounts the generated namespace', async () => {
    expect(inject).toEqual(['remote', 'slots', 'locale', 'uiWorkspace', 'workspaces'])
    expect(applyNode).not.toThrow()
    const b = await fixture()
    try {
      const dispose = await apply(b.ctx)
      expect(b.mounted).toEqual([remote])
      await dispose()
    } finally { await b.ctx.fiber.dispose() }
  })

  it('registers the page and its sidebar entry and wires their actions', async () => {
    const b = await fixture()
    try {
      const dispose = await mountWorkbench(b.ctx, contribution)
      expect(b.mounted).toEqual([contribution])
      const [panel] = b.ctx.slots.entries('sidebar.panellist')
      assert(panel !== undefined)
      expect(panel.options.id).toBe(PANEL_ID)
      expect(panel.component).toBe(WorkbenchIcon)
      expect(resolveSlotLabel(panel.options.label)).toBe('Audit workbench')
      const [page] = b.ctx.slots.entries('main')
      assert(page !== undefined)
      expect(page.options.key).toBe(PANEL_ID)
      expect(page.component).toBe(WorkbenchPage)
      const injected = face(page)
      injected.onOpen()
      await vi.waitFor(() => { expect(b.host.checkSystem).toHaveBeenCalledTimes(2) })
      expect(injected.hooks.workbench.getSnapshot().projects).toEqual({ status: 'ready', value: PROJECTS })
      injected.onRefresh()
      injected.onRefreshProjects()
      injected.onCheck('dac')
      injected.onLogin('tyc')
      await vi.waitFor(() => { expect(b.host.login).toHaveBeenCalledWith('tyc', expect.any(AbortSignal)) })
      expect(await injected.preparePrompt({ kind: 'kickoff', workspaceId: ALPHA })).toEqual({ ok: true, prompt: '提示词' })
      expect(await injected.openOutput({ workspaceId: ALPHA, task: 0, output: 0 })).toBe('opened')
      injected.readScope({ workspaceId: ALPHA, auditee: 0 })
      await vi.waitFor(() => {
        expect(injected.hooks.workbench.getSnapshot().scopes[scopeKey(ALPHA, 0)]).toEqual({ status: 'ready', value: { kind: 'read', scope: ORG_SCOPE } })
      })
      expect(await injected.openMembersTable({ workspaceId: ALPHA, auditee: 0 })).toBe('opened')
      injected.startSession(ALPHA, '提示词')
      expect(b.uiWorkspace.startSession).toHaveBeenCalledWith(ALPHA, { prompt: '提示词', whenDraftExists: 'append' })
      injected.openSession('s-1' as SessionId)
      expect(b.uiWorkspace.openSession).toHaveBeenCalledWith('s-1')
      expect(await injected.pickDirectory()).toBe('/projects/new')
      expect(await injected.createWorkspace('/projects/new')).toBe('ws-new')
      expect(await injected.createWorkspace('/refused')).toBeUndefined()
      await dispose()
      expect(b.ctx.slots.entries('main')).toHaveLength(0)
      expect(b.unmount).toHaveBeenCalledTimes(1)
    } finally { await b.ctx.fiber.dispose() }
  })

  it('reads the Project Archives again when the Workspace set changes after the first read', async () => {
    const b = await fixture()
    try {
      await mountWorkbench(b.ctx, contribution)
      b.list.set(workspaces([{ workspaceId: 'ws-beta', path: '/projects/beta' }]))
      expect(b.host.projects).not.toHaveBeenCalled()
      const [page] = b.ctx.slots.entries('main')
      assert(page !== undefined)
      face(page).onOpen()
      await vi.waitFor(() => { expect(b.host.projects).toHaveBeenCalledTimes(1) })
      await vi.waitFor(() => { expect(face(page).hooks.workbench.getSnapshot().projects.status).toBe('ready') })
      b.list.set({ ...b.list.getSnapshot() })
      expect(b.host.projects).toHaveBeenCalledTimes(1)
      b.list.set(workspaces([{ workspaceId: 'ws-gamma', path: '/projects/gamma' }]))
      await vi.waitFor(() => { expect(b.host.projects).toHaveBeenCalledTimes(2) })
    } finally { await b.ctx.fiber.dispose() }
  })

  it('withdraws the Remote namespace when the page cannot register', async () => {
    const b = await fixture({ failMount: true })
    try {
      await expect(mountWorkbench(b.ctx, contribution)).rejects.toThrow('no Workspace list')
      expect(b.unmount).toHaveBeenCalledTimes(1)
    } finally { await b.ctx.fiber.dispose() }
  })

  it('renders only a decorative glyph at the requested size for the sidebar entry', () => {
    const unread = (): never => { throw new Error('the sidebar icon reads no application state') }
    const view = render(createElement(WorkbenchIcon, {
      size: 18, active: false, usePanelInfo: unread, useSessions: unread, useWorkspaces: unread,
      useContextMenu: contextMenuHook(), useResource: unread, useSessionStatus: unread, useSessionRetainInfo: unread,
      ...allowAllAccess,
    }))
    const glyph = view.container.firstElementChild
    expect(glyph?.tagName.toLowerCase()).toBe('svg')
    expect(glyph?.getAttribute('width')).toBe('18')
    expect(view.container.textContent).toBe('')
    view.unmount()
  })
})
