/**
 * Bundle-layer composition of the shipped audit profile templates: workspace-only write
 * permissions, the audit agent, and the rows each template switches off.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { EntryOptions } from '@deepseek-ai/cordis-plugin-loader'
import { composeEntries, loadProfile } from '@deepseek-ai/dsh-app-boot'
import { afterAll, describe, expect, it } from 'vitest'

const installAnchor = fileURLToPath(new URL('../../../../package.json', import.meta.url))
const home = mkdtempSync(join(tmpdir(), 'dsh-audit-profiles-'))
afterAll(() => { rmSync(home, { recursive: true, force: true }) })

/** Compose a shipped template's bundle layers; a patch addressing an absent row fails the test. */
function compose(name: string): Map<string, EntryOptions> {
  const profile = loadProfile('dsh', name, installAnchor, home, { userLayer: false })
  expect(profile.skippedBundles).toEqual([])
  const rows = composeEntries(profile.layers.map(layer => layer.patches), (message) => { throw new Error(message) })
  return new Map(rows.map(row => [row.id, row]))
}

/** The row with this id; absent rows fail the test. */
function row(rows: Map<string, EntryOptions>, id: string): EntryOptions {
  const found = rows.get(id)
  expect(found, id).toBeDefined()
  return found!
}

/** Config fields a row carries after composition. */
function config(rows: Map<string, EntryOptions>, id: string): Record<string, unknown> {
  return row(rows, id).config as Record<string, unknown>
}

const AUDIT_PERMISSIONS = {
  presets: {
    'workspace-write': {
      sandbox: 'workspace-write',
      approval: 'never',
      name: 'workspace-write',
      description: 'Run commands, read files, and write only inside the workspace; wider access is refused.',
    },
    'danger-full-access': {
      sandbox: 'danger-full-access',
      approval: 'never',
      name: 'danger-full-access',
      description: 'Run commands and read and write files anywhere the account can, without confirmation.',
    },
  },
  defaultPreset: 'workspace-write',
}

const ORG_DISABLED = [
  'deepseek-account', 'llm-deepseek-account', 'session-telemetry-otel', 'session-log-deepseek', 'plugin-package-inventory-deepseek',
  'plugin-manager', 'tool-plugin-manager',
]

describe.each(['audit', 'audit-sdk', 'audit-acp', 'audit-desktop'])('the %s profile', (name) => {
  const rows = compose(name)

  it('confines writes to the workspace by default, offers full access, and refuses approvals', () => {
    expect(row(rows, 'sandbox-policy').config).toMatchObject({ mode: 'workspace-write' })
    expect(config(rows, 'sandbox-policy')).not.toHaveProperty('additionalWritableRoots')
    expect(config(rows, 'approval')).toEqual({ policy: 'never' })
    expect(config(rows, 'permission')).toEqual(AUDIT_PERMISSIONS)
  })

  it('switches off the DeepSeek account, telemetry and session-log uploads, and plugin installation', () => {
    for (const id of ORG_DISABLED) expect(row(rows, id).disabled, id).toBe(true)
    expect(row(rows, 'config-editor').disabled).not.toBe(true)
  })

  it('omits the DeepSeek Harness identity and uses the audit persona at the root', () => {
    expect(config(rows, 'system-prompt')).toMatchObject({ includeHarnessIdentity: false })
    expect(config(rows, 'system-prompt')['personaPrefix']).toMatch(/^You are 八局审计智能体 \(CSCEC8B Audit Agent\)/u)
  })
})

describe.each(['audit', 'audit-sdk', 'audit-acp'])('the command-line %s profile', (name) => {
  const rows = compose(name)

  it('offers reading and new-file tools without edit, and spawned subagents and workflows without forks or teams', () => {
    expect(config(rows, 'tool-fs')).toMatchObject({ read: true, readImage: true, write: true, edit: false, applyPatch: false })
    for (const id of ['tool-subagent-fork', 'tool-agent-team']) expect(row(rows, id).disabled, id).toBe(true)
    for (const id of ['tool-bash', 'tool-web', 'tool-skill', 'tool-subagent-control', 'tool-subagent', 'workflow-ptc', 'tool-workflow']) {
      expect(row(rows, id).disabled, id).not.toBe(true)
    }
    expect(config(rows, 'tool-subagent')).toMatchObject({ provider: 'spawn', toolName: 'subagent' })
  })

  it('mounts the audit plugin pack that Desktop reads, with room for its long skills', () => {
    expect(row(rows, 'audit-plugin-pack')).toMatchObject({
      name: '@deepseek-ai/dsh-audit-plugin-pack', config: { root: '~/.cscec8b-audit-agent/audit-plugins' },
    })
    expect(row(rows, 'audit-plugin-pack').disabled).toBeUndefined()
    expect(config(rows, 'tool-result-pruner')).toEqual({ thresholdChars: 40000, headChars: 20000, tailChars: 8000 })
  })

  it('replaces local skill discovery with the bundled audit skills', () => {
    expect(row(rows, 'skill-filesystem').disabled).toBe(true)
    expect(row(rows, 'audit-skills')).toMatchObject({ name: '@deepseek-ai/dsh-audit-skills' })
    expect(row(rows, 'audit-skills').disabled).toBeUndefined()
  })
})

describe('the audit-desktop profile', () => {
  const rows = compose('audit-desktop')
  const preset = config(rows, 'preset-audit') as { id: string; plugins: EntryOptions[] }
  const plugins = new Map(preset.plugins.map(plugin => [plugin.id, plugin]))

  it('registers the audit preset as the only preset and the default', () => {
    expect(preset.id).toBe('audit')
    expect(config(rows, 'agent-preset-registry')).toEqual({ default: 'audit' })
    const presets = [...rows.values()].filter(entry => entry.name === '@deepseek-ai/dsh-agent-preset' && entry.disabled !== true)
    expect(presets.map(entry => entry.id)).toEqual(['preset-audit'])
  })

  it('gives the audit preset the root persona and the same file tools', () => {
    expect((plugins.get('persona')!.config as { prefix: string }).prefix).toBe(config(rows, 'system-prompt')['personaPrefix'])
    expect(plugins.get('tool-fs')!.config).toEqual(config(compose('audit'), 'tool-fs'))
    expect([...plugins.keys()]).toContain('audit-skills')
    for (const id of ['skill-filesystem', 'planning', 'tool-schedule', 'tool-plugin-manager', 'tool-plugin-market']) {
      expect(plugins.has(id), id).toBe(false)
    }
  })

  it('mounts the audit plugin pack with spawned subagents, workflows, and room for its long skills', () => {
    expect(plugins.get('audit-plugin-pack')).toEqual({ id: 'audit-plugin-pack', name: '@deepseek-ai/dsh-audit-plugin-pack' })
    const delegation = (plugins.get('delegation')!.config as EntryOptions[]).map((entry): unknown[] => [entry.id, entry.config])
    expect(delegation).toEqual([
      ['tool-subagent-control', undefined],
      ['tool-subagent', { provider: 'spawn', toolName: 'subagent' }],
      ['workflow-ptc', { provider: 'spawn' }],
      ['tool-workflow', undefined],
    ])
    const pruner = (plugins.get('compaction')!.config as EntryOptions[]).find(entry => entry.id === 'tool-result-pruner')
    expect(pruner?.config).toEqual({ thresholdChars: 40000, headChars: 20000, tailChars: 8000 })
  })

  it('keeps session search and voice input on without the plugin manager', () => {
    for (const id of ['optional-session-search', 'speech-to-text', 'ui-voice-input']) expect(row(rows, id).disabled, id).toBeUndefined()
  })

  it('switches off authoring, account, development context, and analytics rows', () => {
    for (const id of [
      'ui-plugin-manager', 'ui-agent-preset', 'entry-customization', 'ui-cordis', 'cordis-host-runner', 'cordis-client-runner',
      'cordis-inspect-providers', 'harness-dev-context', 'ui-settings-account', 'account-controller', 'desktop-product-telemetry',
      'product-analytics',
    ]) expect(row(rows, id).disabled, id).toBe(true)
  })

  it('mounts Playwright MCP on the Desktop Sidebar browser only when Desktop names its endpoint', () => {
    const absent = { __jsExpr: 'process.env.DSH_DESKTOP_BROWSER_CDP_ENDPOINT === undefined' }
    expect(row(rows, 'browser-use')).toMatchObject({ name: '@deepseek-ai/dsh-browser-use', disabled: absent })
    expect(row(rows, 'browser-use-playwright-mcp')).toEqual({
      id: 'browser-use-playwright-mcp', name: '@deepseek-ai/dsh-experimental-browser-use-playwright-mcp', disabled: absent,
      config: { mode: 'attach', endpoint: { __jsExpr: 'process.env.DSH_DESKTOP_BROWSER_CDP_ENDPOINT' } },
    })
  })

  it('asks the user to confirm actions taken on the user\'s behalf', () => {
    expect(config(rows, 'system-prompt')['personaPrefix']).toContain('describe the action and ask the user to confirm it.')
  })

  it('replaces the official brand with the CSCEC8B seal', () => {
    expect(row(rows, 'ui-brand-official').disabled).toBe(true)
    expect(row(rows, 'ui-brand-cscec8b').name).toBe('@deepseek-ai/dsh-client-ui-brand-cscec8b')
    expect(row(rows, 'ui-brand-cscec8b').disabled).toBeUndefined()
  })

  it('mounts the audit workbench Host reads and its sidebar page', () => {
    expect(row(rows, 'audit-workbench')).toEqual({ id: 'audit-workbench', name: '@deepseek-ai/dsh-audit-workbench' })
    expect(row(rows, 'ui-audit-workbench')).toEqual({ id: 'ui-audit-workbench', name: '@deepseek-ai/dsh-client-ui-audit-workbench' })
  })

  it('mounts the Session system notifications', () => {
    expect(row(rows, 'ui-session-attention')).toEqual({ id: 'ui-session-attention', name: '@deepseek-ai/dsh-client-ui-session-attention' })
  })
})

describe('the audit agent persona', () => {
  it('is the same text in the command-line and Desktop profiles', () => {
    expect(config(compose('audit'), 'system-prompt')['personaPrefix']).toBe(config(compose('audit-desktop'), 'system-prompt')['personaPrefix'])
  })
})
