/**
 * Reads an unpacked audit-plugins DeepSeek Harness release
 * (`audit-plugins-<version>-dsh.zip`) into the loader rows of its audit toolkit.
 * @module @deepseek-ai/dsh-audit-plugin-pack/pack
 */

import { readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseEntryYaml } from '@deepseek-ai/cordis-plugin-include'
import type { EntryOptions } from '@deepseek-ai/cordis-plugin-loader'

/** Directory name of the pack under the Harness home. */
export const PACK_DIR_NAME = 'audit-plugins'
/** Id of the preset the pack declares, which this package replaces with the host's own `audit` preset. */
export const PACK_PRESET_ID = 'audit'
/** Id of the group row, inside the pack's preset, that holds the pack's Host plugin, skill provider, and MCP clients. */
export const PACK_TOOLKIT_ID = 'audit-toolkit'
/** Plugin name of an agent preset row. */
const PRESET_PLUGIN = '@deepseek-ai/dsh-agent-preset'

/** A pack directory that holds the release. */
export interface LoadedPack {
  kind: 'loaded'
  /** The pack directory. */
  root: string
  /** The bundle package name from the pack's `package.json`. */
  name: string
  /** The bundle package version from the pack's `package.json`. */
  version: string
  /** The toolkit group row, with every row naming the pack package rewritten to the file URL of the pack's main export. */
  entries: EntryOptions[]
  /** File URL of the pack's main export, which the rewritten rows name. */
  mainUrl: string
  /** Absolute path of the audit workbench manifest that `dsh.auditWorkbench` names, when the pack declares one. */
  workbench: string | undefined
}

/** A pack directory that does not exist. */
export interface MissingPack {
  kind: 'missing'
  /** The pack directory that was looked up. */
  root: string
}

/** The result of reading a pack directory. */
export type PluginPack = LoadedPack | MissingPack

/** A pack directory that exists but does not hold a readable audit-plugins release. */
export class PluginPackError extends Error {
  override name = 'PluginPackError'

  /**
   * @param root - the pack directory.
   * @param detail - what is wrong with it.
   * @param options - the underlying failure, when there is one.
   */
  constructor(readonly root: string, detail: string, options?: ErrorOptions) {
    super(`audit plugin pack at ${root}: ${detail}`, options)
  }
}

/** The bundle manifest fields the pack must declare. */
interface PackManifest {
  name: string
  version: string
  patch: string
  main: string
  workbench: string | undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isEntry(value: unknown): value is EntryOptions {
  return isRecord(value) && typeof value['id'] === 'string' && typeof value['name'] === 'string'
}

/** Validate the `package.json` fields of a pack: name, version, `dsh.bundle.patch`, and the `.` export. */
function parseManifest(root: string, text: string): PackManifest {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (error) {
    throw new PluginPackError(root, 'package.json is not valid JSON', { cause: error })
  }
  const dsh = isRecord(data) ? data['dsh'] : undefined
  const bundle = isRecord(dsh) ? dsh['bundle'] : undefined
  const exports = isRecord(data) ? data['exports'] : undefined
  const fields = {
    name: isRecord(data) ? data['name'] : undefined,
    version: isRecord(data) ? data['version'] : undefined,
    patch: isRecord(bundle) ? bundle['patch'] : undefined,
    main: isRecord(exports) ? exports['.'] : undefined,
    workbench: isRecord(dsh) ? dsh['auditWorkbench'] : undefined,
  }
  const { name, version, patch, main, workbench } = fields
  if (typeof name !== 'string' || typeof version !== 'string' || typeof patch !== 'string' || typeof main !== 'string') {
    throw new PluginPackError(root, 'package.json must declare name, version, dsh.bundle.patch, and the "." export as strings')
  }
  if (workbench !== undefined && typeof workbench !== 'string') throw new PluginPackError(root, 'package.json dsh.auditWorkbench must be a path string')
  return { name, version, patch, main, workbench }
}

/** Find the toolkit group row inside the pack preset that a patch list inserts. */
function findToolkit(root: string, patches: unknown): EntryOptions {
  if (!Array.isArray(patches)) throw new PluginPackError(root, 'the bundle patch is not a list')
  for (const patch of patches) {
    const rows: unknown[] = isRecord(patch) && Array.isArray(patch['insert']) ? patch['insert'] : [patch]
    for (const row of rows) {
      if (!isEntry(row) || row.name !== PRESET_PLUGIN || !isRecord(row.config) || row.config['id'] !== PACK_PRESET_ID) continue
      const plugins: unknown = row.config['plugins']
      const list: unknown[] = Array.isArray(plugins) ? plugins : []
      const toolkit = list.find(plugin => isEntry(plugin) && plugin.id === PACK_TOOLKIT_ID)
      if (isEntry(toolkit)) return toolkit
      throw new PluginPackError(root, `the "${PACK_PRESET_ID}" preset has no "${PACK_TOOLKIT_ID}" row`)
    }
  }
  throw new PluginPackError(root, `the bundle patch declares no "${PACK_PRESET_ID}" agent preset`)
}

/** Point every row that names the pack package, at any group depth, at the pack's main export file. */
function rewritePackRows(row: EntryOptions, packageName: string, mainUrl: string): EntryOptions {
  const config: unknown = row.config
  const children: unknown[] | undefined = Array.isArray(config) ? config : undefined
  return {
    ...row,
    name: row.name === packageName ? mainUrl : row.name,
    ...(children ? { config: children.map(child => isEntry(child) ? rewritePackRows(child, packageName, mainUrl) : child) } : {}),
  }
}

/**
 * Read a pack directory.
 * @param root - absolute directory holding the unpacked release, with the bundle `package.json` at its top.
 * @returns the toolkit rows of the pack, or `missing` when the directory does not exist.
 * @throws {PluginPackError} when the directory exists but its manifest or bundle patch is unreadable or lacks the toolkit.
 */
export async function readPluginPack(root: string): Promise<PluginPack> {
  if (await stat(root).then(() => false, (error: unknown) => isRecord(error) && error['code'] === 'ENOENT')) return { kind: 'missing', root }
  return readPackDirectory(root)
}

/**
 * Read a pack directory that is expected to exist.
 * @param root - absolute directory holding the unpacked release, with the bundle `package.json` at its top.
 * @returns the toolkit rows of the pack.
 * @throws {PluginPackError} when the manifest or bundle patch is absent or unreadable, or the patch lacks the toolkit.
 */
export async function readPackDirectory(root: string): Promise<LoadedPack> {
  let manifestText: string
  try {
    manifestText = await readFile(join(root, 'package.json'), 'utf8')
  } catch (error) {
    throw new PluginPackError(root, 'no package.json; unpack the release so that its package.json sits directly in this directory', { cause: error })
  }
  const manifest = parseManifest(root, manifestText)
  const patchPath = resolve(root, manifest.patch)
  let patches: unknown
  try {
    patches = parseEntryYaml(await readFile(patchPath, 'utf8'))
  } catch (error) {
    throw new PluginPackError(root, `cannot read the bundle patch ${patchPath}`, { cause: error })
  }
  const toolkit = findToolkit(root, patches)
  const mainUrl = pathToFileURL(resolve(root, manifest.main)).href
  return {
    kind: 'loaded', root, name: manifest.name, version: manifest.version,
    entries: [rewritePackRows(toolkit, manifest.name, mainUrl)],
    mainUrl,
    workbench: manifest.workbench === undefined ? undefined : resolve(root, manifest.workbench),
  }
}
