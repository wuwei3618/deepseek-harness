/** Pure index, tally, filter, and visible-row helpers over one Organization Scope for the organization scope view. */
import { assertNever } from '@deepseek-ai/dsh-util-values'
import type { OrgScope, OrgScopeNode } from '@deepseek-ai/dsh-audit-workbench/types'

/** Ownership filter of the organization scope view; `out` covers excluded and unassigned nodes. */
export type ScopeFilter = 'all' | 'in' | 'other' | 'out' | 'conflict'

/** One Organization Scope indexed by code. */
export interface ScopeIndex {
  /** The starting node. */
  readonly root: OrgScopeNode
  /** Top-level codes in file order, the starting node first. */
  readonly tops: readonly string[]
  readonly byCode: ReadonlyMap<string, OrgScopeNode>
  /** Child codes in file order. */
  readonly children: ReadonlyMap<string, readonly string[]>
  /** Number of all descendants of each node. */
  readonly descendants: ReadonlyMap<string, number>
  /** Recorded parent of each node the reader moved to the top level because no earlier node holds that parent. */
  readonly detached: ReadonlyMap<string, string>
}

/** Node counts the filter chips show. */
export interface ScopeTally {
  readonly all: number
  readonly in: number
  readonly other: number
  readonly out: number
  readonly conflict: number
  /** Profit centers of the nodes inside the scope. */
  readonly profitCenters: number
}

/** One rendered tree row. */
export interface ScopeRow {
  readonly node: OrgScopeNode
  readonly depth: number
  /** Whether the node has children that the current filter keeps. */
  readonly expandable: boolean
  readonly expanded: boolean
  /** Whether the node itself matches the current filter and query. */
  readonly hit: boolean
}

/** The rows to render and whether the limit cut them. */
export interface ScopeRows {
  readonly rows: readonly ScopeRow[]
  readonly truncated: boolean
}

/**
 * Index an Organization Scope whose nodes list each parent before its children with the starting node first.
 * @param scope - the read scope; the Host reader guarantees a starting node and parents before children.
 * @returns the index.
 */
export function indexScope(scope: OrgScope): ScopeIndex {
  const byCode = new Map<string, OrgScopeNode>()
  const children = new Map<string, string[]>()
  const tops: string[] = []
  for (const node of scope.nodes) {
    byCode.set(node.code, node)
    if (node.parent === '') {
      tops.push(node.code)
      continue
    }
    const siblings = children.get(node.parent)
    if (siblings === undefined) children.set(node.parent, [node.code])
    else siblings.push(node.code)
  }
  const descendants = new Map<string, number>()
  // The file lists every child after its parent, so a reverse pass sees each subtree complete.
  for (const node of scope.nodes.toReversed()) {
    const own = descendants.get(node.code) ?? 0
    descendants.set(node.code, own)
    if (node.parent !== '') descendants.set(node.parent, (descendants.get(node.parent) ?? 0) + own + 1)
  }
  const detached = new Map(scope.problems.flatMap(problem => problem.kind === 'detached' ? [[problem.code, problem.parent] as const] : []))
  return { root: scope.nodes[0] as OrgScopeNode, tops, byCode, children, descendants, detached }
}

/**
 * Count the nodes per filter and the profit centers inside the scope.
 * @param scope - the read scope.
 * @returns the counts.
 */
export function tallyScope(scope: OrgScope): ScopeTally {
  let inScope = 0, other = 0, out = 0, conflict = 0, profitCenters = 0
  for (const node of scope.nodes) {
    if (node.ownership === 'in') {
      inScope++
      profitCenters += node.profitCenters.length
    } else if (node.ownership === 'other') other++
    else out++
    if (node.conflict !== '') conflict++
  }
  return { all: scope.nodes.length, in: inScope, other, out, conflict, profitCenters }
}

/**
 * The node of a code the scope holds.
 * @param index - the indexed scope.
 * @param code - a code taken from the same index.
 * @returns the node.
 */
export function nodeOf(index: ScopeIndex, code: string): OrgScopeNode {
  return index.byCode.get(code) as OrgScopeNode
}

/**
 * Child codes of a node in file order.
 * @param index - the indexed scope.
 * @param code - any code, possibly one an earlier scope held.
 * @returns the child codes, empty for a leaf or an unknown code.
 */
export function childrenOf(index: ScopeIndex, code: string): readonly string[] {
  return index.children.get(code) ?? []
}

/**
 * Number of all descendants of a node.
 * @param index - the indexed scope.
 * @param code - any code.
 * @returns the count, 0 for a leaf or an unknown code.
 */
export function descendantsOf(index: ScopeIndex, code: string): number {
  return index.descendants.get(code) ?? 0
}

function matchesFilter(node: OrgScopeNode, filter: ScopeFilter): boolean {
  switch (filter) {
    case 'all': return true
    case 'in': return node.ownership === 'in'
    case 'other': return node.ownership === 'other'
    case 'out': return node.ownership === 'excluded' || node.ownership === 'unassigned'
    case 'conflict': return node.conflict !== ''
    /* v8 ignore next -- ScopeFilter is a closed union of the five handled filters. */
    default: return assertNever(filter, 'organization scope filter')
  }
}

function matchesQuery(node: OrgScopeNode, query: string): boolean {
  return query === '' || node.name.toLowerCase().includes(query) || node.code.toLowerCase().includes(query)
}

/**
 * Ancestor codes of a node from its top-level node down to its parent.
 * @param index - the indexed scope.
 * @param code - a code the scope holds.
 * @returns the codes, empty for a top-level node.
 */
export function ancestors(index: ScopeIndex, code: string): string[] {
  const chain: string[] = []
  for (let parent = nodeOf(index, code).parent; parent !== ''; parent = nodeOf(index, parent).parent) chain.unshift(parent)
  return chain
}

/**
 * The rows of the tree view in preorder, top-level nodes in file order. Without a filter or query only expanded nodes
 * show their children; with one, every matching node shows with its ancestors expanded and the other nodes are left out.
 * @param index - the indexed scope.
 * @param view - expanded codes, the filter, the query (already trimmed), and the row limit.
 * @returns the rows up to `limit`, and whether more rows were cut.
 */
export function visibleRows(index: ScopeIndex, view: {
  readonly expanded: ReadonlySet<string>
  readonly filter: ScopeFilter
  readonly query: string
  readonly limit: number
}): ScopeRows {
  const query = view.query.toLowerCase()
  const narrowing = query !== '' || view.filter !== 'all'
  const hits = new Set<string>()
  const kept = new Set<string>()
  if (narrowing) {
    for (const node of index.byCode.values()) {
      if (!matchesFilter(node, view.filter) || !matchesQuery(node, query)) continue
      hits.add(node.code)
      for (let code = node.code; code !== '' && !kept.has(code); code = nodeOf(index, code).parent) kept.add(code)
    }
  }
  const rows: ScopeRow[] = []
  let truncated = false
  const walk = (code: string, depth: number): void => {
    if (rows.length >= view.limit) {
      truncated = true
      return
    }
    const node = nodeOf(index, code)
    const children = childrenOf(index, code).filter(child => !narrowing || kept.has(child))
    const expanded = narrowing || view.expanded.has(code)
    rows.push({ node, depth, expandable: children.length > 0, expanded, hit: hits.has(code) })
    if (expanded) for (const child of children) walk(child, depth + 1)
  }
  for (const top of index.tops) if (!narrowing || kept.has(top)) walk(top, 0)
  return { rows, truncated }
}

/** One run of a name or code, marked when it matches the query. */
export interface TextRun {
  readonly text: string
  readonly hit: boolean
}

/**
 * Split text into runs around each case-insensitive occurrence of the query.
 * @param value - the name or code.
 * @param query - the trimmed query; empty marks nothing.
 * @returns the runs in order.
 */
export function highlight(value: string, query: string): TextRun[] {
  if (query === '') return [{ text: value, hit: false }]
  const lower = value.toLowerCase()
  const needle = query.toLowerCase()
  const runs: TextRun[] = []
  let from = 0
  for (let at = lower.indexOf(needle); at >= 0; at = lower.indexOf(needle, from)) {
    if (at > from) runs.push({ text: value.slice(from, at), hit: false })
    runs.push({ text: value.slice(at, at + needle.length), hit: true })
    from = at + needle.length
  }
  if (from < value.length) runs.push({ text: value.slice(from), hit: false })
  return runs
}
