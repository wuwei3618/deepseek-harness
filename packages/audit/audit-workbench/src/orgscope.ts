/**
 * Reads the Organization Scope file that the audit-issue-workflow kickoff
 * writes for an Auditee under `工作区/开工/组织范围/` and records in the
 * Project Archive's `被审计单位[].组织范围文件`: the Auditee's organization
 * tree with each node's ownership. Unknown keys are ignored; a missing
 * required key, an unknown ownership, or a node whose parent does not precede
 * it rejects the whole file.
 * @module @deepseek-ai/dsh-audit-workbench/orgscope
 */

import { readFile, realpath } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { z } from 'zod'
import { inside } from './paths.ts'
import type { OrgScope, OrgScopeOwnership, OrgScopeRead } from './types.ts'

/** Organization Scope format version this package reads. */
export const ORG_SCOPE_VERSION = 1

const OWNERSHIP = { 名下: 'in', 别家: 'other', 归不到: 'unassigned', 不纳入: 'excluded' } as const satisfies Readonly<Record<string, OrgScopeOwnership>>

const optionalText = z.string().default('')

const scopeFile = z.object({
  格式版本: z.literal(ORG_SCOPE_VERSION),
  起点: z.object({ 编码: z.string().min(1), 名称: z.string() }),
  导出时间: z.string(),
  名下编码表: optionalText,
  节点: z.array(z.object({
    编码: z.string().min(1),
    名称: z.string(),
    上一级编码: z.string(),
    所属二级单位: optionalText,
    归属: z.enum(['名下', '别家', '归不到', '不纳入']).transform(value => OWNERSHIP[value]),
    定归属的来源: optionalText,
    来源不一致: optionalText,
    利润中心: z.array(z.string()).default([]),
    说明: optionalText,
  })).min(1),
})

type ParseResult = { ok: true; scope: OrgScope } | { ok: false; message: string }

/**
 * Validate Organization Scope JSON text.
 * @param textValue - the file content.
 * @returns the scope with its starting node first, or the first problem in words that name the field.
 */
export function parseOrgScope(textValue: string): ParseResult {
  let data: unknown
  try {
    data = JSON.parse(textValue.replace(/^﻿/, ''))
  } catch (error) {
    return { ok: false, message: `not valid JSON: ${(error as Error).message}` }
  }
  const result = scopeFile.safeParse(data)
  if (!result.success) {
    const [issue] = result.error.issues
    /* v8 ignore next -- zod reports at least one issue for every failed parse. */
    if (issue === undefined) return { ok: false, message: 'invalid Organization Scope' }
    return { ok: false, message: `${issue.path.length === 0 ? '' : `${issue.path.join('.')}: `}${issue.message}` }
  }
  const file = result.data
  const [first] = file.节点
  if (first?.编码 !== file.起点.编码) return { ok: false, message: '节点.0: the first node is not the starting node 起点' }
  const seen = new Set<string>()
  for (const [index, node] of file.节点.entries()) {
    if (seen.has(node.编码)) return { ok: false, message: `节点.${index}: node ${node.编码} is listed twice` }
    if (index > 0 && !seen.has(node.上一级编码)) return { ok: false, message: `节点.${index}: the parent ${node.上一级编码} of node ${node.编码} does not precede it` }
    seen.add(node.编码)
  }
  return {
    ok: true,
    scope: {
      origin: { code: file.起点.编码, name: file.起点.名称 },
      exportedAt: file.导出时间,
      membersTable: file.名下编码表,
      nodes: file.节点.map((node, index) => ({
        code: node.编码,
        name: node.名称,
        parent: index === 0 ? '' : node.上一级编码,
        unit: node.所属二级单位,
        ownership: node.归属,
        source: node.定归属的来源,
        conflict: node.来源不一致,
        profitCenters: node.利润中心.filter(code => code !== ''),
        note: node.说明,
      })),
    },
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
  return { kind: 'unreadable', reason: parsed.message.startsWith('not valid JSON') ? 'json' : 'shape', message: parsed.message }
}
