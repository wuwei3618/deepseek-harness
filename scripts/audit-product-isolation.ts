/**
 * Experimental packages the audit fork admits into its default product, shared by the source isolation gate
 * (`verify-default-product-isolation.ts`) and the packed-install gate (`release/installed-product-isolation.ts`).
 */

/** The audit Desktop bundle, the only nonexperimental package that may depend on {@link AUDIT_DESKTOP_BROWSER_PACKAGES}. */
export const AUDIT_DESKTOP_BUNDLE = '@deepseek-ai/dsh-audit-desktop'

/** Repository directory of {@link AUDIT_DESKTOP_BUNDLE}. */
export const AUDIT_DESKTOP_BUNDLE_DIRECTORY = 'packages/audit/audit-desktop/'

/**
 * Optional bundles the audit Desktop template switches on. The audit fork ships them always on in its Desktop
 * product; they stay optional bundles for every other template and keep their own dependency graphs.
 */
export const AUDIT_DESKTOP_OPTIONAL_BUNDLES: ReadonlySet<string> = new Set([
  '@deepseek-ai/dsh-experimental-session-search',
  '@deepseek-ai/dsh-experimental-voice-input-bundle',
])

/**
 * Experimental packages the audit Desktop bundle mounts so its agent can operate the Desktop Sidebar browser, by npm
 * name with their repository directories. They are accepted only as dependencies of {@link AUDIT_DESKTOP_BUNDLE} or of
 * each other.
 */
export const AUDIT_DESKTOP_BROWSER_PACKAGES: ReadonlyMap<string, string> = new Map([
  ['@deepseek-ai/dsh-experimental-browser-use-playwright-mcp', 'packages/experimental/browser-use-playwright-mcp/'],
  ['@deepseek-ai/dsh-experimental-browser-use-runtime', 'packages/experimental/browser-use-runtime/'],
])

/**
 * Whether a runtime dependency edge is the audit Desktop browser exception.
 * @param parent - npm name of the depending package.
 * @param name - npm name of the experimental dependency.
 * @returns Whether `name` is an audit Desktop browser package and `parent` is the audit Desktop bundle or one of them.
 */
export function isAuditDesktopBrowserEdge(parent: string | undefined, name: string): boolean {
  return AUDIT_DESKTOP_BROWSER_PACKAGES.has(name)
    && parent !== undefined && (parent === AUDIT_DESKTOP_BUNDLE || AUDIT_DESKTOP_BROWSER_PACKAGES.has(parent))
}
