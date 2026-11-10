/**
 * Host half of the audit workbench. The row provides `ctx.auditWorkbench`,
 * whose Remote methods read the audit plugin pack, its workbench manifest, and
 * the Project Archive of every Workspace, and check System Login Status. The
 * row also mounts the pack's Host plugin beside one launch-value row per pack
 * MCP client, so the pack's own expressions resolve each audit server's
 * launch values without starting the server or registering its tools.
 * @module @deepseek-ai/dsh-audit-workbench
 */

import { type Context, Service } from '@deepseek-ai/cordis'
import { EntryGroup, type EntryOptions } from '@deepseek-ai/cordis-plugin-loader'
import { readPluginPack, resolve as resolvePack, type LoadedPack } from '@deepseek-ai/dsh-audit-plugin-pack'
import z from '@deepseek-ai/schemastery'
import { AuditWorkbenchService, type ServiceSpec } from './service.ts'

export { AuditWorkbenchService, type ServiceSpec } from './service.ts'
export type * from './types.ts'

/** Workbench row configuration. */
export interface Config {
  /** Pack directory; absolute or `~`-prefixed. Defaults to `audit-plugins` under the Harness home, as for the pack row. */
  root?: string
  /** Deadline in milliseconds for one session check, server start included. */
  checkTimeoutMs: number
  /** Deadline in milliseconds for one login tool call, which waits for the person to log in. */
  loginTimeoutMs: number
}

/** Validated workbench row configuration. */
export const Config: z<Partial<Config>, Config> = z.object({
  root: z.string().min(1),
  checkTimeoutMs: z.natural().min(1).max(2_147_483_647).default(120_000),
  loginTimeoutMs: z.natural().min(1).max(2_147_483_647).default(600_000),
})

/**
 * Resolve the row configuration.
 * @param config - the validated row configuration.
 * @param env - environment that supplies `DSH_HOME`.
 * @returns the pack directory and deadlines.
 * @throws when the configured root is relative.
 */
export function resolve(config: Config, env: Record<string, string | undefined> = process.env): ServiceSpec {
  const pack = resolvePack(config.root === undefined ? {} : { root: config.root }, env)
  return { root: pack.root, checkTimeoutMs: config.checkTimeoutMs, loginTimeoutMs: config.loginTimeoutMs }
}

/** Row id prefix that keeps the mounted pack rows apart from the preset's copies. */
export const ROW_PREFIX = 'audit-workbench-'
/** Row name of the launch-value plugin. */
export const SERVER_ROW = '@deepseek-ai/dsh-audit-workbench/server'
const MCP_CLIENT = '@deepseek-ai/dsh-mcp-client'
const LAUNCH_KEYS = ['serverName', 'transport', 'command', 'args', 'cwd', 'env'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isEntry(value: unknown): value is EntryOptions {
  return isRecord(value) && typeof value['id'] === 'string' && typeof value['name'] === 'string'
}

function launchRow(row: EntryOptions): EntryOptions | undefined {
  const config: unknown = row.config
  if (!isRecord(config) || config['transport'] !== 'stdio') return undefined
  const picked: Record<string, unknown> = {}
  for (const key of LAUNCH_KEYS) if (key in config) picked[key] = config[key]
  return { ...row, id: ROW_PREFIX + row.id, name: SERVER_ROW, config: picked }
}

/**
 * Turn the pack's toolkit group into the workbench's: the pack Host plugin and
 * one launch-value row per stdio MCP client row, under prefixed ids.
 * @param pack - a loaded pack.
 * @returns the rows to mount, empty when the toolkit holds no group.
 */
export function workbenchRows(pack: LoadedPack): EntryOptions[] {
  const toolkit = pack.entries[0]
  const children: unknown = toolkit?.config
  if (toolkit === undefined || !Array.isArray(children)) return []
  const rows: EntryOptions[] = []
  for (const row of children) {
    if (!isEntry(row)) continue
    if (row.name === pack.mainUrl) rows.push({ ...row, id: ROW_PREFIX + row.id })
    else if (row.name === MCP_CLIENT) {
      const launch = launchRow(row)
      if (launch !== undefined) rows.push(launch)
    }
  }
  return [{ ...toolkit, id: ROW_PREFIX + toolkit.id, config: rows }]
}

function entryTree(ctx: Context): EntryGroup['tree'] {
  const entry = ctx.fiber.entry
  if (entry === undefined) throw new Error('audit-workbench: mount this plugin as a loader row')
  return entry.parent.tree
}

/** Loader group that provides the workbench service and mounts the pack's launch-value rows. */
export default class AuditWorkbench extends EntryGroup {
  /** Keep the pack rows' expressions literal until their own rows activate. */
  static readonly [EntryGroup.key] = true
  static Config: z<Partial<Config>, Config> = Config

  private readonly spec: ServiceSpec

  /**
   * @param ctx - the row context.
   * @param config - pack location and deadlines.
   */
  constructor(ctx: Context, config: Config) {
    super(ctx, entryTree(ctx))
    this.spec = resolve(config)
  }

  async* [Service.init]() {
    yield () => { this.stop() }
    await this.ctx.plugin(AuditWorkbenchService, this.spec)
    let pack: Awaited<ReturnType<typeof readPluginPack>>
    try {
      pack = await readPluginPack(this.spec.root)
    } catch (error) {
      this.ctx.logger.warn(`audit-workbench: ${(error as Error).message}; System Login Status is unavailable`)
      return
    }
    if (pack.kind === 'missing') return
    await this.update(workbenchRows(pack))
  }
}
