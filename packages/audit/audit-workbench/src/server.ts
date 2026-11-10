/**
 * Launch-value row of one audit server: the workbench rewrites each pack MCP
 * client row to this plugin with the same launch configuration, so the
 * loader evaluates the pack's expressions and the workbench learns how to
 * start the server, without starting it.
 * @module @deepseek-ai/dsh-audit-workbench/server
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from './service.ts'

/** Cordis plugin name. */
export const name = 'audit-workbench-server'
/** The workbench service records the launch values. */
export const inject = ['auditWorkbench']

/** Stdio launch values of one pack MCP client row. */
export interface Config {
  serverName: string
  transport: 'stdio'
  command: string
  args: string[]
  cwd?: string
  env: Record<string, string>
}

/** Validated launch values. */
export const Config: z<Partial<Config>, Config> = z.object({
  serverName: z.string().pattern(/^[A-Za-z0-9_-]{1,32}$/).required(),
  transport: z.const('stdio').required(),
  command: z.string().min(1).required(),
  args: z.array(z.string()).default([]),
  cwd: z.string().min(1),
  env: z.dict(z.string()).default({}),
})

/**
 * Record the launch values for the row's lifetime.
 * @param ctx - the row context.
 * @param config - resolved launch values.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.effect(() => ctx.auditWorkbench.registerServer({
    serverName: config.serverName, command: config.command, args: config.args, cwd: config.cwd, env: config.env,
  }), `audit-workbench: ${config.serverName} launch values`)
}
