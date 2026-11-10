import { describe, expect, it, vi } from 'vitest'
import { RemoteError, type RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { ProjectEntry, SystemCheck, WorkbenchOverview } from '@deepseek-ai/dsh-audit-workbench/types'
import { createWorkbenchSource, type WorkbenchRemote } from '../src/client/source.ts'
import { ALPHA, OVERVIEW, PROJECTS, READY } from './fixtures.ts'

const ok = <T>(value: T): RemoteResult<T> => ({ ok: true, value })
const fail = (code: 'auditWorkbench/no-prompt' | 'auditWorkbench/not-found' | 'auditWorkbench/output-refused' | 'gateway/internal') => ({
  ok: false as const, error: new RemoteError(code, 'refused', code === 'auditWorkbench/no-prompt' ? { kind: 'kickoff' } : code === 'auditWorkbench/not-found' ? { what: 'task' } : {}),
}) as RemoteResult<never>

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

function remote(overrides: Partial<WorkbenchRemote> = {}): WorkbenchRemote {
  return {
    overview: vi.fn(async () => ok<WorkbenchOverview>(OVERVIEW)),
    projects: vi.fn(async () => ok<ProjectEntry[]>(PROJECTS)),
    prompt: vi.fn(async () => ok('提示词')),
    checkSystem: vi.fn(async () => ok<SystemCheck>(READY)),
    login: vi.fn(async () => ok<SystemCheck>(READY)),
    openOutput: vi.fn(async () => ok(undefined)),
    ...overrides,
  }
}

describe('workbench source', () => {
  it('reads everything on the first open, checks every system, and only re-reads projects later', async () => {
    const host = remote()
    const source = createWorkbenchSource(host)
    expect(source.snapshot.getSnapshot()).toEqual({ overview: { status: 'loading' }, projects: { status: 'loading' }, systems: {} })
    await source.open()
    await vi.waitFor(() => { expect(source.snapshot.getSnapshot().systems['tyc']).toEqual({ busy: 'idle', check: READY }) })
    expect(source.snapshot.getSnapshot()).toMatchObject({
      overview: { status: 'ready', value: OVERVIEW }, projects: { status: 'ready', value: PROJECTS },
      systems: { dac: { busy: 'idle', check: READY } },
    })
    expect(host.checkSystem).toHaveBeenCalledTimes(2)
    await source.open()
    expect(host.overview).toHaveBeenCalledTimes(1)
    expect(host.projects).toHaveBeenCalledTimes(2)
  })

  it('publishes errors for a failed or rejected read and checks nothing without an overview', async () => {
    const host = remote({ overview: vi.fn(async () => fail('gateway/internal')), projects: vi.fn(async () => { throw new Error('closed') }) })
    const source = createWorkbenchSource(host)
    await source.refresh()
    expect(source.snapshot.getSnapshot()).toEqual({ overview: { status: 'error' }, projects: { status: 'error' }, systems: {} })
    expect(host.checkSystem).not.toHaveBeenCalled()
  })

  it('keeps only the latest Project Archive read', async () => {
    const first = deferred<RemoteResult<ProjectEntry[]>>()
    const projects = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce(ok([PROJECTS[1]]))
    const source = createWorkbenchSource(remote({ projects }))
    const older = source.refreshProjects()
    await source.refreshProjects()
    first.resolve(ok(PROJECTS))
    await older
    expect(source.snapshot.getSnapshot().projects).toEqual({ status: 'ready', value: [PROJECTS[1]] })
  })

  it('marks a system busy while it runs, ignores a second request, and records a failed call', async () => {
    const pending = deferred<RemoteResult<SystemCheck>>()
    const login = vi.fn(() => pending.promise)
    const checkSystem = vi.fn(async () => fail('gateway/internal'))
    const source = createWorkbenchSource(remote({ login, checkSystem }))
    const running = source.login('dac')
    expect(source.snapshot.getSnapshot().systems['dac']).toEqual({ busy: 'login' })
    await source.check('dac')
    expect(checkSystem).not.toHaveBeenCalled()
    pending.resolve(ok(READY))
    await running
    expect(source.snapshot.getSnapshot().systems['dac']).toEqual({ busy: 'idle', check: READY })
    await source.check('dac')
    expect(source.snapshot.getSnapshot().systems['dac']).toMatchObject({
      busy: 'idle', check: { state: 'failed', reason: 'call-failed', message: '' },
    })
  })

  it('maps prompt and output failures to their reasons', async () => {
    const prompt = vi.fn()
      .mockResolvedValueOnce(ok('开工'))
      .mockResolvedValueOnce(fail('auditWorkbench/no-prompt'))
      .mockResolvedValueOnce(fail('auditWorkbench/not-found'))
      .mockRejectedValueOnce(new Error('closed'))
    const openOutput = vi.fn()
      .mockResolvedValueOnce(ok(undefined))
      .mockResolvedValueOnce(fail('auditWorkbench/output-refused'))
      .mockResolvedValueOnce(fail('auditWorkbench/not-found'))
      .mockResolvedValueOnce(fail('gateway/internal'))
    const source = createWorkbenchSource(remote({ prompt, openOutput }))
    const request = { kind: 'kickoff', workspaceId: ALPHA } as const
    expect(await source.prompt(request)).toEqual({ ok: true, prompt: '开工' })
    expect(await source.prompt(request)).toEqual({ ok: false, reason: 'no-prompt' })
    expect(await source.prompt(request)).toEqual({ ok: false, reason: 'not-found' })
    expect(await source.prompt(request)).toEqual({ ok: false, reason: 'failed' })
    const output = { workspaceId: ALPHA, task: 0, output: 0 }
    expect(await source.openOutput(output)).toBe('opened')
    expect(await source.openOutput(output)).toBe('refused')
    expect(await source.openOutput(output)).toBe('not-found')
    expect(await source.openOutput(output)).toBe('failed')
  })

  it('cancels reads in flight and publishes nothing after dispose', async () => {
    const overview = deferred<RemoteResult<WorkbenchOverview>>()
    const projects = deferred<RemoteResult<ProjectEntry[]>>()
    const check = deferred<RemoteResult<SystemCheck>>()
    let signal: AbortSignal | undefined
    const host = remote({
      overview: vi.fn((given?: AbortSignal) => { signal = given; return overview.promise }),
      projects: vi.fn(() => projects.promise),
      checkSystem: vi.fn(() => check.promise),
    })
    const source = createWorkbenchSource(host)
    const refreshing = source.refresh()
    const checking = source.check('dac')
    source.dispose()
    expect(signal?.aborted).toBe(true)
    overview.resolve(ok(OVERVIEW))
    projects.resolve(ok(PROJECTS))
    check.resolve(ok(READY))
    await Promise.all([refreshing, checking])
    expect(source.snapshot.getSnapshot()).toEqual({ overview: { status: 'loading' }, projects: { status: 'loading' }, systems: { dac: { busy: 'checking' } } })
  })
})
