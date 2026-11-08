/** Type-only Electron bridge declarations shared by the desktop shell and browser provider. */
import type { Branded } from '@deepseek-ai/dsh-brand'

/** Main-issued identity of one guest reservation. */
export type DesktopBrowserLeaseId = Branded<'DesktopBrowserLeaseId'>

/** Main-issued identity of one page the agent asked the Sidebar to open. */
export type DesktopBrowserAgentRequestId = Branded<'DesktopBrowserAgentRequestId'>

/** Main-process request to open a Browser tab that the Session's agent will operate. */
export interface DesktopBrowserAgentOpenRequest {
  readonly id: DesktopBrowserAgentRequestId
  /** DSH Session whose Sidebar opens the tab. */
  readonly sessionId: string
  /** Initial HTTP(S) URL; absent opens an empty page. */
  readonly url: string | undefined
}

/** A guest's approved, process-local storage partition. */
export interface DesktopBrowserReservation {
  readonly lease: DesktopBrowserLeaseId
  readonly partition: string
}

/** Main-approved request to open an HTTP(S) page from an existing guest. */
export interface DesktopBrowserOpenRequest {
  readonly lease: DesktopBrowserLeaseId
  readonly url: string
}

/** Origin-scoped operations; no Electron objects or arbitrary IPC cross this interface. */
export interface DesktopBrowserBridge {
  /**
   * @param workspace - resolved storage account.
   * @param sessionId - DSH Session whose Sidebar holds the guest; its agent may operate the page.
   * @param agentRequest - the agent page request this guest answers, consumed by its first reservation.
   * @returns one approved guest reservation.
   */
  acquire(workspace: string, sessionId?: string, agentRequest?: DesktopBrowserAgentRequestId): Promise<DesktopBrowserReservation>
  /** @param lease - the caller's reservation. @returns after its guest has been destroyed. */
  release(lease: DesktopBrowserLeaseId): Promise<void>
  /** @param lease - originating guest. @param listener - approved URL consumer. @returns unsubscribe callback. */
  onOpenRequested(lease: DesktopBrowserLeaseId, listener: (url: string) => void): () => void
  /** @param listener - receives agent page requests; absent in carriers without agent browsing. @returns unsubscribe callback. */
  readonly onAgentOpenRequested?: (listener: (request: DesktopBrowserAgentOpenRequest) => void) => () => void
}
