/** Package terminal launch scripts that reuse the installed Electron runtime. */

import { chmodSync, copyFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { AUDIT_COMMAND_NAME } from '../src/audit-command.ts'

/**
 * Copy the platform launcher into the application's public command directory under the audit command name.
 * The directory holds no `dsh` launcher, so registering it on Windows PATH cannot shadow a DeepSeek Harness `dsh`.
 * @param destination - Physical runtime/cli directory prepared for the application.
 * @param platform - Target Desktop operating system.
 */
export function prepareDesktopCli(destination: string, platform: 'darwin' | 'win32'): void {
  const source = platform === 'win32' ? 'dsh.cmd' : 'dsh'
  const command = join(destination, 'bin', platform === 'win32' ? `${AUDIT_COMMAND_NAME}.cmd` : AUDIT_COMMAND_NAME)
  mkdirSync(join(destination, 'bin'), { recursive: true })
  copyFileSync(join(import.meta.dirname, '..', 'cli', source), command)
  if (platform === 'darwin') chmodSync(command, 0o755)
}
