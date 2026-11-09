/**
 * Browser entry of the audit workbench: a sidebar entry and a main page that
 * show System Login Status and the Project Archive of every Workspace, read
 * through the `auditWorkbench` Remote namespace this entry mounts.
 */
import type { Context } from '@deepseek-ai/cordis'
import remote from '@deepseek-ai/dsh-audit-workbench/remote'
import { mountWorkbench } from './mount.ts'
import type { AuditWorkbenchKey } from './locales.ts'

export { inject } from './mount.ts'
export type { WorkbenchInjected, WorkbenchPageProps } from './WorkbenchPage.tsx'
export type { AuditWorkbenchKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Audit workbench page copy. */
    auditWorkbench: AuditWorkbenchKey
  }
}

/**
 * Mount the workbench Remote namespace and register the page.
 * @param ctx - browser plugin context.
 * @returns disposer that withdraws the page and the Remote namespace.
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> { return await mountWorkbench(ctx, remote) }
