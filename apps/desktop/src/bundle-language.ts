/** Keeps the macOS bundle language, which names the application in the menu bar and the Dock, in the Desktop language the person chose. */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { DesktopLocale } from './locale.ts'

/** The `AppleLanguages` entry macOS matches against the bundle localizations for each Desktop language. */
const MAC_LANGUAGES: Readonly<Record<DesktopLocale['id'], string>> = {
  'en': 'en', 'zh-CN': 'zh-Hans', 'ja': 'ja', 'es': 'es', 'fr': 'fr', 'de': 'de', 'ru': 'ru', 'pt': 'pt',
}

/** The application's own `AppleLanguages` user default. */
export interface BundleLanguageDefaults {
  set(languages: string[]): void
  remove(): void
}

function pinned(markerPath: string): string | undefined {
  try {
    return readFileSync(markerPath, 'utf8')
  } catch (error) {
    // A missing marker means this application never pinned a language.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

/**
 * Pin the application's macOS language to a language the person chose in Desktop, or remove a pin this function
 * set once the person follows the system language again. macOS reads the value at the next launch. A pin that the
 * marker does not record, such as one set in System Settings, is left alone.
 * @param markerPath - file that records the language this function pinned.
 * @param chosen - the Desktop language the person chose, or undefined when Desktop follows the system language.
 * @param defaults - the application's `AppleLanguages` user default.
 */
export function syncBundleLanguage(markerPath: string, chosen: DesktopLocale['id'] | undefined, defaults: BundleLanguageDefaults): void {
  const current = pinned(markerPath)
  if (chosen === undefined) {
    if (current === undefined) return
    defaults.remove()
    rmSync(markerPath, { force: true })
    return
  }
  const language = MAC_LANGUAGES[chosen]
  if (current === language) return
  defaults.set([language])
  mkdirSync(dirname(markerPath), { recursive: true })
  writeFileSync(markerPath, language)
}
