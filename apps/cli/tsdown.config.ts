import { defineConfig } from 'tsdown'

/**
 * `DSH_AUDIT_RELEASE_LOCK=1` builds a locked audit release (`src/release-lock.ts`); unset or `0` builds unlocked.
 * Any other value fails the build so that a misspelled release flag cannot ship an unlocked launcher.
 */
function auditReleaseLock(value: string | undefined): boolean {
  if (value === undefined || value === '' || value === '0') return false
  if (value === '1') return true
  throw new Error(`cli build: DSH_AUDIT_RELEASE_LOCK must be 1 or 0, got ${JSON.stringify(value)}`)
}

/**
 * The dsh CLI ships its command and the profile lifecycle shared with Desktop.
 * Declarations come from `tsc -b` (dts: false), matching every package.
 */
export default defineConfig({
  entry: { bin: 'lib/types/installed-bin.js', 'profile-boot': 'lib/types/profile-boot.js' },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: ['lib/*.js'],
  define: { __DSH_AUDIT_RELEASE_LOCK__: JSON.stringify(auditReleaseLock(process.env.DSH_AUDIT_RELEASE_LOCK)) },
})
