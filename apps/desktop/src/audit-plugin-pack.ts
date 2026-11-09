/** Desktop installation of the audit plugin pack: the missing-pack prompt, zip import, and the swap before the Host starts. */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { MessageBoxReturnValue } from 'electron'
import { applyPendingPluginPack, PACK_DIR_NAME, stagePluginPack } from '@deepseek-ai/dsh-audit-plugin-pack/install'
import { formatDesktopMessage, type DesktopLocale } from './locale.ts'
import type { UpdateDialogOptions } from './update-dialog.ts'

/** Response indexes of the missing-pack prompt. */
const IMPORT = 0
const DISMISS = 1
const LATER = 2
/** Response indexes of the restart confirmation. */
const RESTART = 0
const NOT_NOW = 1

/** Pack location, prompt dismissal, and the shell actions the installer uses. */
export interface DesktopAuditPluginPackOptions {
  /** Harness home that holds the pack directory. */
  readonly home: string
  /** Missing-pack prompt dismissal under Electron userData; updates retain it and uninstall removes it. */
  readonly markerPath: string
  readonly locale: () => DesktopLocale
  readonly show: (options: UpdateDialogOptions) => Promise<MessageBoxReturnValue>
  /** Ask for a release zip; undefined when the user cancels. */
  readonly chooseZip: (title: string) => Promise<string | undefined>
  /** Relaunch the application without the running-task confirmation. */
  readonly restart: () => void
}

/** Text of an import failure and its causes, for the technical details of the failure dialog. */
function failureDetails(error: unknown): string {
  const lines: string[] = []
  for (let current: unknown = error; current instanceof Error; current = current.cause) lines.push(current.message)
  return lines.join('\n')
}

/**
 * Imports a release zip by staging it beside the pack directory and applying it before the next Host start, so a
 * running Host never sees its pack directory replaced.
 */
export class DesktopAuditPluginPack {
  private checked = false
  private disposed = false

  /** @param options - Pack location, prompt dismissal, localized copy, and shell actions. */
  constructor(private readonly options: DesktopAuditPluginPackOptions) {}

  /** The pack directory the audit preset reads. */
  get packDir(): string { return join(this.options.home, PACK_DIR_NAME) }

  /**
   * Move a staged pack into place; call before each Host start.
   * @returns Settles after the swap; a failed swap is logged and leaves the current pack in use.
   */
  async applyPending(): Promise<void> {
    try {
      const applied = await applyPendingPluginPack(this.packDir)
      if (applied !== undefined) console.info(`desktop audit plugin pack: installed ${applied.name}@${applied.version}`)
    } catch (error) { console.error('desktop audit plugin pack: could not install the staged pack', error) }
  }

  /**
   * Prompt once per launch while the pack's `package.json` is absent and the prompt was not dismissed.
   * @returns Settles after the prompt and the import it started; failures are logged.
   */
  async check(): Promise<void> {
    if (this.checked || this.disposed) return
    this.checked = true
    if (existsSync(join(this.packDir, 'package.json')) || existsSync(this.options.markerPath)) return
    await this.prompt()
  }

  /**
   * Ask for a release zip, stage it, and offer to restart so the staged pack is applied.
   * @returns Settles after the dialogs close; an invalid zip is reported in a dialog and leaves the current pack unchanged.
   */
  async import(): Promise<void> {
    if (this.disposed) return
    await this.stage()
  }

  /** Ignore late dialog responses after application shutdown begins. */
  dispose(): void { this.disposed = true }

  private async prompt(): Promise<void> {
    try {
      const { messages } = this.options.locale()
      const result = await this.options.show({ type: 'info', title: messages.auditPluginPackMissingTitle,
        message: messages.auditPluginPackMissingBody, detail: messages.auditPluginPackMissingDetail,
        buttons: [messages.auditPluginPackImport, messages.auditPluginPackDismiss, messages.auditPluginPackLater],
        defaultId: IMPORT, cancelId: LATER })
      if (this.disposed) return
      if (result.response === IMPORT) await this.stage()
      else if (result.response === DISMISS) {
        mkdirSync(dirname(this.options.markerPath), { recursive: true })
        writeFileSync(this.options.markerPath, '')
      }
    } catch (error) { console.warn('desktop audit plugin pack: prompt unavailable', error) }
  }

  private async stage(): Promise<void> {
    const { messages } = this.options.locale()
    const file = await this.options.chooseZip(messages.auditPluginPackChooseTitle)
    if (file === undefined) return
    let staged: Awaited<ReturnType<typeof stagePluginPack>>
    try {
      staged = await stagePluginPack(file, this.packDir)
    } catch (error) {
      console.warn('desktop audit plugin pack: import failed', error)
      await this.options.show({ type: 'error', title: messages.auditPluginPackImportFailedTitle,
        message: messages.auditPluginPackImportFailedBody, technicalDetails: failureDetails(error),
        buttons: [messages.updateAcknowledge], cancelId: 0 })
      return
    }
    const result = await this.options.show({ type: 'info', title: messages.auditPluginPackReadyTitle,
      message: formatDesktopMessage(messages.auditPluginPackReadyBody, { name: staged.name, version: staged.version }),
      detail: messages.auditPluginPackReadyDetail,
      buttons: [messages.auditPluginPackRestartNow, messages.auditPluginPackLater], defaultId: RESTART, cancelId: NOT_NOW })
    if (result.response === RESTART && !this.disposed) this.options.restart()
  }
}
