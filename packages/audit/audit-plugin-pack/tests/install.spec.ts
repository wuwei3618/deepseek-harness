/** Audit plugin pack installation: staging a release zip beside the pack directory and swapping it in. */
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strToU8, zipSync, type Zippable } from 'fflate'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyPendingPluginPack, PACK_DIR_NAME, PENDING_SUFFIX, PluginPackError, PluginPackZipError, PREVIOUS_SUFFIX, stagePluginPack } from '../src/install.ts'

const roots: string[] = []

afterEach(async () => {
  vi.doUnmock('node:fs/promises')
  vi.resetModules()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function tempDir(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-audit-plugin-pack-install-'))
  roots.push(root)
  return root
}

const PATCH = `
- insert:
    - id: "audit-preset"
      name: "@deepseek-ai/dsh-agent-preset"
      config:
        id: "audit"
        plugins:
          - id: "audit-toolkit"
            name: "cordis:group"
            config: []
`

/** The files of a release with the given version. */
function release(version: string): Zippable {
  return {
    'package.json': strToU8(JSON.stringify({ name: 'audit-dsh', version, dsh: { bundle: { patch: './dsh/cordis.patch.yml' } }, exports: { '.': './dsh/index.js' } })),
    dsh: { 'cordis.patch.yml': strToU8(PATCH), 'index.js': strToU8('export const name = "audit-dsh"\n') },
  }
}

/** Write a zip of the given files and return its path. */
async function zip(files: Zippable): Promise<string> {
  const file = join(await tempDir(), 'audit-plugins-dsh.zip')
  await writeFile(file, zipSync(files))
  return file
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(() => true, () => false)
}

async function packVersion(root: string): Promise<unknown> {
  const manifest: unknown = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  return (manifest as { version: unknown }).version
}

describe('stagePluginPack', () => {
  it('unpacks the single top directory of a release beside the pack directory and leaves the pack in use', async () => {
    const root = join(await tempDir(), PACK_DIR_NAME)
    const file = await zip({ 'audit-plugins-2.66.0-dsh': release('2.66.0') })
    expect(await stagePluginPack(file, root)).toEqual({ name: 'audit-dsh', version: '2.66.0' })
    expect(await packVersion(root + PENDING_SUFFIX)).toBe('2.66.0')
    expect(await readFile(join(root + PENDING_SUFFIX, 'dsh', 'index.js'), 'utf8')).toContain('audit-dsh')
    expect(await exists(root)).toBe(false)
  })

  it('accepts package.json at the zip root and replaces an earlier staged pack', async () => {
    const root = join(await tempDir(), PACK_DIR_NAME)
    await mkdir(root + PENDING_SUFFIX)
    await writeFile(join(root + PENDING_SUFFIX, 'stale.txt'), '')
    await stagePluginPack(await zip({ ...release('2.66.1'), 'empty/': {} }), root)
    expect(await packVersion(root + PENDING_SUFFIX)).toBe('2.66.1')
    expect(await exists(join(root + PENDING_SUFFIX, 'stale.txt'))).toBe(false)
  })

  it.each([
    ['an absolute entry', { '/etc/x': strToU8('') }],
    ['a drive-letter entry', { 'C:/x': strToU8('') }],
    ['a parent entry', { '../x': strToU8('') }],
    ['an entry that normalizes to the parent', { 'a/../..': strToU8('') }],
  ])('rejects %s before writing anything', async (_label, files) => {
    const root = join(await tempDir(), PACK_DIR_NAME)
    const error = await stagePluginPack(await zip({ ...release('1'), ...files }), root).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(PluginPackZipError)
    expect((error as Error).message).toMatch(/points outside the pack directory/)
    expect(await exists(root + PENDING_SUFFIX)).toBe(false)
  })

  it.each([
    ['two top directories', { a: release('1'), b: release('1') }],
    ['a top directory without package.json', { a: { 'x.txt': strToU8('') } }],
    ['no files', {}],
  ])('rejects a zip with %s', async (_label, files) => {
    const root = join(await tempDir(), PACK_DIR_NAME)
    await expect(stagePluginPack(await zip(files), root)).rejects.toThrow(/neither at the zip root nor in its single top directory/)
  })

  it('rejects a file that is not a zip', async () => {
    const file = join(await tempDir(), 'pack.zip')
    await writeFile(file, 'not a zip')
    const error = await stagePluginPack(file, join(await tempDir(), PACK_DIR_NAME)).catch((caught: unknown) => caught)
    expect(error).toMatchObject({ name: 'PluginPackZipError', file })
    expect((error as Error).message).toMatch(/cannot read the zip/)
  })

  it('removes a staged pack that fails the loader checks', async () => {
    const root = join(await tempDir(), PACK_DIR_NAME)
    const files = release('1')
    const error = await stagePluginPack(await zip({ ...files, dsh: { 'cordis.patch.yml': strToU8('- id: x\n  name: y\n') } }), root)
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(PluginPackError)
    expect(await exists(root + PENDING_SUFFIX)).toBe(false)
  })
})

describe('applyPendingPluginPack', () => {
  it('does nothing without a staged pack', async () => {
    const root = join(await tempDir(), PACK_DIR_NAME)
    expect(await applyPendingPluginPack(root)).toBeUndefined()
  })

  it('installs a staged pack where none was installed', async () => {
    const root = join(await tempDir(), PACK_DIR_NAME)
    await stagePluginPack(await zip(release('2.66.0')), root)
    expect(await applyPendingPluginPack(root)).toEqual({ name: 'audit-dsh', version: '2.66.0' })
    expect(await packVersion(root)).toBe('2.66.0')
    expect(await exists(root + PENDING_SUFFIX)).toBe(false)
    expect(await exists(root + PREVIOUS_SUFFIX)).toBe(false)
  })

  it('keeps the replaced pack as the previous version, replacing an older previous version', async () => {
    const root = join(await tempDir(), PACK_DIR_NAME)
    await stagePluginPack(await zip(release('1')), root)
    await applyPendingPluginPack(root)
    await stagePluginPack(await zip(release('2')), root)
    await applyPendingPluginPack(root)
    await stagePluginPack(await zip(release('3')), root)
    await applyPendingPluginPack(root)
    expect(await packVersion(root)).toBe('3')
    expect(await packVersion(root + PREVIOUS_SUFFIX)).toBe('2')
  })

  /** Load the module with a rename that fails for the staged pack. */
  async function withBusyPending(): Promise<typeof import('../src/install.ts')> {
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    vi.doMock('node:fs/promises', () => ({
      ...actual,
      rename: (from: string, to: string) => from.endsWith(PENDING_SUFFIX) ? Promise.reject(new Error('busy')) : actual.rename(from, to),
    }))
    vi.resetModules()
    return import('../src/install.ts')
  }

  it('moves the installed pack back when the staged pack cannot be moved in', async () => {
    const root = join(await tempDir(), PACK_DIR_NAME)
    await stagePluginPack(await zip(release('1')), root)
    await applyPendingPluginPack(root)
    await stagePluginPack(await zip(release('2')), root)
    const isolated = await withBusyPending()
    await expect(isolated.applyPendingPluginPack(root)).rejects.toThrow('busy')
    expect(await packVersion(root)).toBe('1')
    expect(await packVersion(root + PENDING_SUFFIX)).toBe('2')
  })

  it('keeps the staged pack when it cannot be moved in where none was installed', async () => {
    const root = join(await tempDir(), PACK_DIR_NAME)
    await stagePluginPack(await zip(release('1')), root)
    const isolated = await withBusyPending()
    await expect(isolated.applyPendingPluginPack(root)).rejects.toThrow('busy')
    expect(await exists(root)).toBe(false)
    expect(await exists(root + PREVIOUS_SUFFIX)).toBe(false)
  })
})
