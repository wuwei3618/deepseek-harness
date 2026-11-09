/** Desktop audit plugin pack: the missing-pack prompt, zip import, and the swap before the Host starts. */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { MessageBoxReturnValue } from 'electron'
import { strToU8, zipSync } from 'fflate'
import { afterEach, expect, it, vi } from 'vitest'
import { DesktopAuditPluginPack } from '../src/audit-plugin-pack.ts'
import { resolveDesktopLocale } from '../src/locale.ts'
import type { UpdateDialogOptions } from '../src/update-dialog.ts'

const roots: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const PATCH = '- id: audit-preset\n  name: "@deepseek-ai/dsh-agent-preset"\n  config:\n    id: audit\n    plugins:\n      - id: audit-toolkit\n        name: "cordis:group"\n        config: []\n'

/** Write a release zip with the given version and return its path. */
function releaseZip(root: string, version: string): string {
  const file = join(root, `audit-plugins-${version}-dsh.zip`)
  writeFileSync(file, zipSync({ [`audit-plugins-${version}-dsh`]: {
    'package.json': strToU8(JSON.stringify({ name: 'audit-dsh', version, dsh: { bundle: { patch: './patch.yml' } }, exports: { '.': './index.js' } })),
    'patch.yml': strToU8(PATCH),
    'index.js': strToU8(''),
  } }))
  return file
}

/** A pack installer over a temporary Harness home whose dialogs answer with the given responses in order. */
function setup(responses: number[], zip?: (root: string) => string) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-desktop-audit-pack-'))
  roots.push(root)
  const home = join(root, 'home')
  const markerPath = join(root, 'userData', 'audit-plugin-pack-notice-dismissed')
  const show = vi.fn<(options: UpdateDialogOptions) => Promise<MessageBoxReturnValue>>(
    () => Promise.resolve({ response: responses.shift() ?? -1, checkboxChecked: false }))
  const chooseZip = vi.fn<(title: string) => Promise<string | undefined>>(() => Promise.resolve(zip?.(root)))
  const restart = vi.fn()
  const pack = new DesktopAuditPluginPack({ home, markerPath, locale: () => resolveDesktopLocale('zh'), show, chooseZip, restart })
  return { root, home, markerPath, show, chooseZip, restart, pack }
}

function installedVersion(home: string): unknown {
  return (JSON.parse(readFileSync(join(home, 'audit-plugins', 'package.json'), 'utf8')) as { version: unknown }).version
}

it('prompts once per launch while the pack is missing and imports a chosen zip that applies before the next Host start', async () => {
  const f = setup([0, 0], root => releaseZip(root, '2.66.0'))
  await f.pack.check()
  await f.pack.check()
  expect(f.show).toHaveBeenCalledTimes(2)
  expect(f.show.mock.calls[0]?.[0]).toMatchObject({ title: '未安装审计插件包', buttons: ['导入插件包…', '不再提示', '稍后'], defaultId: 0, cancelId: 2 })
  expect(f.chooseZip).toHaveBeenCalledExactlyOnceWith('选择审计插件包')
  expect(f.show.mock.calls[1]?.[0]).toMatchObject({ title: '审计插件包已就绪', message: 'audit-dsh 2.66.0 将在应用重启后启用。',
    buttons: ['立即重启', '稍后'], defaultId: 0, cancelId: 1 })
  expect(f.restart).toHaveBeenCalledOnce()
  expect(existsSync(join(f.home, 'audit-plugins'))).toBe(false)
  await f.pack.applyPending()
  expect(installedVersion(f.home)).toBe('2.66.0')
})

it('stays silent when the pack is installed or the prompt was dismissed', async () => {
  const installed = setup([])
  mkdirSync(join(installed.home, 'audit-plugins'), { recursive: true })
  writeFileSync(join(installed.home, 'audit-plugins', 'package.json'), '{}')
  await installed.pack.check()
  await installed.pack.applyPending()
  expect(installed.show).not.toHaveBeenCalled()
  expect(readFileSync(join(installed.home, 'audit-plugins', 'package.json'), 'utf8')).toBe('{}')

  const dismissed = setup([1])
  await dismissed.pack.check()
  expect(existsSync(dismissed.markerPath)).toBe(true)
  const next = new DesktopAuditPluginPack({ home: dismissed.home, markerPath: dismissed.markerPath, locale: () => resolveDesktopLocale('zh'),
    show: dismissed.show, chooseZip: dismissed.chooseZip, restart: dismissed.restart })
  await next.check()
  expect(dismissed.show).toHaveBeenCalledOnce()
})

it('reports an invalid zip and keeps the current pack, and leaves a ready pack staged when the restart is postponed', async () => {
  const f = setup([0, 1], (root) => {
    const file = join(root, 'broken.zip')
    writeFileSync(file, 'not a zip')
    return file
  })
  await f.pack.import()
  expect(f.show.mock.calls[0]?.[0]).toMatchObject({ type: 'error', title: '无法导入审计插件包', buttons: ['确定'] })
  expect(f.show.mock.calls[0]?.[0].technicalDetails).toMatch(/cannot read the zip/)
  f.chooseZip.mockImplementation(() => Promise.resolve(releaseZip(f.root, '2.66.1')))
  await f.pack.import()
  expect(f.restart).not.toHaveBeenCalled()
  await f.pack.applyPending()
  expect(installedVersion(f.home)).toBe('2.66.1')
})

it('does nothing for a cancelled file choice, a later answer, or after disposal', async () => {
  const f = setup([2])
  await f.pack.import()
  expect(f.show).not.toHaveBeenCalled()
  await f.pack.check()
  expect(f.chooseZip).toHaveBeenCalledOnce()
  expect(existsSync(f.markerPath)).toBe(false)

  const disposed = setup([0], root => releaseZip(root, '1'))
  disposed.pack.dispose()
  await disposed.pack.check()
  await disposed.pack.import()
  expect(disposed.show).not.toHaveBeenCalled()
})

it('ignores the prompt answer and the restart once shutdown begins', async () => {
  const f = setup([], root => releaseZip(root, '1'))
  f.show.mockImplementationOnce(() => { f.pack.dispose(); return Promise.resolve({ response: 0, checkboxChecked: false }) })
  await f.pack.check()
  expect(f.chooseZip).not.toHaveBeenCalled()

  const g = setup([], root => releaseZip(root, '1'))
  g.show.mockImplementationOnce(() => { g.pack.dispose(); return Promise.resolve({ response: 0, checkboxChecked: false }) })
  await g.pack.import()
  expect(g.show).toHaveBeenCalledOnce()
  expect(g.restart).not.toHaveBeenCalled()
})

it('logs a failed prompt and a failed swap without throwing', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  const f = setup([])
  f.show.mockRejectedValueOnce(new Error('no window'))
  await f.pack.check()
  expect(warn).toHaveBeenCalledWith('desktop audit plugin pack: prompt unavailable', expect.any(Error))
  mkdirSync(join(f.home, 'audit-plugins.pending'), { recursive: true })
  await f.pack.applyPending()
  expect(error).toHaveBeenCalledWith('desktop audit plugin pack: could not install the staged pack', expect.any(Error))
  expect(f.pack.packDir).toBe(join(f.home, 'audit-plugins'))
})
