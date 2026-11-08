/**
 * Build-time audit release lock for the `dsh` launcher.
 *
 * A release build runs with `DSH_AUDIT_RELEASE_LOCK=1`, which the CLI tsdown
 * configuration inlines into {@link AUDIT_RELEASE_LOCKED}. Source launches,
 * tests, and unlocked builds read `false`. Under the lock the launcher boots
 * only the audit profile templates, rejects launcher overlays and plugin
 * management, and restores the template bundle list of the booted profile.
 * @module @deepseek-ai/dsh/release-lock
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { readProfileManifest, writeProfileBundles } from '@deepseek-ai/dsh-app-boot'
import { PROFILE_TEMPLATES } from '@deepseek-ai/dsh-official-bundles'

/** Replaced by the CLI tsdown `define` with `true` or `false`; undeclared in source launches. */
declare const __DSH_AUDIT_RELEASE_LOCK__: boolean | undefined

/** Whether this build is a locked audit release. */
export const AUDIT_RELEASE_LOCKED: boolean = typeof __DSH_AUDIT_RELEASE_LOCK__ === 'boolean' && __DSH_AUDIT_RELEASE_LOCK__

/**
 * Profiles a locked release boots, keyed by the requested name. The upstream
 * application names map to their audit templates so that SDK and ACP clients
 * launching `sdk` or `acp` reach the audit agent.
 */
export const AUDIT_RELEASE_PROFILES: Readonly<Record<string, string>> = Object.freeze({
  'audit': 'audit',
  'audit-sdk': 'audit-sdk',
  'audit-acp': 'audit-acp',
  'headless': 'audit',
  'sdk': 'audit-sdk',
  'acp': 'audit-acp',
})

/** The Desktop profile template of a locked release. */
export const AUDIT_RELEASE_DESKTOP_TEMPLATE = 'audit-desktop'

/**
 * Resolve the profile a locked release boots for a requested name.
 * @param requested - the profile name from the command line, matched exactly.
 * @returns the audit template name, or `undefined` when the release refuses the name.
 */
export function resolveReleaseProfile(requested: string): string | undefined {
  return Object.hasOwn(AUDIT_RELEASE_PROFILES, requested) ? AUDIT_RELEASE_PROFILES[requested] : undefined
}

/**
 * Rewrite an existing profile's bundle list to its shipped template when the two differ.
 * A missing profile is left for the loader to initialize from the template; other manifest fields are kept.
 * @param binName - diagnostic prefix for an invalid profile manifest.
 * @param dir - the profile directory.
 * @param template - the shipped template whose bundles the profile must list.
 * @returns whether the manifest was rewritten.
 * @throws when the template is not shipped or the manifest cannot be read or written.
 */
export function restoreTemplateBundles(binName: string, dir: string, template: string): boolean {
  const bundles = Object.hasOwn(PROFILE_TEMPLATES, template) ? PROFILE_TEMPLATES[template]?.bundles : undefined
  if (bundles === undefined) throw new Error(`${binName}: release lock names unknown profile template ${JSON.stringify(template)}`)
  if (!existsSync(join(dir, 'package.json'))) return false
  const manifest = readProfileManifest(binName, dir)
  const current = manifest.dsh?.profile?.bundles ?? []
  if (current.length === bundles.length && current.every((name, index) => name === bundles[index])) return false
  writeProfileBundles(dir, manifest, bundles)
  return true
}
