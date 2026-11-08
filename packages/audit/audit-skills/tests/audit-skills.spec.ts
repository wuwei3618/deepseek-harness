/** Bundled audit skill catalog: discovery, loading, disposal, and load-time rejection of malformed folders. */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { afterEach, describe, expect, it } from 'vitest'
import * as AuditSkills from '../src/index.ts'

const assets = fileURLToPath(new URL('../assets/', import.meta.url))
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

/** Create a temporary asset root holding the given `<name>/SKILL.md` files and plain files. */
async function assetRoot(skills: Record<string, string>, files: Record<string, string> = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-audit-skills-'))
  roots.push(root)
  for (const [name, text] of Object.entries(skills)) {
    await mkdir(join(root, name))
    await writeFile(join(root, name, 'SKILL.md'), text)
  }
  for (const [name, text] of Object.entries(files)) await writeFile(join(root, name), text)
  return root
}

/** Mount the registry and the plugin, run the body, then dispose the tree. */
async function withPlugin(config: AuditSkills.Config, body: (ctx: Context) => Promise<void>): Promise<void> {
  const ctx = new Context()
  try {
    await ctx.plugin(SkillRegistry)
    await ctx.plugin(AuditSkills, config)
    await body(ctx)
  } finally { await ctx.fiber.dispose() }
}

describe('bundled audit skills', () => {
  it('lists every packaged skill as a bundled skill and loads its body without frontmatter', async () => {
    const ctx = new Context()
    try {
      await ctx.plugin(SkillRegistry)
      const fiber = await ctx.plugin(AuditSkills)
      const catalog = await ctx.skills.list()
      expect(catalog.map(skill => skill.name)).toEqual(['audit-review'])
      for (const skill of catalog) {
        expect(skill).toMatchObject({ source: 'bundled', provider: 'dsh-audit', invocation: { modelInvocable: true, userInvocable: true } })
        const loaded = await ctx.skills.get(skill.name)
        expect(loaded?.resourceBase).toEqual({ kind: 'directory', path: join(assets, skill.name).split(sep).join('/') })
        const raw = await readFile(join(assets, skill.name, 'SKILL.md'), 'utf8')
        expect(loaded?.content).toBe(raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, '').trim())
      }
      await fiber.dispose()
      expect(await ctx.skills.list()).toEqual([])
    } finally { await ctx.fiber.dispose() }
  })

  it('reads an external asset root in name order and ignores folders without SKILL.md and plain files', async () => {
    const root = await assetRoot({
      'b-skill': '---\ndescription: Second.\n---\nBody B\n',
      'a-skill': '---\ndescription: First.\n---\n',
    }, { 'README.md': 'not a skill' })
    await mkdir(join(root, 'empty'))
    await withPlugin({ assetRoot: root }, async (ctx) => {
      expect((await ctx.skills.list()).map(skill => [skill.name, skill.description])).toEqual([['a-skill', 'First.'], ['b-skill', 'Second.']])
      expect((await ctx.skills.get('a-skill'))?.content).toBe('')
      expect((await ctx.skills.get('b-skill'))?.content).toBe('Body B')
    })
  })

  it.each([
    ['a relative asset root', () => Promise.resolve('relative/assets'), 'assetRoot must be an absolute directory'],
    ['an invalid skill folder name', () => assetRoot({ Bad_Name: '---\ndescription: x\n---\n' }), 'is not a valid skill name'],
    ['a SKILL.md without frontmatter', () => assetRoot({ plain: 'No frontmatter' }), 'has no YAML frontmatter'],
    ['a SKILL.md without a description', () => assetRoot({ blank: '---\nname: blank\n---\n' }), 'has no description'],
    ['a SKILL.md with a non-object frontmatter', () => assetRoot({ scalar: '---\njust text\n---\n' }), 'has no description'],
  ])('fails the load for %s', async (_case, root, message) => {
    const ctx = new Context()
    try {
      await ctx.plugin(SkillRegistry)
      await expect(ctx.plugin(AuditSkills, { assetRoot: await root() })).rejects.toThrow(message)
    } finally { await ctx.fiber.dispose() }
  })
})
