/**
 * One-shot MCP tool call against an audit server outside any Session: start
 * the server with its stdio launch values, call one tool, and close the
 * server. Nothing registers on `ctx.tools`.
 * @module @deepseek-ai/dsh-audit-workbench/call
 */

import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { scrubbedParentEnv } from '@deepseek-ai/dsh-subprocess'

/** Launch values of one stdio audit server, as the pack's MCP client row resolves them. */
export interface ServerLaunch {
  /** `serverName` of the pack row. */
  readonly serverName: string
  readonly command: string
  readonly args: readonly string[]
  readonly cwd: string | undefined
  readonly env: Readonly<Record<string, string>>
}

/** The outcome of one tool call. */
export type ToolCallOutcome =
  /** The tool returned; `value` is its structured result, or its first text block parsed as JSON. */
  | { readonly kind: 'result'; readonly isError: boolean; readonly value: unknown; readonly text: string }
  /** The server did not start or the call did not return within the deadline. */
  | { readonly kind: 'timeout' }
  /** The server failed to start, closed, or rejected the call. */
  | { readonly kind: 'failed'; readonly message: string }

/** Starts a server and calls one tool; replaced in tests. */
export type ToolCaller = (
  launch: ServerLaunch, tool: string, args: Readonly<Record<string, unknown>>, timeoutMs: number, signal: AbortSignal,
) => Promise<ToolCallOutcome>

function firstText(content: readonly unknown[]): string {
  for (const block of content) {
    if (typeof block === 'object' && block !== null && 'type' in block && block.type === 'text' && 'text' in block && typeof block.text === 'string') return block.text
  }
  return ''
}

function parsedText(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch (_error) {
    // A tool that answers in prose has no structured value; the rule then reads nothing.
    return undefined
  }
}

/**
 * Start `launch`, call `tool` once, and close the server.
 * @param launch - the server's launch values.
 * @param tool - tool name.
 * @param args - tool arguments.
 * @param timeoutMs - deadline for start and call together.
 * @param signal - caller cancellation; aborting closes the server.
 * @returns the tool result, a timeout, or the failure text.
 */
export const callTool: ToolCaller = async (launch, tool, args, timeoutMs, signal) => {
  const deadline = AbortSignal.timeout(timeoutMs)
  const combined = AbortSignal.any([signal, deadline])
  const client = new Client({ name: 'dsh-audit-workbench', version: '1' }, { capabilities: {} })
  const transport = new StdioClientTransport({
    command: launch.command,
    args: [...launch.args],
    env: { ...scrubbedParentEnv(), ...launch.env },
    ...launch.cwd === undefined ? {} : { cwd: launch.cwd },
    stderr: 'ignore',
  })
  try {
    await client.connect(transport, { signal: combined, timeout: timeoutMs })
    const result = await client.callTool({ name: tool, arguments: { ...args } }, { signal: combined, timeout: timeoutMs })
    const text = firstText(result.content)
    const value: unknown = result.structuredContent ?? parsedText(text)
    return { kind: 'result', isError: result.isError === true, value, text }
  } catch (error) {
    if (deadline.aborted && !signal.aborted) return { kind: 'timeout' }
    signal.throwIfAborted()
    return { kind: 'failed', message: String(error) }
  } finally {
    /* v8 ignore next 3 -- the SDK closes an exited stdio child without rejecting; the guard keeps the outcome. */
    await client.close().catch((_error: unknown) => {
      // Closing a server that already exited can fail; the outcome above already stands.
    })
  }
}
