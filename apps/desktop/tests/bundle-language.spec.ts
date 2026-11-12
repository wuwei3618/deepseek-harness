/** The macOS application language follows an explicit Desktop language choice. */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { syncBundleLanguage } from '../src/bundle-language.ts'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

async function marker(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-bundle-language-'))
  roots.push(root)
  return join(root, 'desktop', 'bundle-language')
}

function recorder() {
  const calls: string[] = []
  return { calls, defaults: { set: (languages: string[]) => { calls.push(`set ${languages.join(',')}`) }, remove: () => { calls.push('remove') } } }
}

describe('macOS bundle language', () => {
  it('pins a chosen language once and records it', async () => {
    const path = await marker()
    const { calls, defaults } = recorder()
    syncBundleLanguage(path, 'zh-CN', defaults)
    syncBundleLanguage(path, 'zh-CN', defaults)
    expect(calls).toEqual(['set zh-Hans'])
    expect(await readFile(path, 'utf8')).toBe('zh-Hans')
    syncBundleLanguage(path, 'en', defaults)
    expect(calls).toEqual(['set zh-Hans', 'set en'])
  })

  it('removes only a pin it set when Desktop follows the system language again', async () => {
    const path = await marker()
    const { calls, defaults } = recorder()
    syncBundleLanguage(path, undefined, defaults)
    expect(calls).toEqual([])
    syncBundleLanguage(path, 'ja', defaults)
    syncBundleLanguage(path, undefined, defaults)
    expect(calls).toEqual(['set ja', 'remove'])
    await expect(readFile(path, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('reports a marker it cannot read', async () => {
    const path = await marker()
    await writeFile(join(path, '..', '..', 'desktop'), 'not a directory')
    expect(() => { syncBundleLanguage(path, 'en', recorder().defaults) }).toThrow(/ENOTDIR/)
  })
})
