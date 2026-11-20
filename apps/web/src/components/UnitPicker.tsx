import { ASSET_CODE_PATTERN, ASSET_STATUSES, type AssetStatus, type Unit } from '@wms/contracts';
import { ScanLine, X } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { apiGet } from '../api/client.js';
import { useDebounced, useUnits, type Paged } from '../api/queries.js';
import { useReference } from '../auth/auth.js';
import { STATUS_LABELS } from '../lib/labels.js';
import { Select } from './controls.js';
import { Button, CategoryThumb, Dialog, Empty, StatusChip, TableFoot, useToast } from './ui.js';

const PAGE_SIZE = 10;

/**
 * Finds units without typing codes: search by code, serial or model, filter by category, shelf
 * and status, tick the ones you want. A scanner works too: scan into the search box and press
 * Enter to add that unit at once. Units already chosen are shown ticked and locked.
 */
export function UnitPickerDialog({
  title = 'Choose units',
  already,
  limit,
  onAdd,
  onClose,
}: {
  title?: string;
  already: readonly string[];
  /** How many more units may be added. */
  limit: number;
  onAdd: (codes: string[]) => void;
  onClose: () => void;
}) {
  const { categories, locations } = useReference();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [chosen, setChosen] = useState<string[]>([]);
  const term = useDebounced(q.trim());

  const list = useUnits({
    q: term || undefined,
    category: category || undefined,
    location: location || undefined,
    status: status || undefined,
    page,
    pageSize: PAGE_SIZE,
    sort: 'code',
    order: 'asc',
  });
  const rows = list.data?.items ?? [];
  const room = limit - chosen.length;
  const isOn = (code: string) => already.includes(code);
  const isChosen = (code: string) => chosen.includes(code);
  const pickable = rows.filter((unit) => !isOn(unit.code));
  const allOnPage = pickable.length > 0 && pickable.every((unit) => isChosen(unit.code));

  const toggle = (code: string) => {
    if (isChosen(code)) setChosen(chosen.filter((item) => item !== code));
    else if (room > 0) setChosen([...chosen, code]);
    else toast(`No room for more units on this sheet`, 'error');
  };

  const togglePage = () => {
    if (allOnPage) {
      setChosen(chosen.filter((code) => !pickable.some((unit) => unit.code === code)));
      return;
    }
    const add = pickable.map((unit) => unit.code).filter((code) => !isChosen(code));
    if (add.length > room)
      toast(`Only ${room} more unit${room === 1 ? '' : 's'} fit on this sheet`, 'error');
    setChosen([...chosen, ...add.slice(0, Math.max(room, 0))]);
  };

  /** A scanned label ends with Enter: add that exact unit straight away. */
  const onKeyDown = async (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const code = q.trim().toUpperCase();
    if (!ASSET_CODE_PATTERN.test(code)) return;
    if (isOn(code) || isChosen(code)) {
      setQ('');
      return;
    }
    const found = await apiGet<Paged<Unit>>('/units', { codes: code, page: 1, pageSize: 1 });
    if (found.items.length === 0) {
      toast(`No current unit has the code ${code}`, 'error');
      return;
    }
    if (room <= 0) {
      toast('No room for more units on this sheet', 'error');
      return;
    }
    setChosen([...chosen, code]);
    setQ('');
  };

  const shelves = locations.filter((item) => item.kind === 'shelf');
  const reset = () => setPage(1);

  return (
    <Dialog
      title={title}
      description="Search, filter and tick the units. Scanning a label adds it at once."
      width={820}
      onClose={onClose}
      footer={
        <>
          <span className="muted" style={{ marginRight: 'auto' }}>
            {chosen.length} selected
          </span>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={chosen.length === 0}
            onClick={() => {
              onAdd(chosen);
              onClose();
            }}
          >
            {chosen.length > 0
              ? `Add ${chosen.length} unit${chosen.length === 1 ? '' : 's'}`
              : 'Add units'}
          </Button>
        </>
      }
    >
      <div className="picker">
        <div className="picker-tools">
          <label className="input-wrap picker-search">
            <span className="sr-only">Search units</span>
            <ScanLine aria-hidden="true" />
            <input
              className="input"
              data-autofocus
              value={q}
              placeholder="Search or scan: asset code, serial or model"
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                setQ(event.target.value);
                reset();
              }}
              onKeyDown={(event) => void onKeyDown(event)}
            />
            {q && (
              <button
                type="button"
                className="icon-btn input-clear"
                aria-label="Clear search"
                onClick={() => setQ('')}
              >
                <X aria-hidden="true" />
              </button>
            )}
          </label>
          <Select
            ariaLabel="Category"
            value={category}
            onChange={(value) => {
              setCategory(value);
              reset();
            }}
            options={[
              { value: '', label: 'All categories' },
              ...categories.map((c) => ({ value: c.code, label: c.name })),
            ]}
          />
          <Select
            ariaLabel="Shelf"
            value={location}
            onChange={(value) => {
              setLocation(value);
              reset();
            }}
            options={[
              { value: '', label: 'All shelves' },
              ...shelves.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
          <Select
            ariaLabel="Status"
            value={status}
            onChange={(value) => {
              setStatus(value);
              reset();
            }}
            options={[
              { value: '', label: 'Any status' },
              ...ASSET_STATUSES.filter((s) => !['lost', 'retired', 'registered'].includes(s)).map(
                (s: AssetStatus) => ({ value: s, label: STATUS_LABELS[s] }),
              ),
            ]}
          />
        </div>

        <div className="picker-table">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input
                    type="checkbox"
                    aria-label="Select every unit on this page"
                    checked={allOnPage}
                    disabled={pickable.length === 0}
                    onChange={togglePage}
                  />
                </th>
                <th>Asset code</th>
                <th>Brand / model</th>
                <th>Serial</th>
                <th>Location</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((unit) => {
                const on = isOn(unit.code);
                return (
                  <tr
                    key={unit.code}
                    className={on ? 'is-on' : isChosen(unit.code) ? 'is-chosen' : undefined}
                    onClick={() => !on && toggle(unit.code)}
                  >
                    <td data-label="">
                      <input
                        type="checkbox"
                        aria-label={`Choose ${unit.code}`}
                        checked={on || isChosen(unit.code)}
                        disabled={on}
                        onClick={(event) => event.stopPropagation()}
                        onChange={() => toggle(unit.code)}
                      />
                    </td>
                    <td data-label="Asset code">
                      <span className="unit-cell">
                        <CategoryThumb unit={unit} />
                        <span className="mono cell-main">{unit.code}</span>
                      </span>
                    </td>
                    <td data-label="Brand / model">
                      {unit.brand} {unit.model}
                    </td>
                    <td data-label="Serial" className="mono">
                      {unit.serial}
                    </td>
                    <td data-label="Location">{unit.location?.name ?? '—'}</td>
                    <td data-label="Status">
                      {on ? (
                        <span className="chip plain">On the sheet</span>
                      ) : (
                        <StatusChip status={unit.status} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {list.data && rows.length === 0 && (
            <Empty title="No units match">Try fewer words or another filter.</Empty>
          )}
          {list.data && list.data.total > PAGE_SIZE && (
            <TableFoot
              page={page}
              pageSize={PAGE_SIZE}
              total={list.data.total}
              noun="units"
              onPage={setPage}
            />
          )}
        </div>
      </div>
    </Dialog>
  );
}
