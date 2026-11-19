import type { ConditionGrade, Movement, Unit, UnitDetail as UnitDetailData } from '@wms/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { Archive, MapPin, Pencil, Printer, Wrench } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, apiGet, apiSend } from '../api/client.js';
import { keys, useInvalidate, useTransactions, useUnit } from '../api/queries.js';
import { useAuth, useReference } from '../auth/auth.js';
import { Select, SkPage } from '../components/controls.js';
import { ActionDialog, ReasonDialog, ShelfDialog } from '../components/dialogs.js';
import { QrCode } from '../components/QrCode.js';
import {
  Button,
  CategoryThumb,
  Empty,
  Field,
  PageHead,
  StatusChip,
  useToast,
} from '../components/ui.js';
import { formatDate, formatDateTime } from '../lib/dates.js';
import { CONDITION_LABELS, MOVEMENT_LABELS } from '../lib/labels.js';
import { NotFound } from './NotFound.js';
import { CONDITION_OPTIONS } from './Units.js';

type Open = 'edit' | 'move' | 'repair' | 'repaired' | 'retire' | null;

export function UnitDetail() {
  const { code = '' } = useParams();
  const { categories, settings } = useReference();
  const { can } = useAuth();
  const toast = useToast();
  const client = useQueryClient();
  const invalidate = useInvalidate();
  const [open, setOpen] = useState<Open>(null);
  const [older, setOlder] = useState<{ items: Movement[]; cursor: string | null } | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const detail = useUnit(code);
  const loans = useTransactions({ unit: code, pageSize: 6, page: 1 });

  if (detail.error instanceof ApiError && detail.error.status === 404) {
    return <NotFound what={`No unit has the asset code ${code}.`} />;
  }
  const unit = detail.data;
  const category = categories.find((item) => item.code === unit?.categoryCode);
  const free = unit?.status === 'in_stock' && !unit.reservedFor;
  const close = () => setOpen(null);
  const history = [...(unit?.movements ?? []), ...(older?.items ?? [])];
  const nextCursor = older ? older.cursor : (unit?.movementsCursor ?? null);

  /** Every mutation answers with the unit as it now is; the lists it appears in are refreshed. */
  const act = async (
    path: string,
    body: unknown,
    key: string,
    done: string,
    method: 'POST' | 'PATCH' = 'POST',
  ) => {
    const updated = await apiSend<Unit>(method, `/units/${code}${path}`, body, key);
    client.setQueryData<UnitDetailData>(keys.unit(code), (current) =>
      current ? { ...current, ...updated } : current,
    );
    await Promise.all([
      client.invalidateQueries({ queryKey: keys.unit(code) }),
      invalidate('units', 'dashboard', 'alerts', 'inspections'),
    ]);
    setOlder(null);
    toast(done);
  };

  const loadOlder = async () => {
    if (!nextCursor) return;
    setLoadingOlder(true);
    try {
      const page = await apiGet<{ items: Movement[]; nextCursor: string | null }>(
        `/units/${code}/movements`,
        {
          cursor: nextCursor,
          limit: 50,
        },
      );
      setOlder((current) => ({
        items: [...(current?.items ?? []), ...page.items],
        cursor: page.nextCursor,
      }));
    } finally {
      setLoadingOlder(false);
    }
  };

  return (
    <div className="page">
      <PageHead
        crumbs={[{ label: 'Demo Units', to: '/units' }, { label: code }]}
        title={unit ? `${unit.brand} ${unit.model}` : code}
        lead={
          unit ? `${category?.name ?? unit.categoryCode} · asset code ${unit.code}` : 'Loading…'
        }
        actions={
          unit && (
            <>
              {can('unit.edit') && (
                <Button icon={Pencil} onClick={() => setOpen('edit')}>
                  Edit
                </Button>
              )}
              {can('unit.move') && free && (
                <Button icon={MapPin} onClick={() => setOpen('move')}>
                  Move shelf
                </Button>
              )}
              {can('unit.repair') && (free || unit.status === 'under_inspection') && (
                <Button icon={Wrench} onClick={() => setOpen('repair')}>
                  Send to repair
                </Button>
              )}
              {can('unit.repair') && unit.status === 'for_repair' && (
                <Button variant="primary" icon={Wrench} onClick={() => setOpen('repaired')}>
                  Repair complete
                </Button>
              )}
              {can('unit.retire') &&
                (free || unit.status === 'for_repair' || unit.status === 'under_inspection') && (
                  <Button variant="danger" icon={Archive} onClick={() => setOpen('retire')}>
                    Retire
                  </Button>
                )}
            </>
          )
        }
      />

      {!unit ? (
        <SkPage kind="detail" />
      ) : (
        <div className="grid-2">
          <div className="stack">
            <section className="card card-pad" aria-labelledby="facts-title">
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <h2 id="facts-title" className="section-title">
                  Unit information
                </h2>
                <StatusChip status={unit.status} reserved={unit.reservedFor !== null} />
              </div>
              <dl className="facts cols-2">
                <div>
                  <dt>Asset code</dt>
                  <dd className="mono">{unit.code}</dd>
                </div>
                <div>
                  <dt>Serial number</dt>
                  <dd className="mono">{unit.serial}</dd>
                </div>
                <div>
                  <dt>Category</dt>
                  <dd>{category?.name ?? unit.categoryCode}</dd>
                </div>
                <div>
                  <dt>Brand / model</dt>
                  <dd>
                    {unit.brand} {unit.model}
                  </dd>
                </div>
                <div>
                  <dt>Location</dt>
                  <dd>
                    {unit.location
                      ? `${unit.location.name}${unit.location.roomName ? ` · ${unit.location.roomName}` : ''}`
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt>Condition</dt>
                  <dd>{CONDITION_LABELS[unit.condition]}</dd>
                </div>
                <div>
                  <dt>Registered</dt>
                  <dd>{formatDate(unit.registeredAt)}</dd>
                </div>
                <div>
                  <dt>Reserved for</dt>
                  <dd>
                    {unit.reservedFor ? (
                      <Link to={`/borrow/${unit.reservedFor}`} className="link mono">
                        {unit.reservedFor}
                      </Link>
                    ) : (
                      'Nobody'
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Ownership</dt>
                  <dd>
                    {unit.ownership === 'owned'
                      ? 'Netpoleon'
                      : `Consigned by ${unit.ownerName ?? 'vendor'}`}
                  </dd>
                </div>
              </dl>
              {unit.notes && (
                <p className="muted" style={{ marginTop: 10 }}>
                  {unit.notes}
                </p>
              )}
            </section>

            {unit.reservations.length > 0 && (
              <section className="card" aria-labelledby="bookings-title">
                <div className="card-head">
                  <h2 id="bookings-title">Bookings</h2>
                  <span className="muted num">{unit.reservations.length}</span>
                </div>
                <div className="feed">
                  {unit.reservations.map((booking) => (
                    <Link
                      key={`${booking.transactionNumber}-${booking.from}`}
                      to={`/borrow/${booking.transactionNumber}`}
                      className="feed-item"
                      style={{ gridTemplateColumns: '1fr auto' }}
                    >
                      <span>
                        <strong>{booking.company}</strong>
                        <span className="cell-sub" style={{ display: 'block' }}>
                          <span className="mono">{booking.transactionNumber}</span>
                          {booking.status === 'needs_reassignment'
                            ? ' · needs a substitute unit'
                            : ''}
                        </span>
                      </span>
                      <span className="num">
                        {formatDate(booking.from)} – {formatDate(booking.until)}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            <section className="card table-card" aria-labelledby="history-title">
              <div className="card-head" style={{ paddingBottom: 14 }}>
                <h2 id="history-title">Movement history</h2>
                <span className="muted num">{history.length} shown</span>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Movement</th>
                    <th>Status after</th>
                    <th>By</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((movement) => (
                    <tr key={movement.id}>
                      <td data-label="Date" className="num">
                        {formatDateTime(movement.at)}
                      </td>
                      <td data-label="Movement">
                        <span className="cell-main">{MOVEMENT_LABELS[movement.type]}</span>
                        {movement.toLocation && movement.toLocation !== movement.fromLocation && (
                          <span className="cell-sub">to {movement.toLocation}</span>
                        )}
                      </td>
                      <td data-label="Status after">
                        <StatusChip status={movement.toStatus} />
                      </td>
                      <td data-label="By">{movement.by?.name ?? 'System'}</td>
                      <td data-label="Remarks">
                        {movement.note}
                        {movement.transactionNumber && (
                          <>
                            {movement.note ? ' · ' : ''}
                            <Link
                              to={`/borrow/${movement.transactionNumber}`}
                              className="link mono"
                            >
                              {movement.transactionNumber}
                            </Link>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {nextCursor && (
                <div className="card-pad" style={{ paddingTop: 0 }}>
                  <Button size="sm" pending={loadingOlder} onClick={() => void loadOlder()}>
                    Show older movements
                  </Button>
                </div>
              )}
            </section>
          </div>

          <div className="stack" style={{ alignContent: 'start' }}>
            <section
              className="card card-pad stack"
              style={{ gap: 12 }}
              aria-labelledby="label-title"
            >
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h2 id="label-title" className="section-title">
                  Asset label
                </h2>
                <Button size="sm" icon={Printer} onClick={() => window.print()}>
                  Print
                </Button>
              </div>
              <div className="label-card">
                <QrCode value={unit.code} />
                <div>
                  <span>Netpoleon demo unit</span>
                  <strong className="mono">{unit.code}</strong>
                  <span>
                    {unit.brand} {unit.model}
                  </span>
                  {settings.labelShowsSerial && <span className="mono">S/N {unit.serial}</span>}
                </div>
              </div>
              <CategoryThumb unit={unit} large />
            </section>

            <section className="card card-pad" aria-labelledby="acc-title">
              <h2 id="acc-title" className="section-title" style={{ marginBottom: 8 }}>
                Accessories
              </h2>
              {unit.accessories.length === 0 ? (
                <p className="muted">None on record.</p>
              ) : (
                <ul className="row" style={{ gap: 6 }}>
                  {unit.accessories.map((item) => (
                    <li key={item} className="chip plain">
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card" aria-labelledby="loans-title">
              <div className="card-head">
                <h2 id="loans-title">Borrower history</h2>
                <span className="muted num">{loans.data?.total ?? ''}</span>
              </div>
              {loans.data && loans.data.items.length === 0 ? (
                <Empty title="Never lent out">This unit has no loans yet.</Empty>
              ) : (
                <div className="feed">
                  {(loans.data?.items ?? []).map((loan) => (
                    <Link
                      key={loan.number}
                      to={`/borrow/${loan.number}`}
                      className="feed-item"
                      style={{ gridTemplateColumns: '1fr auto' }}
                    >
                      <span>
                        <strong>{loan.company.name}</strong>
                        <span className="cell-sub" style={{ display: 'block' }}>
                          <span className="mono">{loan.number}</span> · {loan.purpose}
                        </span>
                      </span>
                      <time dateTime={loan.neededFrom}>{formatDate(loan.neededFrom)}</time>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {unit && open === 'edit' && (
        <EditDialog
          unit={unit}
          onClose={close}
          onSave={(body, key) => act('', body, key, 'Unit details saved', 'PATCH')}
        />
      )}
      {unit && open === 'move' && (
        <ShelfDialog
          title="Move to another shelf"
          description={`${unit.code} is on ${unit.location?.name ?? 'an unknown shelf'}.`}
          confirmLabel="Move unit"
          currentId={unit.location?.id ?? ''}
          onClose={close}
          onConfirm={(locationId, key) =>
            act('/relocate', { locationId }, key, `${unit.code} moved`)
          }
        />
      )}
      {unit && open === 'repair' && (
        <ReasonDialog
          title="Send to repair"
          description={`${unit.code} leaves the available stock until the repair is complete. Future bookings of it are flagged for a substitute.`}
          label="What is wrong with it?"
          placeholder="Fan fault, port 3 dead, cracked bezel…"
          confirmLabel="Send to repair"
          onClose={close}
          onConfirm={(reason, key) =>
            act('/repair', { reason }, key, `${unit.code} sent to the repair bench`)
          }
        />
      )}
      {unit && open === 'repaired' && (
        <ReasonDialog
          title="Repair complete"
          description="The unit goes back through inspection before it returns to a shelf."
          label="What was done?"
          placeholder="Replaced fan, re-flashed firmware…"
          confirmLabel="Send to inspection"
          onClose={close}
          onConfirm={(note, key) =>
            act('/repair-complete', { note }, key, `${unit.code} is waiting for inspection`)
          }
        />
      )}
      {unit && open === 'retire' && (
        <ReasonDialog
          title="Retire this unit"
          description="A retired unit leaves the inventory counts. Its history is kept."
          label="Reason"
          placeholder="End of life, written off, returned to vendor…"
          confirmLabel="Retire unit"
          danger
          onClose={close}
          onConfirm={(reason, key) => act('/retire', { reason }, key, `${unit.code} retired`)}
        />
      )}
    </div>
  );
}

function EditDialog({
  unit,
  onClose,
  onSave,
}: {
  unit: Unit;
  onClose: () => void;
  onSave: (
    body: { serial: string; condition: ConditionGrade; notes: string | null },
    key: string,
  ) => Promise<void>;
}) {
  const [serial, setSerial] = useState(unit.serial);
  const [condition, setCondition] = useState<ConditionGrade>(unit.condition);
  const [notes, setNotes] = useState(unit.notes ?? '');

  return (
    <ActionDialog
      title={`Edit ${unit.code}`}
      description="The asset code never changes. Brand, model and accessories belong to the product model."
      confirmLabel="Save changes"
      width={560}
      onClose={onClose}
      canConfirm={serial.trim() !== ''}
      onConfirm={(key) =>
        onSave({ serial: serial.trim(), condition, notes: notes.trim() || null }, key)
      }
    >
      <div className="form-grid cols-2">
        <Field label="Serial number">
          <input
            className="input mono"
            value={serial}
            onChange={(event) => setSerial(event.target.value)}
            spellCheck={false}
          />
        </Field>
        <Field label="Condition">
          <Select
            value={condition}
            onChange={(value) => setCondition(value as ConditionGrade)}
            options={CONDITION_OPTIONS}
          />
        </Field>
        <Field label="Notes" className="span-2">
          <textarea
            className="textarea"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </Field>
      </div>
    </ActionDialog>
  );
}
