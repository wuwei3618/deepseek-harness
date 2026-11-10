/**
 * Reads the Project Archive, `审计方案/00_项目档案.json` under a Project
 * Directory, which the audit-issue-workflow skill writes. The reader keeps the
 * fields it knows and reads a missing or mistyped field as empty, so an archive
 * of a newer Archive Version still shows its basic information.
 * @module @deepseek-ai/dsh-audit-workbench/archive
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ArchiveRead, ArchiveReading, KickoffTask, KickoffTaskStatus, MonthSpan, ProjectArchive } from './types.ts'

/** Archive path relative to the Project Directory. */
export const ARCHIVE_PATH = join('审计方案', '00_项目档案.json')

/** Highest Archive Version whose fields this reader knows. */
export const KNOWN_ARCHIVE_VERSION = 1

const STATUSES: Readonly<Record<string, KickoffTaskStatus>> = {
  待做: 'pending', 在跑: 'running', 完成: 'done', 失败: 'failed', 不做: 'skipped',
}

type Fields = Readonly<Record<string, unknown>>

function isRecord(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function texts(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item !== '') : []
}

function records(value: unknown): Fields[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function fields(value: unknown): Fields {
  return isRecord(value) ? value : {}
}

function span(value: unknown): MonthSpan {
  const data = fields(value)
  return { from: text(data['起']), to: text(data['止']) }
}

function reading(value: unknown): ArchiveReading {
  const data = fields(value)
  return { readAt: text(data['读数时间']), file: text(data['结果文件路径']) }
}

function task(data: Fields): KickoffTask {
  const statusText = text(data['状态'])
  return {
    type: text(data['类型']),
    taskId: text(data['任务号']),
    summary: text(data['参数摘要']),
    status: STATUSES[statusText] ?? 'unknown',
    statusText,
    outputs: texts(data['产物路径']),
    startedAt: text(data['开始时间']),
    finishedAt: text(data['完成时间']),
    note: text(data['备注']),
  }
}

function version(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined
}

/**
 * Project the fields the workbench shows out of parsed archive JSON.
 * @param data - the parsed archive object.
 * @returns the known fields, empty where the archive lacks or mistypes one.
 */
export function projectArchive(data: Fields): ProjectArchive {
  const scope = fields(data['取数范围'])
  const archiveVersion = version(data['档案版本'])
  return {
    ...archiveVersion === undefined ? {} : { version: archiveVersion },
    createdAt: text(data['建档时间']),
    updatedAt: text(data['更新时间']),
    auditType: text(data['审计类型']),
    specialAudits: texts(data['同时开展的专项审计']),
    auditees: records(data['被审计单位']).map(item => ({
      name: text(item['确认的全称']) || text(item['用户说的名称']),
      kind: text(item['对象类型']),
      codes: texts(item['编码']),
    })),
    period: span(data['审计期间']),
    tenure: span(data['任期']),
    focus: records(data['审计重点']).map(item => ({ content: text(item['内容']), section: text(item['对应板块']) })),
    scope: { tablePath: text(scope['范围表路径']), tableVersion: text(scope['范围表版本']), confirmedAt: text(scope['用户确认时间']) },
    tasks: records(data['开工任务']).map(task),
    precheck: reading(data['会话预检']),
    freshness: reading(data['数据鲜度']),
    changes: records(data['修改记录']).map(item => ({ date: text(item['日期']), what: text(item['改了什么']), basis: text(item['依据']) })),
  }
}

/**
 * Read the Project Archive of one Project Directory.
 * @param projectDir - the absolute Workspace path.
 * @returns the archive, `missing` when the file does not exist, or why it cannot be read.
 */
export async function readArchive(projectDir: string): Promise<ArchiveRead> {
  let content: string
  try {
    content = await readFile(join(projectDir, ARCHIVE_PATH), 'utf8')
  } catch (error) {
    const { code } = error as NodeJS.ErrnoException
    return code === 'ENOENT' || code === 'ENOTDIR' ? { kind: 'missing' } : { kind: 'unreadable', reason: 'io' }
  }
  let data: unknown
  try {
    data = JSON.parse(content.replace(/^﻿/, ''))
  } catch (_error) {
    // The skill writes the archive whole; a parse failure means a hand edit or an interrupted write the person must see.
    return { kind: 'unreadable', reason: 'json' }
  }
  if (!isRecord(data)) return { kind: 'unreadable', reason: 'shape' }
  const archive = projectArchive(data)
  return { kind: 'read', newer: archive.version !== undefined && archive.version > KNOWN_ARCHIVE_VERSION, archive }
}
