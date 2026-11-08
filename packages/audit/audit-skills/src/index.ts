/**
 * Bundled audit skills: every `<name>/SKILL.md` directory under this package's
 * `assets/` folder, registered as one skill provider for the audit profiles.
 * @module @deepseek-ai/dsh-audit-skills
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { BUNDLED_SKILL_RANK, isSkillName, type SkillCandidate, type SkillProvider } from '@deepseek-ai/dsh-skill'
import { parse as parseYaml } from 'yaml'

/** Audit skill resource location. */
export interface Config {
  /** Absolute directory whose `<name>/SKILL.md` folders are the catalog; defaults to the packaged `assets/`. */
  assetRoot?: string
}

/** Validated resource configuration. */
export const Config: z<Config> = z.object({
  assetRoot: z.string().min(1),
})

/** Cordis plugin identity. */
export const name = 'audit-skills'
/** Registry used by the bundled provider. */
export const inject = ['skills']

/** Provider name reported in each skill summary. */
const PROVIDER = 'dsh-audit'

/** Split one SKILL.md into its frontmatter description and Markdown body; malformed files throw with their path. */
function parseSkill(raw: string, path: string): { description: string; content: string } {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw)
  if (frontmatter?.[1] === undefined) throw new Error(`audit-skills: ${path} has no YAML frontmatter`)
  const metadata: unknown = parseYaml(frontmatter[1])
  const description = typeof metadata === 'object' && metadata !== null && 'description' in metadata
    ? metadata.description : undefined
  if (typeof description !== 'string' || description.length === 0) throw new Error(`audit-skills: ${path} has no description`)
  return { description, content: raw.slice(frontmatter[0].length).trim() }
}

/**
 * Read the catalog once at load: each subdirectory holding a `SKILL.md` becomes a
 * skill named after the directory. A directory name that is not a valid skill
 * name, or a SKILL.md without a description, fails the load.
 */
function readCatalog(assetRoot: string): SkillCandidate[] {
  return readdirSync(assetRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && statSync(join(assetRoot, entry.name, 'SKILL.md'), { throwIfNoEntry: false })?.isFile() === true)
    .map(entry => entry.name)
    .sort()
    .map((skillName) => {
      const directory = join(assetRoot, skillName)
      const path = join(directory, 'SKILL.md')
      if (!isSkillName(skillName)) throw new Error(`audit-skills: ${directory} is not a valid skill name`)
      const { description } = parseSkill(readFileSync(path, 'utf8'), path)
      return {
        name: skillName, description,
        invocation: { modelInvocable: true, userInvocable: true },
        provider: PROVIDER, source: 'bundled', rank: BUNDLED_SKILL_RANK,
        resourceBase: { kind: 'directory', path: directory.split(sep).join('/') }, locator: path,
      }
    })
}

/**
 * Register the audit skill catalog.
 * @param ctx - Context carrying the skill registry.
 * @param config - Optional external assets directory for packaged applications.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const assetRoot = config.assetRoot ?? fileURLToPath(new URL('../assets/', import.meta.url))
  if (!isAbsolute(assetRoot)) throw new Error('audit-skills: assetRoot must be an absolute directory')
  const candidates = readCatalog(assetRoot)
  const provider: SkillProvider = {
    name: PROVIDER,
    list: () => Promise.resolve(candidates),
    async get(candidate, options) {
      const { rank: _rank, locator, ...summary } = candidate
      const raw = await readFile(locator as string, { encoding: 'utf8', signal: options.signal })
      return { ...summary, content: parseSkill(raw, locator as string).content }
    },
  }
  ctx.skills.registerProvider(() => provider)
}
