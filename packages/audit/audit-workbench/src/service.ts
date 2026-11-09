/**
 * Host service of the audit workbench: reads the pack and its workbench
 * manifest, the Project Archive of every Workspace, fills prompt templates,
 * checks System Login Status by calling each system's own session tool, and
 * opens recorded outputs.
 * @module @deepseek-ai/dsh-audit-workbench/service
 */

import { readFile, realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { readPluginPack, type LoadedPack } from '@deepseek-ai/dsh-audit-plugin-pack'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-workspace'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { readArchive } from './archive.ts'
import type { ServerLaunch } from './call.ts'
import { internals } from './internals.ts'
import { fillTemplate, parseManifest, type ManifestSystem, type WorkbenchManifest } from './manifest.ts'
import type {
  ArchiveRead, OutputRequest, PackStatus, ProjectArchive, ProjectEntry, PromptRequest, SystemCheck, WorkbenchOverview,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Audit workbench reads and System Login Status checks. */
    auditWorkbench: AuditWorkbenchService
  }
}

/** Resolved service settings. */
export interface ServiceSpec {
  /** Absolute pack directory. */
  readonly root: string
  /** Deadline for one session check, server start included. */
  readonly checkTimeoutMs: number
  /** Deadline for one login tool call, server start included. */
  readonly loginTimeoutMs: number
}

type ManifestRead = { kind: 'missing' } | { kind: 'invalid'; message: string } | { kind: 'ready'; manifest: WorkbenchManifest }

interface PackRead {
  readonly status: PackStatus
  readonly manifest: WorkbenchManifest | undefined
}

async function readWorkbenchManifest(pack: LoadedPack): Promise<ManifestRead> {
  if (pack.workbench === undefined) return { kind: 'missing' }
  let content: string
  try {
    content = await readFile(pack.workbench, 'utf8')
  } catch (error) {
    return { kind: 'invalid', message: `cannot read ${pack.workbench}: ${(error as Error).message}` }
  }
  const parsed = parseManifest(content.replace(/^﻿/, ''))
  return parsed.ok ? { kind: 'ready', manifest: parsed.manifest } : { kind: 'invalid', message: parsed.message }
}

function at(value: unknown, path: readonly string[]): { found: boolean; value: unknown } {
  let current = value
  for (const key of path) {
    if (typeof current !== 'object' || current === null || Array.isArray(current) || !Object.hasOwn(current, key)) return { found: false, value: undefined }
    current = (current as Record<string, unknown>)[key]
  }
  return { found: true, value: current }
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function inside(parent: string, child: string): boolean {
  const path = relative(parent, child)
  return path !== '' && !path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path)
}

/** Remote reads and checks behind the workbench page. */
export class AuditWorkbenchService extends TypertRemoteService {
  static inject = ['workspaceRegistry']

  private readonly servers = new Map<string, ServerLaunch>()

  /**
   * @param ctx - owning Host context.
   * @param spec - resolved pack location and deadlines.
   */
  constructor(ctx: Context, private readonly spec: ServiceSpec) {
    super(ctx, 'auditWorkbench')
  }

  /**
   * Record the launch values of one mounted audit server.
   * @param launch - values the pack's MCP client row resolves to.
   * @returns the disposer that forgets the server.
   * @throws when a server of the same name is already recorded.
   */
  registerServer(launch: ServerLaunch): () => void {
    if (this.servers.has(launch.serverName)) throw new Error(`audit-workbench: server "${launch.serverName}" is registered twice`)
    this.servers.set(launch.serverName, launch)
    return () => { this.servers.delete(launch.serverName) }
  }

  private async readPack(): Promise<PackRead> {
    let pack: Awaited<ReturnType<typeof readPluginPack>>
    try {
      pack = await readPluginPack(this.spec.root)
    } catch (error) {
      return { status: { kind: 'invalid', root: this.spec.root, message: (error as Error).message }, manifest: undefined }
    }
    if (pack.kind === 'missing') return { status: pack, manifest: undefined }
    const manifest = await readWorkbenchManifest(pack)
    const status: PackStatus = {
      kind: 'loaded', root: pack.root, name: pack.name, version: pack.version,
      manifest: manifest.kind === 'ready' ? { kind: 'ready' } : manifest,
    }
    return { status, manifest: manifest.kind === 'ready' ? manifest.manifest : undefined }
  }

  /**
   * Read the pack, its workbench manifest, and the systems and Built-in Models it lists.
   * @param signal - caller cancellation.
   * @returns the pack status with the manifest's systems, Built-in Models, and available prompts.
   */
  @Remote
  async overview(signal: AbortSignal): Promise<WorkbenchOverview> {
    const { status, manifest } = await this.readPack()
    signal.throwIfAborted()
    return {
      pack: status,
      systems: (manifest?.systems ?? []).map(system => ({
        id: system.id, title: system.title, description: system.description, login: system.login !== undefined,
      })),
      models: (manifest?.models ?? []).map(model => ({ id: model.id, title: model.title, description: model.description })),
      prompts: {
        kickoff: manifest?.prompts.kickoff !== undefined,
        backfill: manifest?.prompts.backfill !== undefined,
        rerun: manifest?.prompts.rerun !== undefined,
      },
    }
  }

  /**
   * Read the Project Archive of every Workspace.
   * @param signal - caller cancellation.
   * @returns one entry per Workspace in registry order.
   */
  @Remote
  async projects(signal: AbortSignal): Promise<ProjectEntry[]> {
    const workspaces = this.ctx.workspaceRegistry.list()
    const reads = await Promise.all(workspaces.map(workspace => readArchive(workspace.path)))
    signal.throwIfAborted()
    return workspaces.map((workspace, index) => ({ workspaceId: workspace.id, path: workspace.path, read: reads[index] as ArchiveRead }))
  }

  private async archiveOf(workspaceId: WorkspaceId): Promise<{ path: string; archive: ProjectArchive }> {
    const workspace = this.ctx.workspaceRegistry.get(workspaceId)
    if (workspace === undefined) throw new RemoteError('auditWorkbench/not-found', 'The Workspace does not exist', { what: 'workspace' })
    const read = await readArchive(workspace.path)
    if (read.kind !== 'read') throw new RemoteError('auditWorkbench/not-found', 'The Workspace has no readable Project Archive', { what: 'archive' })
    return { path: workspace.path, archive: read.archive }
  }

  /**
   * Fill the manifest's prompt template for one request.
   * @param request - prompt kind and its Workspace, task, or Built-in Model.
   * @param signal - caller cancellation.
   * @returns the prompt text for a new Session draft.
   */
  @Remote
  async prompt(request: PromptRequest, signal: AbortSignal): Promise<string> {
    const { manifest } = await this.readPack()
    signal.throwIfAborted()
    const noPrompt = () => new RemoteError('auditWorkbench/no-prompt', 'The workbench manifest supplies no such prompt', { kind: request.kind })
    if (request.kind === 'kickoff' || request.kind === 'backfill') {
      const template = manifest?.prompts[request.kind]
      if (template === undefined) throw noPrompt()
      const workspace = this.ctx.workspaceRegistry.get(request.workspaceId)
      if (workspace === undefined) throw new RemoteError('auditWorkbench/not-found', 'The Workspace does not exist', { what: 'workspace' })
      return fillTemplate(template, { projectDir: workspace.path })
    }
    const { path, archive } = await this.archiveOf(request.workspaceId)
    signal.throwIfAborted()
    const common = {
      projectDir: path,
      auditType: archive.auditType,
      auditees: archive.auditees.map(auditee => auditee.name).filter(name => name !== '').join('、'),
      periodFrom: archive.period.from,
      periodTo: archive.period.to,
    }
    if (request.kind === 'rerun') {
      const template = manifest?.prompts.rerun
      if (template === undefined) throw noPrompt()
      const task = archive.tasks[request.task]
      if (task === undefined) throw new RemoteError('auditWorkbench/not-found', 'The Kickoff Task does not exist', { what: 'task' })
      return fillTemplate(template, { ...common, taskType: task.type, taskId: task.taskId, taskSummary: task.summary })
    }
    const model = manifest?.models.find(item => item.id === request.model)
    if (model === undefined) throw new RemoteError('auditWorkbench/not-found', 'The Built-in Model does not exist', { what: 'model' })
    return fillTemplate(model.prompt, { ...common, model: model.title })
  }

  private async systemOf(id: string): Promise<{ system: ManifestSystem; launch: ServerLaunch } | undefined> {
    const { manifest } = await this.readPack()
    const system = manifest?.systems.find(item => item.id === id)
    const launch = system === undefined ? undefined : this.servers.get(system.server)
    return system === undefined || launch === undefined ? undefined : { system, launch }
  }

  private async check(system: ManifestSystem, launch: ServerLaunch, signal: AbortSignal): Promise<SystemCheck> {
    const outcome = await internals.callTool(launch, system.check.tool, system.check.arguments, this.spec.checkTimeoutMs, signal)
    const checkedAt = new Date().toISOString()
    if (outcome.kind === 'timeout') return { state: 'failed', checkedAt, reason: 'timeout', message: '' }
    if (outcome.kind === 'failed') return { state: 'failed', checkedAt, reason: 'call-failed', message: outcome.message }
    const field = at(outcome.value, system.check.ready.path)
    if (outcome.isError || !field.found) return { state: 'failed', checkedAt, reason: 'unreadable', message: outcome.text }
    if (sameJson(field.value, system.check.ready.equals)) return { state: 'ready', checkedAt }
    const message = system.check.message === undefined ? undefined : at(outcome.value, system.check.message).value
    return { state: 'login-required', checkedAt, message: typeof message === 'string' ? message : '' }
  }

  /**
   * Check one system's System Login Status with its session tool.
   * @param id - manifest system id.
   * @param signal - caller cancellation; aborting closes the server.
   * @returns the reading, or why none was produced.
   */
  @Remote
  async checkSystem(id: string, signal: AbortSignal): Promise<SystemCheck> {
    const found = await this.systemOf(id)
    if (found === undefined) return { state: 'failed', checkedAt: new Date().toISOString(), reason: 'unavailable', message: '' }
    return await this.check(found.system, found.launch, signal)
  }

  /**
   * Run one system's own login tool, which opens its browser for the person, then check again.
   * @param id - manifest system id.
   * @param signal - caller cancellation; aborting closes the server and its login browser.
   * @returns the System Login Status after the login tool returns.
   */
  @Remote
  async login(id: string, signal: AbortSignal): Promise<SystemCheck> {
    const found = await this.systemOf(id)
    if (found?.system.login === undefined) return { state: 'failed', checkedAt: new Date().toISOString(), reason: 'unavailable', message: '' }
    const { tool, arguments: args } = found.system.login
    const outcome = await internals.callTool(found.launch, tool, args, this.spec.loginTimeoutMs, signal)
    if (outcome.kind === 'timeout') return { state: 'failed', checkedAt: new Date().toISOString(), reason: 'timeout', message: '' }
    return await this.check(found.system, found.launch, signal)
  }

  /**
   * Open one recorded Kickoff Task output with the desktop's default application.
   * @param request - Workspace, task index, and output index in the Project Archive.
   * @param signal - caller cancellation.
   */
  @Remote
  async openOutput(request: OutputRequest, signal: AbortSignal): Promise<void> {
    const { path, archive } = await this.archiveOf(request.workspaceId)
    const output = archive.tasks[request.task]?.outputs[request.output]
    if (output === undefined) throw new RemoteError('auditWorkbench/not-found', 'The output does not exist', { what: 'output' })
    let target: string
    try {
      if (!isAbsolute(output)) throw new Error('the recorded output path is relative')
      target = await realpath(output)
      if (!inside(await realpath(path), target)) throw new Error('the recorded output lies outside the Project Directory')
      await stat(target)
    } catch (error) {
      throw new RemoteError('auditWorkbench/output-refused', 'The output is not a file inside the Project Directory', {}, { cause: error })
    }
    signal.throwIfAborted()
    try {
      await internals.openPath(target, signal)
    } catch (error) {
      signal.throwIfAborted()
      throw new RemoteError('auditWorkbench/open-failed', 'The desktop could not open the output', {}, { cause: error })
    }
  }
}
