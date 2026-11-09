/** MCP stdio fixture: a session check answering from its environment, and a tool that never returns. */
import { McpServer } from '@modelcontextprotocol/server'
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio'
import { z } from 'zod'

const server = new McpServer({ name: 'session-fixture', version: '1.0.0' })
server.registerTool('check_session', { inputSchema: z.object({ side: z.string().optional() }) }, async ({ side }) => {
  const result = { valid: process.env.FIXTURE_VALID === '1', side: side ?? '', cwd: process.cwd() }
  return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result }
})
server.registerTool('mixed', { inputSchema: z.object({}) }, async () => ({ content: [{ type: 'image', data: 'AA==', mimeType: 'image/png' }, { type: 'text', text: '{"valid":true}' }] }))
server.registerTool('empty', { inputSchema: z.object({}) }, async () => ({ content: [] }))
server.registerTool('prose', { inputSchema: z.object({}) }, async () => ({ content: [{ type: 'text', text: 'not json' }] }))
server.registerTool('broken', { inputSchema: z.object({}) }, async () => ({ content: [{ type: 'text', text: '{"valid":false}' }], isError: true }))
server.registerTool('hang', { inputSchema: z.object({}) }, () => new Promise(() => {}))
await server.connect(new StdioServerTransport())
