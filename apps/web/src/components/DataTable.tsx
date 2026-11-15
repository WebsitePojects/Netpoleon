import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  Search,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/auth.js';
import { WmsError } from '../data/store.js';
import { downloadCsv } from '../lib/csv.js';
import { Select, SkTable, type SelectOption } from './controls.js';
import { Button, Empty, TableFoot } from './ui.js';

type SortValue = string | number | null;
type CsvCell = string | number;

export interface Column<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** What the column sorts by. A column without it cannot be sorted. */
  sort?: (row: T) => SortValue;
  align?: 'right';
  /** Class of the body cells, such as `mono` or `num`. */
  className?: string | ((row: T) => string);
  /** Label shown beside the value on phones. Defaults to the header; '' hides it. */
  label?: string;
  /** Placeholder shape while loading: a text width in pixels, or a named block. */
  skeleton?: number | 'thumb' | 'chip';
  /** Share of the table width, as a CSS grid track. Used by the loading placeholder. */
  width?: string;
}

export interface TableFilter<T> {
  /** Also the name of the URL parameter when the table keeps its state in the address. */
  id: string;
  label: string;
  allLabel: string;
  options: SelectOption[];
  test: (row: T, value: string) => boolean;
}

export interface BatchAction<T> {
  label: string;
  icon?: LucideIcon;
  danger?: boolean;
  /** `clear` empties the selection; call it once the action has gone through. */
  run: (rows: T[], clear: () => void) => void;
}

export interface TableExport<T> {
  /** File name without the date and extension. */
  name: string;
  header: string[];
  row: (row: T) => CsvCell[];
  /** Remote tables only hold one page; this fetches every matching row for the export. */
  all?: () => Promise<T[]>;
}

/**
 * Server-side mode: `rows` is the page the server returned for the current search, filters
 * and sort (which the table keeps in the address, where the page reads them). The table does
 * no filtering, sorting or slicing of its own, and pages forward and back by cursor.
 */
export interface RemotePaging {
  total: number;
  page: number;
  hasNext: boolean;
  onPage: (page: number) => void;
  /** True while a newer page is loading; the current rows stay on screen, dimmed. */
  refreshing?: boolean;
}

interface TableState {
  q: string;
  page: number;
  /** Column id, prefixed with `-` for descending. Empty keeps the order the rows came in. */
  sort: string;
  filters: Record<string, string>;
}

type Changes = Record<string, string>;

/**
 * Search, filters, sort and page of one table. With `syncUrl` they live in the address, so
 * a filtered list can be bookmarked and survives Back; otherwise in component state.
 */
function useTableState(syncUrl: boolean, filterIds: string[]): [TableState, (c: Changes) => void] {
  const [params, setParams] = useSearchParams();
  const [local, setLocal] = useState<Changes>({});

  const read = (key: string) => (syncUrl ? (params.get(key) ?? '') : (local[key] ?? ''));
  const state: TableState = {
    q: read('q'),
    page: Math.max(1, Number(read('page')) || 1),
    sort: read('sort'),
    filters: Object.fromEntries(filterIds.map((id) => [id, read(id)])),
  };

  const change = (changes: Changes) => {
    // Anything but a page change alters the row set, so it starts again at page one.
    const full = 'page' in changes ? changes : { ...changes, page: '' };
    if (!syncUrl) {
      setLocal((previous) => ({ ...previous, ...full }));
      return;
    }
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(full)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace: true },
    );
  };
  return [state, change];
}

function compare(a: SortValue, b: SortValue): number {
  if (a === b) return 0;
  // Blanks go last whichever way the column is sorted; the caller flips only real values.
  if (a === null || a === '') return 1;
  if (b === null || b === '') return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function SelectBox({
  checked,
  partial = false,
  label,
  onChange,
}: {
  checked: boolean;
  partial?: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (box.current) box.current.indeterminate = partial && !checked;
  }, [partial, checked]);
  return (
    <label className="check check-solo" onClick={(event) => event.stopPropagation()}>
      <input
        ref={box}
        type="checkbox"
        checked={checked}
        aria-label={label}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

const DEFAULT_PAGE_SIZE = 10;

/**
 * The one table of the console. Every list gets the same tools from it: search, filters,
 * sortable columns, row selection with batch actions, CSV export, paging, a loading
 * placeholder with the real column widths, and stacked rows on phones.
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  noun,
  search,
  filters = [],
  batchActions = [],
  exportCsv,
  pageSize = DEFAULT_PAGE_SIZE,
  loading = false,
  syncUrl = false,
  onRowClick,
  rowClass,
  rowLabel,
  empty,
  remote,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** Plural name of the rows, for the footer count: "demo units", "transactions". */
  noun: string;
  search?: { placeholder: string; text: (row: T) => string };
  filters?: TableFilter<T>[];
  batchActions?: BatchAction<T>[];
  exportCsv?: TableExport<T>;
  pageSize?: number;
  loading?: boolean;
  syncUrl?: boolean;
  onRowClick?: (row: T) => void;
  rowClass?: (row: T) => string | undefined;
  /** Names a row for its checkbox, for screen readers. Defaults to the row key. */
  rowLabel?: (row: T) => string;
  /** Shown when the table has no rows at all, before any search or filter. */
  empty?: { title: string; body?: ReactNode; icon?: LucideIcon };
  remote?: RemotePaging;
}) {
  const { can } = useAuth();
  const [state, change] = useTableState(
    syncUrl,
    filters.map((filter) => filter.id),
  );
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  // Remote rows come and go with the page, so the chosen rows themselves are kept.
  const [picked, setPicked] = useState<ReadonlyMap<string, T>>(new Map());

  const mayExport = exportCsv !== undefined && can('reports.export');
  const selectable = mayExport || batchActions.length > 0;
  const descending = state.sort.startsWith('-');
  const sortId = descending ? state.sort.slice(1) : state.sort;
  const sortColumn = columns.find((column) => column.id === sortId && column.sort);
  const narrowed = state.q.trim() !== '' || Object.values(state.filters).some(Boolean);

  const matching = useMemo(() => {
    if (remote) return rows;
    const terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
    const active = filters.filter((filter) => state.filters[filter.id]);
    let result = rows.filter((row) => {
      for (const filter of active) {
        if (!filter.test(row, state.filters[filter.id] ?? '')) return false;
      }
      if (terms.length === 0 || !search) return true;
      const text = search.text(row).toLowerCase();
      return terms.every((term) => text.includes(term));
    });
    const by = sortColumn?.sort;
    if (by) {
      const direction = descending ? -1 : 1;
      result = [...result].sort((a, b) => {
        const left = by(a);
        const right = by(b);
        const blank = (value: SortValue) => value === null || value === '';
        return blank(left) || blank(right)
          ? compare(left, right)
          : direction * compare(left, right);
      });
    }
    return result;
    // The filter and search callbacks are rebuilt by the page on every render; the values
    // they read are covered by `rows` and the table state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, state.q, JSON.stringify(state.filters), sortColumn?.id, descending, remote]);

  const pageCount = Math.max(1, Math.ceil(matching.length / pageSize));
  const page = remote ? remote.page : Math.min(state.page, pageCount);
  const visible = remote ? rows : matching.slice((page - 1) * pageSize, page * pageSize);

  // Rows can leave the list under a selection (a batch action, a filter); count what is left.
  const chosen = remote
    ? [...picked.values()]
    : matching.filter((row) => selected.has(rowKey(row)));
  const visibleChosen = visible.filter((row) => selected.has(rowKey(row))).length;
  const clear = () => {
    setSelected(new Set());
    setPicked(new Map());
  };

  const toggle = (keys: string[], on: boolean) => {
    const next = new Set(selected);
    for (const key of keys) {
      if (on) next.add(key);
      else next.delete(key);
    }
    setSelected(next);
    if (remote) {
      const byKey = new Map(rows.map((row) => [rowKey(row), row]));
      const nextPicked = new Map(picked);
      for (const key of keys) {
        const row = byKey.get(key);
        if (on && row) nextPicked.set(key, row);
        else nextPicked.delete(key);
      }
      setPicked(nextPicked);
    }
  };

  const cycleSort = (id: string) => {
    // First press ascending, second descending, third back to the original order.
    const next = sortId !== id ? id : descending ? '' : `-${id}`;
    change({ sort: next });
  };

  const [exporting, setExporting] = useState(false);
  const exportMatching = async () => {
    if (!remote || !exportCsv?.all) {
      download(matching);
      return;
    }
    setExporting(true);
    try {
      download(await exportCsv.all());
    } finally {
      setExporting(false);
    }
  };

  const download = (list: T[]) => {
    if (!exportCsv) return;
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`${exportCsv.name}-${stamp}.csv`, exportCsv.header, list.map(exportCsv.row));
  };

  const sortable = columns.filter((column) => column.sort);
  const template = [
    ...(selectable ? ['44px'] : []),
    ...columns.map((column) => column.width ?? '1fr'),
  ].join(' ');
  const hasToolbar = search !== undefined || filters.length > 0 || mayExport || sortable.length > 0;

  return (
    <div className="dt">
      {hasToolbar && (
        <div className="toolbar">
          {search && (
            <label className="input-wrap">
              <span className="sr-only">Search {noun}</span>
              <Search aria-hidden="true" />
              <input
                className="input"
                type="search"
                placeholder={search.placeholder}
                value={state.q}
                onChange={(event) => change({ q: event.target.value })}
              />
              {state.q && (
                <button
                  type="button"
                  className="icon-btn input-clear"
                  aria-label="Clear search"
                  onClick={() => change({ q: '' })}
                >
                  <X aria-hidden="true" />
                </button>
              )}
            </label>
          )}
          {filters.map((filter) => (
            <Select
              key={filter.id}
              ariaLabel={filter.label}
              value={state.filters[filter.id] ?? ''}
              onChange={(value) => change({ [filter.id]: value })}
              options={[{ value: '', label: filter.allLabel }, ...filter.options]}
            />
          ))}
          {sortable.length > 0 && (
            // Phones have no column headers to press, so sorting is offered as a list.
            <span className="dt-sort-select">
              <Select
                ariaLabel="Sort by"
                value={sortColumn ? state.sort : ''}
                onChange={(value) => change({ sort: value })}
                options={[
                  { value: '', label: 'Default order' },
                  ...sortable.flatMap((column) => [
                    { value: column.id, label: `${column.header} ↑` },
                    { value: `-${column.id}`, label: `${column.header} ↓` },
                  ]),
                ]}
              />
            </span>
          )}
          {mayExport && (
            <Button
              icon={Download}
              disabled={matching.length === 0}
              pending={exporting}
              onClick={() => void exportMatching()}
            >
              Export CSV
            </Button>
          )}
        </div>
      )}

      {selectable && (
        <div className="batch" data-open={chosen.length > 0} inert={chosen.length === 0}>
          <div className="batch-inner">
            <div className="batch-bar" role="region" aria-label="Selected rows">
              <span className="batch-count num" aria-live="polite">
                <b>{chosen.length}</b> selected
              </span>
              {!remote && chosen.length < matching.length && (
                <button
                  type="button"
                  className="link"
                  onClick={() => toggle(matching.map(rowKey), true)}
                >
                  Select all {matching.length}
                </button>
              )}
              <span className="batch-actions">
                {batchActions.map((action) => (
                  <Button
                    key={action.label}
                    size="sm"
                    {...(action.icon ? { icon: action.icon } : {})}
                    variant={action.danger ? 'danger' : 'default'}
                    onClick={() => action.run(chosen, clear)}
                  >
                    {action.label}
                  </Button>
                ))}
                {mayExport && (
                  <Button size="sm" icon={Download} onClick={() => download(chosen)}>
                    Export selected
                  </Button>
                )}
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Clear selection"
                  onClick={clear}
                >
                  <X aria-hidden="true" />
                </button>
              </span>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <SkTable
          template={template}
          cells={[
            ...(selectable ? (['box'] as const) : []),
            ...columns.map((column) => column.skeleton ?? 120),
          ]}
          rows={Math.min(pageSize, 8)}
        />
      ) : visible.length === 0 && !remote?.refreshing ? (
        narrowed || !empty ? (
          <Empty title={`No ${noun} match`}>
            Change the search or{' '}
            <button
              type="button"
              className="link"
              onClick={() =>
                change({ q: '', ...Object.fromEntries(filters.map((filter) => [filter.id, ''])) })
              }
            >
              clear all filters
            </button>
            .
          </Empty>
        ) : (
          <Empty title={empty.title} {...(empty.icon ? { icon: empty.icon } : {})}>
            {empty.body}
          </Empty>
        )
      ) : (
        <table
          className={selectable ? 'table has-select' : 'table'}
          data-refreshing={remote?.refreshing ? 'true' : undefined}
          aria-busy={remote?.refreshing ?? false}
        >
          <thead>
            <tr>
              {selectable && (
                <th className="th-select">
                  <SelectBox
                    label={`Select all ${noun} on this page`}
                    checked={visibleChosen === visible.length}
                    partial={visibleChosen > 0}
                    onChange={(on) => toggle(visible.map(rowKey), on)}
                  />
                </th>
              )}
              {columns.map((column) => {
                const active = sortColumn?.id === column.id;
                const classes = column.align === 'right' ? 'right' : undefined;
                if (!column.sort) {
                  return (
                    <th key={column.id} className={classes}>
                      {column.header}
                    </th>
                  );
                }
                return (
                  <th
                    key={column.id}
                    className={classes}
                    aria-sort={active ? (descending ? 'descending' : 'ascending') : 'none'}
                  >
                    <button
                      type="button"
                      className="th-sort"
                      data-dir={active ? (descending ? 'desc' : 'asc') : undefined}
                      onClick={() => cycleSort(column.id)}
                    >
                      {column.header}
                      <span className="th-arrows" aria-hidden="true">
                        <ChevronUp />
                        <ChevronDown />
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          {/* Keyed by the view, so a new sort, filter or page fades in as one step. */}
          <tbody key={`${state.sort}|${page}|${state.q}|${JSON.stringify(state.filters)}`}>
            {visible.map((row) => {
              const key = rowKey(row);
              const isSelected = selected.has(key);
              const classes = [
                onRowClick ? 'clickable' : '',
                isSelected ? 'is-selected' : '',
                rowClass?.(row) ?? '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <tr
                  key={key}
                  className={classes || undefined}
                  {...(onRowClick ? { onClick: () => onRowClick(row) } : {})}
                >
                  {selectable && (
                    <td className="td-select" data-label="">
                      <SelectBox
                        label={`Select ${rowLabel?.(row) ?? key}`}
                        checked={isSelected}
                        onChange={(on) => toggle([key], on)}
                      />
                    </td>
                  )}
                  {columns.map((column, index) => {
                    const own =
                      typeof column.className === 'function'
                        ? column.className(row)
                        : (column.className ?? '');
                    const cellClass = [
                      index === 0 ? 'td-lead' : '',
                      column.align === 'right' ? 'right' : '',
                      own,
                    ]
                      .filter(Boolean)
                      .join(' ');
                    return (
                      <td
                        key={column.id}
                        data-label={column.label ?? column.header}
                        className={cellClass || undefined}
                      >
                        {column.cell(row)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {remote ? (
        <RemoteFoot remote={remote} shown={visible.length} pageSize={pageSize} noun={noun} />
      ) : (
        <TableFoot
          page={page}
          pageSize={pageSize}
          total={matching.length}
          noun={noun}
          onPage={(next) => change({ page: next === 1 ? '' : String(next) })}
        />
      )}
    </div>
  );
}

/** Footer for server-side paging: the count, and back and forward by cursor. */
function RemoteFoot({
  remote,
  shown,
  pageSize,
  noun,
}: {
  remote: RemotePaging;
  shown: number;
  pageSize: number;
  noun: string;
}) {
  const first = shown === 0 ? 0 : (remote.page - 1) * pageSize + 1;
  const last = (remote.page - 1) * pageSize + shown;
  return (
    <div className="table-foot">
      <span className="num">
        Showing {first} to {last} of {remote.total} {noun}
      </span>
      {(remote.page > 1 || remote.hasNext) && (
        <nav className="pager" aria-label="Pages">
          <button
            type="button"
            disabled={remote.page === 1 || remote.refreshing}
            onClick={() => remote.onPage(remote.page - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <button type="button" className="num" aria-current="page">
            {remote.page}
          </button>
          <button
            type="button"
            disabled={!remote.hasNext || remote.refreshing}
            onClick={() => remote.onPage(remote.page + 1)}
            aria-label="Next page"
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </nav>
      )}
    </div>
  );
}

/**
 * Runs one store call per selected row and reports how many went through. A row the store
 * refuses (wrong status, already there) is skipped; the first refusal is quoted so the
 * user knows why the count is short.
 */
export function runBatch<T>(rows: T[], each: (row: T) => void): { done: number; refused: string } {
  let done = 0;
  let refused = '';
  for (const row of rows) {
    try {
      each(row);
      done += 1;
    } catch (error) {
      if (!(error instanceof WmsError)) throw error;
      if (!refused) refused = error.message;
    }
  }
  return { done, refused };
}
