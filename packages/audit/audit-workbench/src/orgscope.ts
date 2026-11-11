/**
 * Reads the Organization Scope file that the audit-issue-workflow kickoff
 * writes for an Auditee under `工作区/开工/组织范围/` and records in the
 * Project Archive's `被审计单位[].组织范围文件`: the Auditee's organization
 * tree with each node's ownership. The file header must follow the format and
 * the first node must be the starting node 起点; otherwise the whole file is
 * unreadable. A node with an empty 上一级编码 is a top-level node. Each other
 * node is read on its own: a node that does not follow the format or repeats
 * an earlier code is left out, a node whose parent no earlier node holds is
 * read as a top-level node, and each case is reported as a problem. Unknown
 * keys are ignored.
 * @module @deepseek-ai/dsh-audit-workbench/orgscope
 */

import { readFile, realpath } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { z } from 'zod'
import { inside } from './paths.ts'
import type { OrgScope, OrgScopeNode, OrgScopeOwnership, OrgScopeProblem, OrgScopeRead } from './types.ts'

/** Organization Scope format version this package reads. */
export const ORG_SCOPE_VERSION = 1

const OWNERSHIP = { 名下: 'in', 别家: 'other', 归不到: 'unassigned', 不纳入: 'excluded' } as const satisfies Readonly<Record<string, OrgScopeOwnership>>

const optionalText = z.string().default('')

const scopeHeader = z.object({
  格式版本: z.literal(ORG_SCOPE_VERSION),
  起点: z.object({ 编码: z.string().min(1), 名称: z.string() }),
  导出时间: z.string(),
  名下编码表: optionalText,
  节点: z.array(z.unknown()).min(1),
})

const scopeNode = z.object({
  编码: z.string().min(1),
  名称: z.string(),
  上一级编码: z.string(),
  所属二级单位: optionalText,
  归属: z.enum(['名下', '别家', '归不到', '不纳入']).transform(value => OWNERSHIP[value]),
  定归属的来源: optionalText,
  来源不一致: optionalText,
  利润中心: z.array(z.string()).default([]),
  说明: optionalText,
})

/** Why a whole file cannot be shown, with the field path or code at fault. */
type ParseFailure = { readonly ok: false; readonly reason: 'json' | 'shape' | 'origin'; readonly message: string }
type ParseResult = { readonly ok: true; readonly scope: OrgScope } | ParseFailure

/** The dotted path of the first issue, empty for the value itself. */
function firstPath(error: z.ZodError): string {
  /* v8 ignore next -- zod reports at least one issue for every failed parse. */
  return error.issues[0]?.path.join('.') ?? ''
}

function codeOf(raw: unknown): string {
  const code = typeof raw === 'object' && raw !== null && '编码' in raw ? raw.编码 : undefined
  return typeof code === 'string' ? code : ''
}

/**
 * Validate Organization Scope JSON text.
 * @param textValue - the file content.
 * @returns the scope with its starting node first and the problems of single nodes; or why the whole file cannot be
 * shown: `json` with the parser's message, `shape` with the dotted path of the header field at fault, or `origin` with
 * the code of a first node that is not 起点.
 */
export function parseOrgScope(textValue: string): ParseResult {
  let data: unknown
  try {
    data = JSON.parse(textValue.replace(/^\uFEFF/, ''))
  } catch (error) {
    return { ok: false, reason: 'json', message: (error as Error).message }
  }
  const header = scopeHeader.safeParse(data)
  if (!header.success) return { ok: false, reason: 'shape', message: firstPath(header.error) }
  const file = header.data
  const first = scopeNode.safeParse(file.节点[0])
  if (!first.success) return { ok: false, reason: 'shape', message: `节点.0.${firstPath(first.error)}` }
  if (first.data.编码 !== file.起点.编码) return { ok: false, reason: 'origin', message: first.data.编码 }
  const nodes: OrgScopeNode[] = []
  const problems: OrgScopeProblem[] = []
  const seen = new Set<string>()
  for (const [index, raw] of file.节点.entries()) {
    const parsed = scopeNode.safeParse(raw)
    if (!parsed.success) {
      problems.push({ kind: 'invalid', index, code: codeOf(raw), field: firstPath(parsed.error) })
      continue
    }
    const node = parsed.data
    if (seen.has(node.编码)) {
      problems.push({ kind: 'duplicate', index, code: node.编码 })
      continue
    }
    let parent = index === 0 ? '' : node.上一级编码
    if (parent !== '' && !seen.has(parent)) {
      problems.push({ kind: 'detached', index, code: node.编码, parent })
      parent = ''
    }
    seen.add(node.编码)
    nodes.push({
      code: node.编码,
      name: node.名称,
      parent,
      unit: node.所属二级单位,
      ownership: node.归属,
      source: node.定归属的来源,
      conflict: node.来源不一致,
      profitCenters: node.利润中心.filter(code => code !== ''),
      note: node.说明,
    })
  }
  return {
    ok: true,
    scope: { origin: { code: file.起点.编码, name: file.起点.名称 }, exportedAt: file.导出时间, membersTable: file.名下编码表, nodes, problems },
  }
}

/**
 * Read one recorded Organization Scope file.
 * @param projectDir - the absolute Project Directory.
 * @param recorded - the path the archive records, relative to the Project Directory or absolute; empty when none.
 * @returns the scope, `missing` when none is recorded, or why it cannot be read.
 */
export async function readOrgScope(projectDir: string, recorded: string): Promise<OrgScopeRead> {
  if (recorded === '') return { kind: 'missing' }
  let content: string
  try {
    const target = await realpath(isAbsolute(recorded) ? recorded : join(projectDir, recorded))
    if (!inside(await realpath(projectDir), target)) return { kind: 'unreadable', reason: 'outside', message: recorded }
    content = await readFile(target, 'utf8')
  } catch (error) {
    return { kind: 'unreadable', reason: 'io', message: (error as Error).message }
  }
  const parsed = parseOrgScope(content)
  if (parsed.ok) return { kind: 'read', scope: parsed.scope }
  return { kind: 'unreadable', reason: parsed.reason, message: parsed.message }
}
