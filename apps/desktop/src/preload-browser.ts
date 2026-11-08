/** Lease-scoped browser operations and one main-process event subscription per window. */
import { ipcRenderer } from 'electron'
import type {
  DesktopBrowserAgentOpenRequest, DesktopBrowserAgentRequestId, DesktopBrowserBridge, DesktopBrowserLeaseId,
} from '@deepseek-ai/dsh-client-ui-sidebar-browser/types'
import { DESKTOP_IPC } from './ipc.ts'

/** @returns browser operations that expose neither IPC nor Electron objects. */
export function createDesktopBrowserBridge(): DesktopBrowserBridge {
  const listeners = new Map<DesktopBrowserLeaseId, Set<(url: string) => void>>()
  ipcRenderer.on(DESKTOP_IPC.browserOpenRequested, (_event, request: unknown) => {
    if (typeof request !== 'object' || request === null || !('lease' in request) || !('url' in request)
      || typeof request.lease !== 'string' || typeof request.url !== 'string') return
    const callbacks = listeners.get(request.lease as DesktopBrowserLeaseId)
    if (callbacks === undefined) return
    for (const callback of [...callbacks]) {
      try { callback(request.url) }
      catch (error) { console.error('Desktop browser link handler failed', error) }
    }
  })
  const agentListeners = new Set<(request: DesktopBrowserAgentOpenRequest) => void>()
  ipcRenderer.on(DESKTOP_IPC.browserAgentOpenRequested, (_event, request: unknown) => {
    if (typeof request !== 'object' || request === null || !('id' in request) || !('sessionId' in request) || !('url' in request)
      || typeof request.id !== 'string' || typeof request.sessionId !== 'string'
      || (request.url !== undefined && typeof request.url !== 'string')) return
    const accepted: DesktopBrowserAgentOpenRequest = {
      id: request.id as DesktopBrowserAgentRequestId, sessionId: request.sessionId, url: request.url,
    }
    for (const listener of [...agentListeners]) {
      try { listener(accepted) }
      catch (error) { console.error('Desktop browser agent page handler failed', error) }
    }
  })
  return {
    acquire: (workspace, sessionId, agentRequest) => ipcRenderer.invoke(DESKTOP_IPC.browserAcquire, workspace, sessionId, agentRequest) as ReturnType<DesktopBrowserBridge['acquire']>,
    release: lease => ipcRenderer.invoke(DESKTOP_IPC.browserRelease, lease) as Promise<void>,
    onOpenRequested(lease, listener) {
      let callbacks = listeners.get(lease)
      if (callbacks === undefined) { callbacks = new Set(); listeners.set(lease, callbacks) }
      callbacks.add(listener)
      return () => {
        callbacks.delete(listener)
        if (callbacks.size === 0 && listeners.get(lease) === callbacks) listeners.delete(lease)
      }
    },
    onAgentOpenRequested(listener) {
      agentListeners.add(listener)
      return () => { agentListeners.delete(listener) }
    },
  }
}
