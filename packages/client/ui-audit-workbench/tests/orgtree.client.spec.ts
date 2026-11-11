import { describe, expect, it } from 'vitest'
import { ancestors, childrenOf, descendantsOf, highlight, indexScope, tallyScope, visibleRows, type ScopeFilter } from '../src/client/orgtree.ts'
import { groupFocus, newestChanges, shortDate } from '../src/client/format.ts'
import { node, ORG_SCOPE } from './fixtures.ts'

const index = indexScope(ORG_SCOPE)
const codes = (view: { expanded?: string[]; filter?: ScopeFilter; query?: string; limit?: number }) => {
  const result = visibleRows(index, { expanded: new Set(view.expanded ?? []), filter: view.filter ?? 'all', query: view.query ?? '', limit: view.limit ?? 200 })
  return { rows: result.rows.map(row => `${'·'.repeat(row.depth)}${row.node.code}${row.hit ? '*' : ''}${row.expandable ? (row.expanded ? '-' : '+') : ''}`), truncated: result.truncated }
}

describe('organization tree', () => {
  it('indexes children in file order and counts all descendants', () => {
    expect(index.root.code).toBe('C001')
    expect(index.tops).toEqual(['C001'])
    expect(index.detached.size).toBe(0)
    expect(index.children.get('C001')).toEqual(['C002', 'C005', 'C006'])
    expect(Object.fromEntries(index.descendants)).toEqual({ C001: 6, C002: 2, C003: 0, C004: 0, C005: 0, C006: 1, C007: 0 })
    expect(ancestors(index, 'C004')).toEqual(['C001', 'C002'])
    expect(ancestors(index, 'C001')).toEqual([])
    expect(childrenOf(index, 'C003')).toEqual([])
    expect(childrenOf(index, 'gone')).toEqual([])
    expect(descendantsOf(index, 'C002')).toBe(2)
    expect(descendantsOf(index, 'gone')).toBe(0)
  })

  it('tallies each filter and the profit centers inside the scope', () => {
    expect(tallyScope(ORG_SCOPE)).toEqual({ all: 7, in: 3, other: 2, out: 2, conflict: 1, profitCenters: 3 })
  })

  it('shows only expanded branches without a filter or query', () => {
    expect(codes({})).toEqual({ rows: ['C001+'], truncated: false })
    expect(codes({ expanded: ['C001', 'C002'] }).rows).toEqual(['C001-', '·C002-', '··C003', '··C004', '·C005', '·C006+'])
    expect(codes({ expanded: ['C001', 'C002'], limit: 3 })).toEqual({ rows: ['C001-', '·C002-', '··C003'], truncated: true })
  })

  it('shows matching nodes with their ancestors, expanded, for a filter or a query', () => {
    expect(codes({ filter: 'other' }).rows).toEqual(['C001-', '·C002-', '··C004*', '·C006-', '··C007*'])
    expect(codes({ filter: 'out' }).rows).toEqual(['C001-', '·C005*', '·C006*'])
    expect(codes({ filter: 'conflict' }).rows).toEqual(['C001-', '·C002-', '··C004*'])
    expect(codes({ filter: 'in', query: 'c003' }).rows).toEqual(['C001-', '·C002-', '··C003*'])
    expect(codes({ query: '分公司' }).rows).toEqual(['C001-', '·C002*'])
    expect(codes({ query: '示例公司' }).rows).toEqual(['C001*'])
    expect(codes({ query: '无此单位' })).toEqual({ rows: [], truncated: false })
  })

  it('walks every top-level node in file order and keeps where a lifted node was recorded', () => {
    const tops = indexScope({ ...ORG_SCOPE, nodes: [node('R', ''), node('A', 'R'), node('T', ''), node('U', 'T')], problems: [{ kind: 'detached', index: 2, code: 'T', parent: 'Z' }] })
    expect(tops.tops).toEqual(['R', 'T'])
    expect(tops.detached).toEqual(new Map([['T', 'Z']]))
    expect(ancestors(tops, 'U')).toEqual(['T'])
    const rows = (query: string) => visibleRows(tops, { expanded: new Set(['R']), filter: 'all', query, limit: 10 }).rows.map(row => row.node.code)
    expect(rows('')).toEqual(['R', 'A', 'T'])
    expect(rows('u')).toEqual(['T', 'U'])
  })

  it('marks each case-insensitive match of the query', () => {
    expect(highlight('Ab-ab', '')).toEqual([{ text: 'Ab-ab', hit: false }])
    expect(highlight('Ab-ab', 'AB')).toEqual([{ text: 'Ab', hit: true }, { text: '-', hit: false }, { text: 'ab', hit: true }])
    expect(highlight('xaby', 'ab')).toEqual([{ text: 'x', hit: false }, { text: 'ab', hit: true }, { text: 'y', hit: false }])
  })

  it('reads a scope of one node', () => {
    const single = indexScope({ ...ORG_SCOPE, nodes: [node('R', '')] })
    expect(visibleRows(single, { expanded: new Set(), filter: 'all', query: '', limit: 1 })).toMatchObject({ rows: [{ expandable: false, expanded: false }], truncated: false })
  })
})

describe('archive lists', () => {
  it('groups focus items by section in first-seen order and keeps their numbers', () => {
    expect(groupFocus([
      { content: 'a', section: '财务' }, { content: 'b', section: '' }, { content: 'c', section: '财务' },
    ])).toEqual([
      { section: '财务', items: [{ no: 1, content: 'a' }, { no: 3, content: 'c' }] },
      { section: '', items: [{ no: 2, content: 'b' }] },
    ])
  })

  it('orders changes newest first and puts the later-written of two equal dates first', () => {
    const changes = [
      { date: '2026-11-09 23:20', what: 'a', basis: '' },
      { date: '2026-11-09 23:19', what: 'b', basis: '' },
      { date: '2026-11-10 10:00', what: 'c', basis: '' },
      { date: '2026-11-09 23:20', what: 'd', basis: '' },
    ]
    expect(newestChanges(changes).map(change => `${change.what}${change.index}`)).toEqual(['c2', 'd3', 'a0', 'b1'])
  })

  it('drops the year of a recorded date', () => {
    expect(shortDate('2026-11-09 23:15')).toBe('11-09 23:15')
    expect(shortDate('上周')).toBe('上周')
  })
})
