/**
 * Containment check for paths a Project Archive or Organization Scope file records.
 * @module @deepseek-ai/dsh-audit-workbench/paths
 */

import { isAbsolute, relative, sep } from 'node:path'

/**
 * Whether a resolved path lies strictly below a resolved directory.
 * @param parent - the directory, after `realpath`.
 * @param child - the path, after `realpath`.
 * @returns `true` when `child` is inside `parent` and is not `parent` itself.
 */
export function inside(parent: string, child: string): boolean {
  const path = relative(parent, child)
  return path !== '' && !path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path)
}
