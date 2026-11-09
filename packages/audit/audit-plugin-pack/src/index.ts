/**
 * Mounts the audit toolkit of an audit-plugins release, unpacked at a fixed
 * directory, inside the agent preset that lists this row: the pack's Host
 * plugin, skill provider, and MCP clients. A missing directory mounts nothing.
 * @module @deepseek-ai/dsh-audit-plugin-pack
 */

import { isAbsolute, join } from 'node:path'
import { type Context, Service } from '@deepseek-ai/cordis'
import { EntryGroup } from '@deepseek-ai/cordis-plugin-loader'
import { expandHomePath, resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import z from '@deepseek-ai/schemastery'
import { PACK_DIR_NAME, readPluginPack } from './pack.ts'

export { PACK_DIR_NAME, PACK_PRESET_ID, PACK_TOOLKIT_ID, PluginPackError, readPackDirectory, readPluginPack, type LoadedPack, type MissingPack, type PluginPack } from './pack.ts'

/** Pack location. */
export interface Config {
  /** Directory holding the unpacked release; absolute or `~`-prefixed. Defaults to `audit-plugins` under the Harness home. */
  root?: string
}

/** Validated pack location. */
export const Config: z<Config> = z.object({
  root: z.string().min(1),
})

/** The resolved pack location. */
export interface Spec {
  /** Absolute pack directory. */
  root: string
}

/**
 * Resolve the pack location.
 * @param config - the row configuration.
 * @param env - environment that supplies `DSH_HOME`.
 * @returns the absolute pack directory.
 * @throws when the configured root is relative.
 */
export function resolve(config: Config, env: Record<string, string | undefined> = process.env): Spec {
  const root = config.root === undefined ? join(resolveDshHome(undefined, env), PACK_DIR_NAME) : expandHomePath(config.root)
  if (!isAbsolute(root)) throw new Error(`audit-plugin-pack: root must be absolute or start with ~, got ${JSON.stringify(config.root)}`)
  return { root }
}

/**
 * The entry tree of the row a context belongs to.
 * @param ctx - a plugin context.
 * @returns the tree that holds the row.
 * @throws when the plugin is mounted outside a loader entry.
 */
function entryTree(ctx: Context): EntryGroup['tree'] {
  const entry = ctx.fiber.entry
  if (entry === undefined) throw new Error('audit-plugin-pack: mount this plugin as a loader row')
  return entry.parent.tree
}

/** Loader group whose only child is the toolkit row of the pack. */
export default class AuditPluginPack extends EntryGroup {
  /** Keep the pack rows' expressions literal until their own rows activate. */
  static readonly [EntryGroup.key] = true
  static Config: z<Config> = Config

  private readonly spec: Spec

  /**
   * @param ctx - the row context.
   * @param config - the pack location.
   */
  constructor(ctx: Context, config: Config) {
    super(ctx, entryTree(ctx))
    this.spec = resolve(config)
  }

  async* [Service.init]() {
    yield () => { this.stop() }
    const pack = await readPluginPack(this.spec.root)
    if (pack.kind === 'missing') {
      this.ctx.logger.warn(`audit-plugin-pack: no plugin pack at ${pack.root}; unpack audit-plugins-<version>-dsh.zip there to add the audit MCP servers and skills`)
      return
    }
    this.ctx.logger.info(`audit-plugin-pack: mounting ${pack.name}@${pack.version} from ${pack.root}`)
    await this.update(pack.entries)
  }
}
