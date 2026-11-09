/** Workbench manifest validation and prompt filling. */
import { describe, expect, it } from 'vitest'
import { fillTemplate, parseManifest } from '../src/manifest.ts'

const SYSTEM = {
  id: 'dac', title: '数据中心', server: 'daudit',
  check: { tool: 'check_session', ready: { path: ['valid'], equals: true }, message: ['message'] },
  login: { tool: 'get_session', arguments: { timeout: 240 } },
}

describe('parseManifest', () => {
  it('fills defaults for optional fields', () => {
    const parsed = parseManifest(JSON.stringify({ version: 1, systems: [SYSTEM] }))
    expect(parsed).toEqual({ ok: true, manifest: {
      version: 1, models: [], prompts: {},
      systems: [{ ...SYSTEM, description: '', check: { ...SYSTEM.check, arguments: {} } }],
    } })
  })

  it.each([
    ['text that is not JSON', '{', /^not valid JSON/],
    ['another format version', JSON.stringify({ version: 2 }), /^version: /],
    ['an unknown field', JSON.stringify({ version: 1, extra: true }), /extra/],
    ['a placeholder the template may not use', JSON.stringify({ version: 1, prompts: { kickoff: '开工 {{taskId}}' } }),
      /^prompts\.kickoff: the kickoff prompt may use \{\{projectDir\}\}, not \{\{taskId\}\}$/],
    ['a system listed twice', JSON.stringify({ version: 1, systems: [SYSTEM, SYSTEM] }), /system id "dac" is listed twice/],
    ['a model listed twice', JSON.stringify({ version: 1, models: [{ id: 'm', title: 'M', prompt: 'p' }, { id: 'm', title: 'M', prompt: 'p' }] }),
      /model id "m" is listed twice/],
    ['an id with spaces', JSON.stringify({ version: 1, models: [{ id: 'a b', title: 'M', prompt: 'p' }] }), /^models\.0\.id: ids use/],
  ])('rejects %s', (_label, text, message) => {
    const parsed = parseManifest(text)
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.message).toMatch(message)
  })
})

describe('fillTemplate', () => {
  it('replaces each placeholder, tolerating inner spaces', () => {
    expect(fillTemplate('在 {{ projectDir }} 重跑 {{taskId}}{{missing}}', { projectDir: '/p', taskId: 'T1' })).toBe('在 /p 重跑 T1')
  })
})
