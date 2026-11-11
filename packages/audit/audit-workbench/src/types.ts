/**
 * Wire vocabulary of the audit workbench: the pack and manifest status, the
 * Project Archive of each Workspace, System Login Status, and prompt requests.
 * Types only, shared by the Host service and the browser half.
 * @module @deepseek-ai/dsh-audit-workbench/types
 */

import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'

/** The workbench manifest of a loaded pack. */
export type ManifestStatus =
  /** The pack declares no workbench manifest. */
  | { readonly kind: 'missing' }
  /** The declared manifest cannot be read or does not follow the manifest format. */
  | { readonly kind: 'invalid'; readonly message: string }
  /** The manifest was read; its systems, Built-in Models, and prompts are available. */
  | { readonly kind: 'ready' }

/** The audit plugin pack under the configured root. */
export type PackStatus =
  /** No directory exists at `root`. */
  | { readonly kind: 'missing'; readonly root: string }
  /** The directory exists but does not hold a readable release. */
  | { readonly kind: 'invalid'; readonly root: string; readonly message: string }
  /** A release was read. */
  | {
    readonly kind: 'loaded'
    readonly root: string
    /** Bundle package name. */
    readonly name: string
    /** Bundle package version. */
    readonly version: string
    readonly manifest: ManifestStatus
  }

/** One external system whose login the workbench shows. */
export interface WorkbenchSystem {
  /** Manifest id, unique within the manifest. */
  readonly id: string
  /** Display name. */
  readonly title: string
  /** One line on what the system serves; may be empty. */
  readonly description: string
  /** Whether the manifest names a login tool for the system. */
  readonly login: boolean
}

/** One Built-in Model a project can start as a Kickoff Task. */
export interface WorkbenchModel {
  /** Manifest id, unique within the manifest. */
  readonly id: string
  /** Display name, also the Kickoff Task type the skill records. */
  readonly title: string
  /** One line on what the model finds; may be empty. */
  readonly description: string
}

/** Pack, manifest, systems, and Built-in Models, read once per call. */
export interface WorkbenchOverview {
  readonly pack: PackStatus
  /** Systems in manifest order; empty unless the manifest is ready. */
  readonly systems: readonly WorkbenchSystem[]
  /** Built-in Models in manifest order; empty unless the manifest is ready. */
  readonly models: readonly WorkbenchModel[]
  /** Whether the manifest supplies the kickoff and backfill prompts. */
  readonly prompts: { readonly kickoff: boolean; readonly backfill: boolean; readonly rerun: boolean }
}

/** System Login Status after one check. */
export type SystemCheck =
  /** The system's own session check reports a usable login. */
  | { readonly state: 'ready'; readonly checkedAt: string }
  /** The check ran and reports that the person must log in; `message` is the tool's own text, possibly empty. */
  | { readonly state: 'login-required'; readonly checkedAt: string; readonly message: string }
  /** The check could not run or returned something the manifest rule cannot read. */
  | { readonly state: 'failed'; readonly checkedAt: string; readonly reason: SystemCheckFailure; readonly message: string }

/** Why a System Login Status check did not produce a reading. */
export type SystemCheckFailure =
  /** The manifest names no such system, or no audit server of that name is mounted. */
  | 'unavailable'
  /** The server did not start or the call did not complete within the configured time. */
  | 'timeout'
  /** The server failed to start or the call failed. */
  | 'call-failed'
  /** The tool reported an error or its result does not hold the manifest's field. */
  | 'unreadable'

/** Kickoff Task status as the skill records it. */
export type KickoffTaskStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped' | 'unknown'

/** One Kickoff Task of a Project Archive. */
export interface KickoffTask {
  /** Kickoff menu name, or the Built-in Model name. */
  readonly type: string
  readonly taskId: string
  readonly summary: string
  readonly status: KickoffTaskStatus
  /** The recorded status text, kept for a value outside the five statuses. */
  readonly statusText: string
  /** Output file paths as recorded. */
  readonly outputs: readonly string[]
  readonly startedAt: string
  readonly finishedAt: string
  readonly note: string
}

/** One Auditee of a Project Archive. */
export interface Auditee {
  /** Confirmed full name, or the name the person gave when none is confirmed. */
  readonly name: string
  /** Organization or business project. */
  readonly kind: string
  readonly codes: readonly string[]
  /** Organization Scope file as recorded, relative to the Project Directory; empty when none is recorded. */
  readonly scopeFile: string
}

/** A start and end month pair; either may be empty. */
export interface MonthSpan {
  readonly from: string
  readonly to: string
}

/** A reading time and its result file. */
export interface ArchiveReading {
  readonly readAt: string
  readonly file: string
}

/** The fields of a Project Archive the workbench shows. Missing text fields are empty strings. */
export interface ProjectArchive {
  /** Archive Version; absent when the archive predates the field. */
  readonly version?: number
  readonly createdAt: string
  readonly updatedAt: string
  readonly auditType: string
  readonly specialAudits: readonly string[]
  readonly auditees: readonly Auditee[]
  readonly period: MonthSpan
  readonly tenure: MonthSpan
  readonly focus: readonly { readonly content: string; readonly section: string }[]
  readonly scope: { readonly tablePath: string; readonly tableVersion: string; readonly confirmedAt: string }
  readonly tasks: readonly KickoffTask[]
  readonly precheck: ArchiveReading
  readonly freshness: ArchiveReading
  readonly changes: readonly { readonly date: string; readonly what: string; readonly basis: string }[]
}

/** The Project Archive of one Workspace. */
export type ArchiveRead =
  /** The Workspace has no Project Archive. */
  | { readonly kind: 'missing' }
  /** The file exists but cannot be read, or is not JSON, or is not a JSON object. */
  | { readonly kind: 'unreadable'; readonly reason: 'io' | 'json' | 'shape' }
  /** The archive was read; `newer` marks an Archive Version above the one this workbench knows. */
  | { readonly kind: 'read'; readonly newer: boolean; readonly archive: ProjectArchive }

/** One Workspace and its Project Archive. */
export interface ProjectEntry {
  readonly workspaceId: WorkspaceId
  /** Project Directory, the Workspace path. */
  readonly path: string
  readonly read: ArchiveRead
}

/** A prompt the workbench fills into a new Session draft. */
export type PromptRequest =
  /** Start an Audit Project in a Workspace without a Project Archive. */
  | { readonly kind: 'kickoff'; readonly workspaceId: WorkspaceId }
  /** Write the Project Archive of a Workspace whose audit started before the archive existed. */
  | { readonly kind: 'backfill'; readonly workspaceId: WorkspaceId }
  /** Run one recorded Kickoff Task again, by its index in the archive. */
  | { readonly kind: 'rerun'; readonly workspaceId: WorkspaceId; readonly task: number }
  /** Start one Built-in Model as a new Kickoff Task. */
  | { readonly kind: 'model'; readonly workspaceId: WorkspaceId; readonly model: string }

/** One recorded output of a Kickoff Task, by index. */
export interface OutputRequest {
  readonly workspaceId: WorkspaceId
  readonly task: number
  readonly output: number
}

/** Where one organization tree node stands in the audit's scope. */
export type OrgScopeOwnership =
  /** Owned by the Auditee and inside the audit's scope. */
  | 'in'
  /** In the Auditee's subtree but owned by another second-level unit. */
  | 'other'
  /** No source assigns the node to a second-level unit. */
  | 'unassigned'
  /** Owned by the Auditee but excluded by the confirmed scope table; the node's note says why. */
  | 'excluded'

/** One node of an Organization Scope. */
export interface OrgScopeNode {
  readonly code: string
  readonly name: string
  /** Parent node code; empty for the starting node. */
  readonly parent: string
  /** Owning second-level unit; may be empty. */
  readonly unit: string
  readonly ownership: OrgScopeOwnership
  /** Source the ownership was decided by; may be empty. */
  readonly source: string
  /** Sentence on disagreeing sources; empty when the sources agree. */
  readonly conflict: string
  /** The node's own profit centers, without its descendants'. */
  readonly profitCenters: readonly string[]
  /** Sentence for the person; may be empty. */
  readonly note: string
}

/** The organization tree of one Auditee, as the kickoff wrote it. */
export interface OrgScope {
  readonly origin: { readonly code: string; readonly name: string }
  readonly exportedAt: string
  /** Members table the scope was taken from, relative to the Project Directory; may be empty. */
  readonly membersTable: string
  /** Nodes in preorder; a parent precedes its children. */
  readonly nodes: readonly OrgScopeNode[]
}

/** The Organization Scope of one Auditee. */
export type OrgScopeRead =
  /** The archive records no Organization Scope file for the Auditee. */
  | { readonly kind: 'missing' }
  /** The recorded file lies outside the Project Directory, cannot be read, is not JSON, or does not follow the format. */
  | { readonly kind: 'unreadable'; readonly reason: 'outside' | 'io' | 'json' | 'shape'; readonly message: string }
  | { readonly kind: 'read'; readonly scope: OrgScope }

/** One Auditee of a Workspace's Project Archive, by index. */
export interface OrgScopeRequest {
  readonly workspaceId: WorkspaceId
  readonly auditee: number
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The request names a Workspace, task, output, Auditee, members table, or Built-in Model that does not exist now. */
    'auditWorkbench/not-found': { readonly what: 'workspace' | 'archive' | 'task' | 'output' | 'model' | 'auditee' | 'scope' }
    /** The manifest is not ready or does not supply the requested prompt. */
    'auditWorkbench/no-prompt': { readonly kind: PromptRequest['kind'] }
    /** The recorded output or members table lies outside the Project Directory or does not exist. */
    'auditWorkbench/output-refused': Record<string, never>
    /** The desktop opener failed or this Host has no desktop. */
    'auditWorkbench/open-failed': Record<string, never>
  }
}
