/**
 * Installs an audit-plugins DeepSeek Harness release zip (`audit-plugins-<version>-dsh.zip`)
 * in two steps: staging unpacks and checks the zip beside the pack directory while the
 * current pack stays in use, and applying swaps the staged pack in before the Host starts,
 * keeping the replaced pack as the previous version.
 * @module @deepseek-ai/dsh-audit-plugin-pack/install
 */

import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, posix } from 'node:path'
import { unzipSync } from 'fflate'
import { readPackDirectory, readPluginPack } from './pack.ts'

export { PACK_DIR_NAME, PluginPackError } from './pack.ts'

/** Suffix of the staged pack directory beside the pack directory. */
export const PENDING_SUFFIX = '.pending'
/** Suffix of the replaced pack directory beside the pack directory. */
export const PREVIOUS_SUFFIX = '.previous'

/** The bundle package of a staged or applied pack. */
export interface PackVersion {
  /** The bundle package name from the pack's `package.json`. */
  name: string
  /** The bundle package version from the pack's `package.json`. */
  version: string
}

/** A zip that does not hold an audit-plugins DeepSeek Harness release. */
export class PluginPackZipError extends Error {
  override name = 'PluginPackZipError'

  /**
   * @param file - the zip file.
   * @param detail - what is wrong with it.
   * @param options - the underlying failure, when there is one.
   */
  constructor(readonly file: string, detail: string, options?: ErrorOptions) {
    super(`audit plugin pack zip ${file}: ${detail}`, options)
  }
}

/**
 * The release files keyed by their path inside the pack directory: the zip's single top
 * directory is dropped when `package.json` sits in it instead of at the zip root.
 */
function packFiles(file: string, entries: Record<string, Uint8Array>): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>()
  for (const [name, data] of Object.entries(entries)) {
    if (name.endsWith('/')) continue
    const path = posix.normalize(name.replaceAll('\\', '/'))
    if (posix.isAbsolute(path) || /^[A-Za-z]:/u.test(path) || path === '..' || path.startsWith('../')) {
      throw new PluginPackZipError(file, `entry ${JSON.stringify(name)} points outside the pack directory`)
    }
    files.set(path, data)
  }
  if (files.has('package.json')) return files
  const tops = new Set([...files.keys()].map(path => path.split('/')[0]))
  const [top] = tops
  if (tops.size !== 1 || top === undefined || !files.has(`${top}/package.json`)) {
    throw new PluginPackZipError(file, 'package.json is neither at the zip root nor in its single top directory')
  }
  return new Map([...files].map(([path, data]) => [path.slice(top.length + 1), data]))
}

/**
 * Unpack a release zip into the staged directory beside the pack directory and check it as the loader reads it.
 * A staged pack left by an earlier call is replaced.
 * @param file - the release zip.
 * @param root - absolute pack directory the release will replace.
 * @returns the staged bundle package.
 * @throws {PluginPackZipError} when the zip cannot be read or does not hold a release; nothing stays staged.
 * @throws {PluginPackError} when the unpacked release fails the loader's checks; nothing stays staged.
 */
export async function stagePluginPack(file: string, root: string): Promise<PackVersion> {
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(await readFile(file))
  } catch (error) {
    throw new PluginPackZipError(file, 'cannot read the zip', { cause: error })
  }
  const files = packFiles(file, entries)
  const pending = root + PENDING_SUFFIX
  await rm(pending, { recursive: true, force: true })
  try {
    for (const [path, data] of files) {
      const target = join(pending, ...path.split('/'))
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, data)
    }
    const pack = await readPackDirectory(pending)
    return { name: pack.name, version: pack.version }
  } catch (error) {
    await rm(pending, { recursive: true, force: true })
    throw error
  }
}

/**
 * Move a staged pack into the pack directory, keeping the replaced pack beside it as the previous version.
 * Run it while no Host process uses the pack.
 * @param root - absolute pack directory.
 * @returns the applied bundle package, or undefined when nothing is staged.
 * @throws when a rename fails; a pack directory moved aside before the failure is moved back.
 */
export async function applyPendingPluginPack(root: string): Promise<PackVersion | undefined> {
  const pending = root + PENDING_SUFFIX
  const pack = await readPluginPack(pending)
  if (pack.kind === 'missing') return undefined
  const previous = root + PREVIOUS_SUFFIX
  // A pack directory that cannot be inspected is left to the rename below, which reports it.
  const replacing = await stat(root).then(() => true, () => false)
  if (replacing) {
    await rm(previous, { recursive: true, force: true })
    await rename(root, previous)
  }
  try {
    await rename(pending, root)
  } catch (error) {
    if (replacing) await rename(previous, root)
    throw error
  }
  return { name: pack.name, version: pack.version }
}
