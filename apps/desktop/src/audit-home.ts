/** Harness home that keeps CSCEC8B Audit Agent data apart from DeepSeek Harness in `~/.dsh`. */

import { homedir } from 'node:os'
import { join } from 'node:path'
import { DSH_HOME_ENV } from '@deepseek-ai/dsh-home-paths'

/** Directory under the operating-system home that holds the audit sessions, settings, credentials, and profiles. */
export const AUDIT_DSH_HOME_DIR_NAME = '.cscec8b-audit-agent'

/**
 * Select the Harness home that Desktop, its Host, and every process they start use.
 * @param environment - Launch environment; a nonblank `DSH_HOME` is kept, as development launches set one.
 * @param home - Operating-system home directory.
 * @returns The `DSH_HOME` value Desktop exports before any path is resolved.
 */
export function selectAuditDshHome(environment: NodeJS.ProcessEnv, home: string = homedir()): string {
  const configured = environment[DSH_HOME_ENV]
  return configured !== undefined && configured.trim() !== '' ? configured : join(home, AUDIT_DSH_HOME_DIR_NAME)
}
