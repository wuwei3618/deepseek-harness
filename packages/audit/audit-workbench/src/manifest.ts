/**
 * The workbench manifest an audit plugin pack declares under
 * `dsh.auditWorkbench` in its `package.json`: the systems whose login the
 * workbench shows, the Built-in Models, and the prompt templates.
 * @module @deepseek-ai/dsh-audit-workbench/manifest
 */

import { z } from 'zod'

/** Manifest format version this package reads. */
export const MANIFEST_VERSION = 1

/** Placeholders each prompt template may use. */
export const PROMPT_PLACEHOLDERS = {
  kickoff: ['projectDir'],
  backfill: ['projectDir'],
  rerun: ['projectDir', 'auditType', 'auditees', 'periodFrom', 'periodTo', 'taskType', 'taskId', 'taskSummary'],
  model: ['projectDir', 'auditType', 'auditees', 'periodFrom', 'periodTo', 'model'],
} as const satisfies Record<string, readonly string[]>

/** A prompt template kind. */
export type PromptKind = keyof typeof PROMPT_PLACEHOLDERS

const PLACEHOLDER = /\{\{\s*([A-Za-z]+)\s*\}\}/g

/** A JSON value the manifest passes to a tool or compares a result field with. */
type Json = string | number | boolean | null | Json[] | { [key: string]: Json }
const json: z.ZodType<Json> = z.lazy(() => z.union([
  z.string(), z.number(), z.boolean(), z.null(), z.array(json), z.record(z.string(), json),
]))

const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'ids use letters, digits, "_" and "-", at most 64 characters')
const text = z.string().trim().min(1)

function template(kind: PromptKind) {
  const allowed: readonly string[] = PROMPT_PLACEHOLDERS[kind]
  return text.superRefine((value, check) => {
    for (const [, name] of value.matchAll(PLACEHOLDER)) {
      if (name !== undefined && !allowed.includes(name)) {
        check.addIssue({ code: 'custom', message: `the ${kind} prompt may use ${allowed.map(key => `{{${key}}}`).join(', ')}, not {{${name}}}` })
      }
    }
  })
}

const call = z.strictObject({
  /** Tool name on the system's server. */
  tool: text,
  /** Tool arguments; an empty object when omitted. */
  arguments: z.record(z.string(), json).default({}),
})

const system = z.strictObject({
  id,
  title: text,
  description: z.string().default(''),
  /** `serverName` of the pack's MCP client row that serves the system. */
  server: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/),
  check: call.extend({
    /** The result field, as a key path into the structured result, and the value that means a usable login. */
    ready: z.strictObject({ path: z.array(z.string()).min(1), equals: json }),
    /** Key path of the result field whose text explains a login that is not usable. */
    message: z.array(z.string()).min(1).optional(),
  }),
  login: call.optional(),
})

const model = z.strictObject({
  id,
  title: text,
  description: z.string().default(''),
  prompt: template('model'),
})

const unique = (key: string) => (items: readonly { readonly id: string }[], check: z.RefinementCtx) => {
  const seen = new Set<string>()
  for (const item of items) {
    if (seen.has(item.id)) check.addIssue({ code: 'custom', message: `${key} id "${item.id}" is listed twice` })
    seen.add(item.id)
  }
}

const manifest = z.strictObject({
  version: z.literal(MANIFEST_VERSION),
  systems: z.array(system).default([]).superRefine(unique('system')),
  models: z.array(model).default([]).superRefine(unique('model')),
  prompts: z.strictObject({
    kickoff: template('kickoff').optional(),
    backfill: template('backfill').optional(),
    rerun: template('rerun').optional(),
  }).default({}),
})

/** A validated workbench manifest. */
export type WorkbenchManifest = z.output<typeof manifest>
/** One validated system entry. */
export type ManifestSystem = WorkbenchManifest['systems'][number]

/**
 * Validate manifest JSON text.
 * @param textValue - the manifest file content.
 * @returns the manifest, or the first problem in words that name the field.
 */
export function parseManifest(textValue: string): { ok: true; manifest: WorkbenchManifest } | { ok: false; message: string } {
  let data: unknown
  try {
    data = JSON.parse(textValue)
  } catch (error) {
    return { ok: false, message: `not valid JSON: ${(error as Error).message}` }
  }
  const result = manifest.safeParse(data)
  if (result.success) return { ok: true, manifest: result.data }
  const [issue] = result.error.issues
  /* v8 ignore next -- zod reports at least one issue for every failed parse. */
  if (issue === undefined) return { ok: false, message: 'invalid manifest' }
  const where = issue.path.length === 0 ? '' : `${issue.path.join('.')}: `
  return { ok: false, message: `${where}${issue.message}` }
}

/**
 * Fill a template's placeholders.
 * @param templateText - a validated template.
 * @param values - placeholder values; every placeholder the template uses is present.
 * @returns the prompt text.
 */
export function fillTemplate(templateText: string, values: Readonly<Record<string, string>>): string {
  return templateText.replaceAll(PLACEHOLDER, (_match, name: string) => values[name] ?? '')
}
