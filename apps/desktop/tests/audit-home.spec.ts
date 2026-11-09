import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AUDIT_DSH_HOME_DIR_NAME, selectAuditDshHome } from '../src/audit-home.ts'

describe('audit Harness home', () => {
  const home = join('/', 'Users', 'auditor')

  it('uses its own directory instead of the DeepSeek Harness ~/.dsh', () => {
    expect(selectAuditDshHome({}, home)).toBe(join(home, AUDIT_DSH_HOME_DIR_NAME))
    expect(selectAuditDshHome({}, home)).not.toBe(join(home, '.dsh'))
  })

  it('treats a blank DSH_HOME as unset', () => {
    expect(selectAuditDshHome({ DSH_HOME: '  ' }, home)).toBe(join(home, AUDIT_DSH_HOME_DIR_NAME))
  })

  it('keeps an explicit DSH_HOME', () => {
    expect(selectAuditDshHome({ DSH_HOME: '/tmp/development-home' }, home)).toBe('/tmp/development-home')
  })
})
