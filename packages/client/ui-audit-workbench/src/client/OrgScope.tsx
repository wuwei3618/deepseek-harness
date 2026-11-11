/** One Auditee's organization scope: the organization tree the kickoff exported, with each node's ownership. */
import { useDeferredValue, useMemo, useState } from 'react'
import clsx from 'clsx'
import {
  Button, IconChevronLeftOutlineRegular, IconChevronRightOutlineRegular, IconFolderOpenOutlineRegular, IconRefreshOutlineRegular,
  IconSearchOutlineRegular, Input, Pill, Tag, type TagTone,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { assertNever } from '@deepseek-ai/dsh-util-values'
import type {
  OrgScope, OrgScopeNode, OrgScopeOwnership, OrgScopeProblem, OrgScopeRead, ProjectArchive, ProjectEntry,
} from '@deepseek-ai/dsh-audit-workbench/types'
import type { Load } from './source.ts'
import { Spinner } from './dialogs.tsx'
import { hasScope, text, type Translate } from './format.ts'
import {
  ancestors, childrenOf, descendantsOf, highlight, indexScope, nodeOf, tallyScope, visibleRows, type ScopeFilter, type ScopeIndex,
} from './orgtree.ts'
import { projectNames } from './ProjectDetail.tsx'
import css from './WorkbenchPage.module.css'

/** Most tree rows rendered at once; the person narrows the tree past this. */
const ROW_LIMIT = 200

/** Head props of the organization scope view. */
export interface OrgScopeHeadProps {
  readonly workspaceId: WorkspaceId
  readonly project: ProjectEntry | undefined
  readonly workspaces: WorkspaceSnapshot
  readonly auditee: number
  readonly scope: Load<OrgScopeRead> | undefined
  readonly t: Translate
  readonly onOverview: () => void
  readonly onProject: () => void
  readonly onRefresh: () => void
  readonly onOpenTable: () => void
}

function readScope(scope: Load<OrgScopeRead> | undefined): OrgScope | undefined {
  return scope?.status === 'ready' && scope.value.kind === 'read' ? scope.value.scope : undefined
}

function archiveOf(project: ProjectEntry | undefined): ProjectArchive | undefined {
  return project?.read.kind === 'read' ? project.read.archive : undefined
}

/**
 * Render the head row: the way back to the overview and the project, the Auditee and export time, and the actions.
 * @param props - the project, the Auditee's scope read, copy, and actions.
 * @returns the breadcrumb and head.
 */
export function OrgScopeHead(props: OrgScopeHeadProps) {
  const { t } = props
  const { title } = projectNames(props.workspaceId, props.project, props.workspaces)
  const scope = readScope(props.scope)
  const auditee = archiveOf(props.project)?.auditees[props.auditee]
  const name = scope?.origin.name || auditee?.name || ''
  const parts = [
    name,
    scope === undefined ? '' : t('scope.source'),
    scope === undefined || scope.exportedAt === '' ? '' : t('scope.exportedAt', { time: scope.exportedAt }),
  ].filter(part => part !== '')
  return (
    <>
      <nav className={css.breadcrumb} aria-label={t('title')}>
        <Button size="sm" variant="ghost" icon={<IconChevronLeftOutlineRegular size={16} />} onClick={props.onOverview}>{t('title')}</Button>
        <span className={css.crumbSeparator} aria-hidden="true">›</span>
        <Button size="sm" variant="ghost" onClick={props.onProject}>{title}</Button>
        <span className={css.crumbSeparator} aria-hidden="true">›</span>
        <span className={css.crumbCurrent} aria-current="page">{t('scope.title')}</span>
      </nav>
      <header className={css.head}>
        <div className={css.headText}>
          <h1 className={css.heading}>{t('scope.title')}</h1>
          {parts.length > 0 && <p className={css.subtitle}>{parts.join(t('metaSeparator'))}</p>}
        </div>
        <div className={css.sectionActions}>
          {scope !== undefined && scope.membersTable !== '' && (
            <Button size="sm" variant="outline" icon={<IconFolderOpenOutlineRegular size={16} />} onClick={props.onOpenTable}>{t('scope.openTable')}</Button>
          )}
          <Button size="sm" variant="ghost" icon={<IconRefreshOutlineRegular size={16} />} onClick={props.onRefresh}>{t('refresh')}</Button>
        </div>
      </header>
    </>
  )
}

/** Body props of the organization scope view. */
export interface OrgScopeViewProps {
  readonly project: ProjectEntry | undefined
  readonly loading: boolean
  readonly auditee: number
  readonly scope: Load<OrgScopeRead> | undefined
  /** Result of the last members-table open that failed; absent otherwise. */
  readonly notice: string | undefined
  readonly backfill: boolean
  readonly t: Translate
  readonly onSelectAuditee: (auditee: number) => void
  readonly onRetry: () => void
  readonly onBackfill: () => void
}

/**
 * Render the Auditee switch, then the tree, or why there is none.
 * @param props - the project, the Auditee's scope read, copy, and actions.
 * @returns the view below the head row.
 */
export function OrgScopeView(props: OrgScopeViewProps) {
  const { scope, t } = props
  const archive = archiveOf(props.project)
  if (archive === undefined) return props.loading ? <Spinner /> : <div className={css.notice} role="status">{t('detail.missing')}</div>
  const auditee = archive.auditees[props.auditee]
  if (auditee === undefined) return <div className={css.notice} role="status">{t('scope.auditeeGone')}</div>
  const choices = archive.auditees.flatMap((item, index) => hasScope(item) ? [{ index, name: item.name }] : [])
  return (
    <>
      {choices.length > 1 && (
        <div className={css.scopeTools} role="group" aria-label={t('field.auditees')}>
          {choices.map(choice => (
            <Pill
              key={choice.index}
              active={choice.index === props.auditee}
              aria-pressed={choice.index === props.auditee}
              onClick={() => { props.onSelectAuditee(choice.index) }}
            >
              {text(choice.name, t)}
            </Pill>
          ))}
        </div>
      )}
      {props.notice !== undefined && <div className={css.notice} role="alert">{props.notice}</div>}
      {(scope === undefined || scope.status === 'loading') && <Spinner />}
      {scope?.status === 'error' && (
        <div className={css.notice} role="alert">
          <span>{t('scope.error')}</span>
          <Button size="sm" variant="outline" icon={<IconRefreshOutlineRegular size={16} />} onClick={props.onRetry}>{t('retry')}</Button>
        </div>
      )}
      {scope?.status === 'ready' && scope.value.kind === 'missing' && (
        <section className={css.emptyState} aria-labelledby="audit-workbench-scope-missing">
          <h2 id="audit-workbench-scope-missing" className={css.emptyTitle}>{t('scope.missing.title')}</h2>
          <p className={css.emptyBody}>{t('scope.missing.body')}</p>
          {props.backfill && <Button variant="outline" onClick={props.onBackfill}>{t('project.backfill')}</Button>}
        </section>
      )}
      {scope?.status === 'ready' && scope.value.kind === 'unreadable' && (
        <div className={css.notice} role="alert"><Unreadable read={scope.value} t={t} /></div>
      )}
      {scope?.status === 'ready' && scope.value.kind === 'read' && <ScopeTree key={props.auditee} scope={scope.value.scope} t={t} />}
    </>
  )
}

const FILTERS: readonly { readonly filter: ScopeFilter; readonly key: 'scope.filter.all' | 'scope.filter.in' | 'scope.filter.other' | 'scope.filter.out' | 'scope.filter.conflict' }[] = [
  { filter: 'all', key: 'scope.filter.all' },
  { filter: 'in', key: 'scope.filter.in' },
  { filter: 'other', key: 'scope.filter.other' },
  { filter: 'out', key: 'scope.filter.out' },
  { filter: 'conflict', key: 'scope.filter.conflict' },
]

const MARKS: Readonly<Record<Exclude<OrgScopeOwnership, 'in'>, { readonly tone: TagTone; readonly key: 'mark.other' | 'mark.excluded' | 'mark.unassigned' }>> = {
  other: { tone: 'warning', key: 'mark.other' },
  excluded: { tone: 'neutral', key: 'mark.excluded' },
  unassigned: { tone: 'neutral', key: 'mark.unassigned' },
}

function Unreadable({ read, t }: { readonly read: Extract<OrgScopeRead, { kind: 'unreadable' }>; readonly t: Translate }) {
  switch (read.reason) {
    case 'shape': return <span>{read.message === '' ? t('scope.unreadable.root') : t('scope.unreadable.shape', { field: read.message })}</span>
    case 'origin': return <span>{t('scope.unreadable.origin', { code: read.message })}</span>
    case 'outside':
    case 'io':
    case 'json':
      return (
        <span className={css.fieldLine}>
          {t(`scope.unreadable.${read.reason}`)}
          <span className={css.caption}>{read.message}</span>
        </span>
      )
    /* v8 ignore next -- the reason is a closed union of the five handled reasons. */
    default: return assertNever(read.reason, 'organization scope unreadable reason')
  }
}

function problemText(problem: OrgScopeProblem, t: Translate): string {
  const at = problem.index + 1
  const code = problem.code === '' ? t('scope.problem.noCode') : problem.code
  switch (problem.kind) {
    case 'invalid': return t('scope.problem.invalid', { at, code, field: problem.field === '' ? t('scope.problem.wholeNode') : problem.field })
    case 'duplicate': return t('scope.problem.duplicate', { at, code })
    case 'detached': return t('scope.problem.detached', { at, code, parent: problem.parent })
    /* v8 ignore next -- the problem kind is a closed union of the three handled kinds. */
    default: return assertNever(problem, 'organization scope problem')
  }
}

function Marks({ node, detached, t }: { readonly node: OrgScopeNode; readonly detached: boolean; readonly t: Translate }) {
  return (
    <>
      {node.ownership !== 'in' && <Tag tone={MARKS[node.ownership].tone}>{t(MARKS[node.ownership].key)}</Tag>}
      {node.conflict !== '' && <Tag tone="danger">{t('mark.conflict')}</Tag>}
      {detached && <Tag tone="danger">{t('mark.detached')}</Tag>}
    </>
  )
}

function Runs({ value, query }: { readonly value: string; readonly query: string }) {
  return <>{highlight(value, query).map((run, index) => run.hit ? <mark key={index} className={css.hit}>{run.text}</mark> : run.text)}</>
}

function ScopeTree({ scope, t }: { readonly scope: OrgScope; readonly t: Translate }) {
  const index = useMemo(() => indexScope(scope), [scope])
  const tally = useMemo(() => tallyScope(scope), [scope])
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set([index.root.code]))
  const [chosen, setChosen] = useState(index.root.code)
  const [filter, setFilter] = useState<ScopeFilter>('all')
  const [typed, setTyped] = useState('')
  const query = useDeferredValue(typed.trim())
  const narrowing = query !== '' || filter !== 'all'
  const { rows, truncated } = useMemo(
    () => visibleRows(index, { expanded, filter, query, limit: ROW_LIMIT }),
    [index, expanded, filter, query],
  )
  // A refreshed scope may no longer hold the chosen node; the starting node stands in for it.
  const selected = index.byCode.get(chosen) ?? index.root
  const reveal = (code: string): void => {
    setChosen(code)
    setExpanded(current => new Set([...current, ...ancestors(index, code), code]))
  }
  const toggle = (code: string): void => {
    setExpanded((current) => {
      const next = new Set(current)
      if (!next.delete(code)) next.add(code)
      return next
    })
  }
  const choose = (code: string): void => {
    setChosen(code)
    if (!narrowing && childrenOf(index, code).length > 0) setExpanded(current => new Set([...current, code]))
  }
  const expandLevel = (): void => {
    setExpanded((current) => {
      const next = [...current].flatMap(code => childrenOf(index, code).filter(child => index.children.has(child)))
      return new Set([...current, ...next])
    })
  }
  const count = (value: number): string => value.toLocaleString()
  return (
    <>
      <div className={css.scopeTools} role="group" aria-label={t('scope.filterLabel')}>
        {FILTERS.map(item => (
          <Pill
            key={item.filter}
            active={filter === item.filter}
            aria-pressed={filter === item.filter}
            onClick={() => { setFilter(filter === item.filter ? 'all' : item.filter) }}
          >
            {t(item.key)}
            {' '}
            <span className={css.chipCount}>{count(tally[item.filter])}</span>
          </Pill>
        ))}
        <Pill>
          {t('scope.profitCenters')}
          {' '}
          <span className={css.chipCount}>{count(tally.profitCenters)}</span>
        </Pill>
      </div>
      <div className={css.scopeTools}>
        <Input
          className={css.scopeSearch as string}
          type="search"
          icon={<IconSearchOutlineRegular size={16} />}
          value={typed}
          placeholder={t('scope.search')}
          aria-label={t('scope.search')}
          autoComplete="off"
          onChange={(event) => { setTyped(event.target.value) }}
        />
        <Button size="sm" variant="ghost" disabled={narrowing} onClick={expandLevel}>{t('scope.expandLevel')}</Button>
        <Button size="sm" variant="ghost" disabled={narrowing} onClick={() => { setExpanded(new Set([index.root.code])) }}>{t('scope.collapseAll')}</Button>
      </div>
      {scope.problems.length > 0 && (
        <details className={css.problems}>
          <summary>{t('scope.problems', { n: count(scope.problems.length) })}</summary>
          <ul>{scope.problems.map(problem => <li key={problem.index}>{problemText(problem, t)}</li>)}</ul>
        </details>
      )}
      <div className={css.scopePanes}>
        <section className={clsx(css.card, css.treeCard)} aria-label={t('scope.tree')}>
          {rows.length === 0
            ? <p className={css.treeEmpty}>{t('scope.noMatch')}</p>
            : (
              <ul className={css.tree}>
                {rows.map(row => (
                  <li key={row.node.code} className={css.treeRow} style={{ paddingInlineStart: `${row.depth * 18 + 4}px` }}>
                    {row.expandable
                      ? (
                        <button
                          type="button"
                          className={css.twisty}
                          data-expanded={row.expanded}
                          aria-expanded={row.expanded}
                          aria-label={t(row.expanded ? 'scope.collapse' : 'scope.expand', { name: row.node.name })}
                          disabled={narrowing}
                          onClick={() => { toggle(row.node.code) }}
                        >
                          <IconChevronRightOutlineRegular size={14} />
                        </button>
                      )
                      : <span className={css.twisty} aria-hidden="true" />}
                    <button
                      type="button"
                      className={css.treeItem}
                      aria-current={row.node.code === selected.code ? 'true' : undefined}
                      onClick={() => { choose(row.node.code) }}
                    >
                      <span className={clsx(css.treeName, row.node.ownership !== 'in' && css.treeOut)}><Runs value={text(row.node.name, t)} query={query} /></span>
                      <span className={css.treeCode}><Runs value={row.node.code} query={query} /></span>
                      {row.expandable && !row.expanded && <span className={css.caption}>{t('scope.descendants', { n: count(descendantsOf(index, row.node.code)) })}</span>}
                      <span className={css.treeMarks}><Marks node={row.node} detached={index.detached.has(row.node.code)} t={t} /></span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          {truncated && <p className={css.caption}>{t('scope.truncated', { limit: ROW_LIMIT })}</p>}
        </section>
        <NodeDetail index={index} node={selected} t={t} onReveal={reveal} />
      </div>
      <div className={css.legend}>
        <span>{t('legend.title')}</span>
        <span><Tag tone="warning">{t('mark.other')}</Tag> {t('legend.other')}</span>
        <span><Tag tone="neutral">{t('mark.excluded')}</Tag> {t('legend.excluded')}</span>
        <span><Tag tone="neutral">{t('mark.unassigned')}</Tag> {t('legend.unassigned')}</span>
        <span><Tag tone="danger">{t('mark.conflict')}</Tag> {t('legend.conflict')}</span>
        {index.detached.size > 0 && <span><Tag tone="danger">{t('mark.detached')}</Tag> {t('legend.detached')}</span>}
      </div>
    </>
  )
}

const VERDICTS: Readonly<Record<OrgScopeOwnership, 'verdict.in' | 'verdict.other' | 'verdict.excluded' | 'verdict.unassigned'>> = {
  in: 'verdict.in', other: 'verdict.other', excluded: 'verdict.excluded', unassigned: 'verdict.unassigned',
}

/** A node of the starting node's own second-level unit that another of its nodes manages reads differently from one owned elsewhere. */
function verdict(index: ScopeIndex, node: OrgScopeNode, t: Translate): string {
  if (node.ownership === 'other' && node.unit !== '' && node.unit === index.root.unit) {
    return t('verdict.otherSameUnit', { unit: node.unit, root: text(index.root.name, t) })
  }
  return t(VERDICTS[node.ownership], { unit: node.unit === '' ? t('verdict.otherUnit') : node.unit })
}

function NodeDetail({ index, node, t, onReveal }: {
  readonly index: ScopeIndex
  readonly node: OrgScopeNode
  readonly t: Translate
  readonly onReveal: (code: string) => void
}) {
  const children = childrenOf(index, node.code).length
  const chain = ancestors(index, node.code)
  const recorded = index.detached.get(node.code)
  return (
    <aside className={clsx(css.card, css.nodeCard)} aria-label={t('scope.node')} aria-live="polite">
      <div>
        {chain.length > 0 && (
          <div className={css.nodePath}>
            {chain.map(code => (
              <span key={code} className={css.nodePathPart}>
                <button type="button" className={css.nodePathLink} onClick={() => { onReveal(code) }}>{text(nodeOf(index, code).name, t)}</button>
                <span aria-hidden="true">›</span>
              </span>
            ))}
          </div>
        )}
        <h2 className={css.nodeHeading}>{text(node.name, t)}</h2>
      </div>
      <div className={css.verdict} data-ownership={node.ownership}>
        {verdict(index, node, t)}
        {node.note !== '' && <span className={css.fieldLine}>{node.note}</span>}
      </div>
      {node.conflict !== '' && <div className={css.verdict} data-ownership="conflict">{t('verdict.conflict', { text: node.conflict })}</div>}
      {recorded !== undefined && <div className={css.verdict} data-ownership="conflict">{t('verdict.detached', { parent: recorded })}</div>}
      <dl className={css.fields}>
        <dt>{t('node.code')}</dt>
        <dd className={css.treeCode}>{node.code}</dd>
        <dt>{t('node.unit')}</dt>
        <dd>{text(node.unit, t)}</dd>
        <dt>{t('node.source')}</dt>
        <dd>{text(node.source, t)}</dd>
        <dt>{t('node.children')}</dt>
        <dd>{children === 0 ? t('node.none') : t('node.childCount', { n: children, all: descendantsOf(index, node.code) })}</dd>
        <dt>{t('node.profitCenters')}</dt>
        <dd>
          {node.profitCenters.length === 0
            ? t('node.none')
            : <span className={css.codeList}>{node.profitCenters.map(code => <span key={code}>{code}</span>)}</span>}
        </dd>
      </dl>
      <p className={css.caption}>{t('scope.readOnly')}</p>
    </aside>
  )
}
