/** One-shot tool calls against a real stdio MCP server. */
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { callTool, type ServerLaunch } from '../src/call.ts'

const fixture = join(import.meta.dirname, 'fixtures', 'session-server.mjs')
let cwd: string

beforeAll(async () => { cwd = await realpath(await mkdtemp(join(tmpdir(), 'dsh-audit-workbench-call-'))) })
afterAll(async () => { await rm(cwd, { recursive: true, force: true }) })

function launch(env: Record<string, string> = {}): ServerLaunch {
  return { serverName: 'fixture', command: process.execPath, args: [fixture], cwd, env }
}

describe('callTool', () => {
  it('returns the structured result with the launch environment and directory', async () => {
    const outcome = await callTool(launch({ FIXTURE_VALID: '1' }), 'check_session', { side: 'unit' }, 30_000, new AbortController().signal)
    expect(outcome).toMatchObject({ kind: 'result', isError: false, value: { valid: true, side: 'unit', cwd } })
  })

  it('reads a text-only result as JSON when it parses and as nothing when it does not', async () => {
    const prose = await callTool(launch(), 'prose', {}, 30_000, new AbortController().signal)
    expect(prose).toEqual({ kind: 'result', isError: false, value: undefined, text: 'not json' })
    const mixed = await callTool({ ...launch(), cwd: undefined }, 'mixed', {}, 30_000, new AbortController().signal)
    expect(mixed).toEqual({ kind: 'result', isError: false, value: { valid: true }, text: '{"valid":true}' })
    expect(await callTool(launch(), 'empty', {}, 30_000, new AbortController().signal)).toEqual({ kind: 'result', isError: false, value: undefined, text: '' })
    const broken = await callTool(launch(), 'broken', {}, 30_000, new AbortController().signal)
    expect(broken).toEqual({ kind: 'result', isError: true, value: { valid: false }, text: '{"valid":false}' })
  })

  it('reports a server that does not start as a failed call', async () => {
    const outcome = await callTool({ ...launch(), command: join(cwd, 'absent-uv') }, 'check_session', {}, 30_000, new AbortController().signal)
    expect(outcome.kind).toBe('failed')
  })

  it('reports a call past the deadline as a timeout and rethrows caller cancellation', async () => {
    expect(await callTool(launch(), 'hang', {}, 1_500, new AbortController().signal)).toEqual({ kind: 'timeout' })
    const controller = new AbortController()
    const pending = callTool(launch(), 'hang', {}, 30_000, controller.signal)
    setTimeout(() => { controller.abort(new Error('closed')) }, 500)
    await expect(pending).rejects.toThrow('closed')
  })
})
