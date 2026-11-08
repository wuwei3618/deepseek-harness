import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PROFILE_TEMPLATES } from '@deepseek-ai/dsh-official-bundles'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseDshArgs } from '../src/args.ts'
import { AUDIT_RELEASE_LOCKED, resolveReleaseProfile, restoreTemplateBundles } from '../src/release-lock.ts'

const locked = (argv: string[], manageDesktopProfile = false) => parseDshArgs(argv, '1.2.3', manageDesktopProfile, true)

/** Run a locked parse that must exit; returns the exit code and the error text Commander wrote. */
function refusal(argv: string[], manageDesktopProfile = false): { code: number; stderr: string } {
  const exit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit') })
  vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
  try {
    locked(argv, manageDesktopProfile)
    throw new Error(`expected ${JSON.stringify(argv)} to exit`)
  } catch {
    return { code: exit.mock.calls.at(-1)?.[0] as number, stderr: stderr.mock.calls.map(call => String(call[0])).join('') }
  } finally {
    vi.restoreAllMocks()
  }
}

afterEach(() => { vi.restoreAllMocks() })

describe('the audit release lock', () => {
  it('is off in source launches and tests', () => {
    expect(AUDIT_RELEASE_LOCKED).toBe(false)
  })

  it('boots the audit templates and maps the upstream application names to them', () => {
    expect(locked(['audit', 'review', 'a.txt'])).toEqual({ mode: 'profile', profile: 'audit', patches: [], args: ['review', 'a.txt'] })
    expect(locked(['--profile', 'audit-sdk'])).toEqual({ mode: 'profile', profile: 'audit-sdk', patches: [], args: [] })
    expect(locked(['audit-acp'])).toEqual({ mode: 'profile', profile: 'audit-acp', patches: [], args: [] })
    expect(locked(['headless', 'task'])).toEqual({ mode: 'profile', profile: 'audit', patches: [], args: ['task'] })
    expect(locked(['sdk', '--stdio'])).toEqual({ mode: 'profile', profile: 'audit-sdk', patches: [], args: ['--stdio'] })
    expect(locked(['acp'])).toEqual({ mode: 'profile', profile: 'audit-acp', patches: [], args: [] })
  })

  it('keeps config dumps of the audit templates', () => {
    expect(locked(['sdk', '--dump-config']))
      .toEqual({ mode: 'dump-config', profile: 'audit-sdk', defaultOnly: false, patches: [] })
  })

  it('maps only templates that exist', () => {
    for (const profile of ['audit', 'audit-sdk', 'audit-acp', 'headless', 'sdk', 'acp']) {
      expect(PROFILE_TEMPLATES[resolveReleaseProfile(profile) ?? '']).toBeDefined()
    }
    expect(resolveReleaseProfile('constructor')).toBeUndefined()
  })

  it.each([['web'], ['tui'], ['custom'], ['audit-desktop'], ['Audit'], ['sdk-minimal']])('refuses profile %s', (profile) => {
    const result = refusal([profile])
    expect(result.code).toBe(1)
    expect(result.stderr).toContain(`profile ${JSON.stringify(profile)} is unavailable in this audit release; use one of audit, audit-sdk, audit-acp`)
  })

  it.each([
    [['audit', '--patch', 'extra.yml'], '--patch is unavailable'],
    [['audit', '--patch', 'extra.yml', '--dump-config'], '--patch is unavailable'],
    [['--profile', 'custom', '--from-default-profile', 'audit'], '--from-default-profile is unavailable'],
    [['plugin', '--profile', 'audit', 'add', 'example-plugin'], 'plugin management is unavailable'],
  ])('refuses %j', (argv, message) => {
    const result = refusal(argv)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain(message)
  })

  it('refuses plugin commands from the Desktop carrier', () => {
    expect(refusal(['plugin', '--profile', 'desktop', 'add', 'example-plugin'], true).stderr)
      .toContain('plugin management is unavailable')
  })

  it('leaves unlocked parsing unchanged', () => {
    expect(parseDshArgs(['web', '--patch', 'a.yml'], '1.2.3')).toEqual({ mode: 'profile', profile: 'web', patches: ['a.yml'], args: [] })
  })
})

describe('restoreTemplateBundles', () => {
  const dirs: string[] = []
  afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

  function profile(manifest?: object): string {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-release-lock-'))
    dirs.push(dir)
    mkdirSync(dir, { recursive: true })
    if (manifest !== undefined) writeFileSync(join(dir, 'package.json'), `${JSON.stringify(manifest, undefined, 2)}\n`)
    return dir
  }
  const read = (dir: string): Record<string, unknown> => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Record<string, unknown>

  it('rewrites a different bundle list and keeps the other manifest fields', () => {
    const dir = profile({ name: 'dsh-profile-desktop', dependencies: { extra: '1.0.0' }, dsh: { profile: { bundles: PROFILE_TEMPLATES.web?.bundles } } })
    expect(restoreTemplateBundles('dsh', dir, 'audit-desktop')).toBe(true)
    expect(read(dir)).toEqual({
      name: 'dsh-profile-desktop',
      dependencies: { extra: '1.0.0' },
      dsh: { profile: { bundles: PROFILE_TEMPLATES['audit-desktop']?.bundles } },
    })
  })

  it('leaves a matching profile and a missing profile untouched', () => {
    const matching = profile({ name: 'dsh-profile-audit', dsh: { profile: { bundles: PROFILE_TEMPLATES.audit?.bundles } } })
    const before = readFileSync(join(matching, 'package.json'), 'utf8')
    expect(restoreTemplateBundles('dsh', matching, 'audit')).toBe(false)
    expect(readFileSync(join(matching, 'package.json'), 'utf8')).toBe(before)
    expect(restoreTemplateBundles('dsh', profile(), 'audit')).toBe(false)
  })

  it('rejects a template that is not shipped', () => {
    expect(() => restoreTemplateBundles('dsh', profile(), 'missing')).toThrow('release lock names unknown profile template "missing"')
  })
})
