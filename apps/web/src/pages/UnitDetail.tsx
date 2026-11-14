import { Archive, MapPin, Pencil, Printer, Wrench } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { usePageReady } from '../lib/hooks.js';
import { SkPage } from '../components/controls.js';
import { useAuth, useCurrentUser } from '../auth/auth.js';
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
import { useStore, useWmsState } from '../data/context.js';
import { MOVEMENT_LABELS, STATUS_LABELS } from '../data/selectors.js';
import type { Unit } from '../data/types.js';
import { formatDate, formatDateTime } from '../lib/dates.js';
import { NotFound } from './NotFound.js';

type Open = 'edit' | 'move' | 'repair' | 'repaired' | 'retire' | null;

const CONDITION_LABELS = { A: 'A · Like new', B: 'B · Light wear', C: 'C · Heavy wear' } as const;

export function UnitDetail() {
  const ready = usePageReady();
  const { code = '' } = useParams();
  const state = useWmsState();
  const store = useStore();
  const user = useCurrentUser();
  const { can } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState<Open>(null);

  const unit = state.units.find((item) => item.code === code);
  const history = useMemo(
    () => state.movements.filter((movement) => movement.unitCode === code).reverse(),
    [state.movements, code],
  );
  const loans = useMemo(
    () => state.loans.filter((loan) => loan.unitCode === code).reverse(),
    [state.loans, code],
  );
  const userName = useMemo(
    () => new Map(state.users.map((item) => [item.username, item.name])),
    [state.users],
  );

  if (!unit) return <NotFound what={`No unit has the asset code ${code}.`} />;

  const category = state.categories.find((item) => item.code === unit.categoryCode);
  const location = state.locations.find((item) => item.id === unit.locationId);
  const free = unit.status === 'in_stock' && !unit.reservedFor;
  const close = () => setOpen(null);

  return (
    <div className="page">
      <PageHead
        crumbs={[{ label: 'Demo Units', to: '/units' }, { label: unit.code }]}
        title={`${unit.brand} ${unit.model}`}
        lead={`${category?.name ?? unit.categoryCode} · asset code ${unit.code}`}
        actions={
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
            {can('unit.repair') && free && (
              <Button icon={Wrench} onClick={() => setOpen('repair')}>
                Send to repair
              </Button>
            )}
            {can('unit.repair') && unit.status === 'for_repair' && (
              <Button variant="primary" icon={Wrench} onClick={() => setOpen('repaired')}>
                Repair complete
              </Button>
            )}
            {can('unit.retire') && (free || unit.status === 'for_repair') && (
              <Button variant="danger" icon={Archive} onClick={() => setOpen('retire')}>
                Retire
              </Button>
            )}
          </>
        }
      />

      {!ready ? (
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
                  <dd>{location ? `${location.name} · ${location.zone}` : '—'}</dd>
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
              </dl>
              {unit.notes && (
                <p className="muted" style={{ marginTop: 10 }}>
                  {unit.notes}
                </p>
              )}
            </section>

            <section className="card table-card" aria-labelledby="history-title">
              <div className="card-head" style={{ paddingBottom: 14 }}>
                <h2 id="history-title">Movement history</h2>
                <span className="muted num">{history.length} entries</span>
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
                      </td>
                      <td data-label="Status after">
                        <StatusChip status={movement.toStatus} />
                      </td>
                      <td data-label="By">{userName.get(movement.by) ?? movement.by}</td>
                      <td data-label="Remarks">
                        {movement.note}
                        {movement.loanNumber && (
                          <>
                            {' · '}
                            <Link to={`/borrow/${movement.loanNumber}`} className="link mono">
                              {movement.loanNumber}
                            </Link>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                  {state.settings.labelShowsSerial && (
                    <span className="mono">S/N {unit.serial}</span>
                  )}
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
                <span className="muted num">{loans.length}</span>
              </div>
              {loans.length === 0 ? (
                <Empty title="Never lent out">This unit has no loans yet.</Empty>
              ) : (
                <div className="feed">
                  {loans.slice(0, 6).map((loan) => (
                    <Link
                      key={loan.number}
                      to={`/borrow/${loan.number}`}
                      className="feed-item"
                      style={{ gridTemplateColumns: '1fr auto' }}
                    >
                      <span>
                        <strong>{loan.borrower.company}</strong>
                        <span className="cell-sub" style={{ display: 'block' }}>
                          <span className="mono">{loan.number}</span> · {loan.purpose}
                        </span>
                      </span>
                      <time dateTime={loan.startDate}>{formatDate(loan.startDate)}</time>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {open === 'edit' && <EditDialog unit={unit} onClose={close} />}
      {open === 'move' && (
        <ShelfDialog
          title="Move to another shelf"
          description={`${unit.code} is on ${location?.name ?? 'an unknown shelf'}.`}
          confirmLabel="Move unit"
          currentId={unit.locationId}
          onClose={close}
          onConfirm={(locationId) => {
            store.moveUnit(user.username, unit.code, locationId);
            toast(`${unit.code} moved`);
          }}
        />
      )}
      {open === 'repair' && (
        <ReasonDialog
          title="Send to repair"
          description={`${unit.code} leaves the available stock until the repair is complete.`}
          label="What is wrong with it?"
          placeholder="Fan fault, port 3 dead, cracked bezel…"
          confirmLabel="Send to repair"
          onClose={close}
          onConfirm={(reason) => {
            store.sendToRepair(user.username, unit.code, reason);
            toast(`${unit.code} sent to the repair bench`);
          }}
        />
      )}
      {open === 'repaired' && (
        <ShelfDialog
          title="Repair complete"
          description="Choose the shelf the repaired unit goes back to."
          confirmLabel="Restock unit"
          currentId=""
          onClose={close}
          onConfirm={(locationId) => {
            store.completeRepair(user.username, unit.code, locationId, '');
            toast(`${unit.code} is ${STATUS_LABELS.in_stock.toLowerCase()} again`);
          }}
        />
      )}
      {open === 'retire' && (
        <ReasonDialog
          title="Retire this unit"
          description="A retired unit leaves the inventory counts. Its history is kept."
          label="Reason"
          placeholder="End of life, written off, returned to vendor…"
          confirmLabel="Retire unit"
          danger
          onClose={close}
          onConfirm={(reason) => {
            store.retireUnit(user.username, unit.code, reason);
            toast(`${unit.code} retired`);
          }}
        />
      )}
    </div>
  );
}

function EditDialog({ unit, onClose }: { unit: Unit; onClose: () => void }) {
  const store = useStore();
  const user = useCurrentUser();
  const toast = useToast();
  const [brand, setBrand] = useState(unit.brand);
  const [model, setModel] = useState(unit.model);
  const [serial, setSerial] = useState(unit.serial);
  const [accessories, setAccessories] = useState(unit.accessories.join(', '));
  const [notes, setNotes] = useState(unit.notes);

  return (
    <ActionDialog
      title={`Edit ${unit.code}`}
      description="The asset code never changes."
      confirmLabel="Save changes"
      width={560}
      onClose={onClose}
      onConfirm={() => {
        store.updateUnit(user.username, unit.code, {
          brand,
          model,
          serial,
          accessories: accessories.split(','),
          notes,
        });
        toast('Unit details saved');
      }}
    >
      <div className="form-grid cols-2">
        <Field label="Brand">
          <input
            className="input"
            value={brand}
            onChange={(event) => setBrand(event.target.value)}
          />
        </Field>
        <Field label="Model">
          <input
            className="input"
            value={model}
            onChange={(event) => setModel(event.target.value)}
          />
        </Field>
        <Field label="Serial number" className="span-2">
          <input
            className="input mono"
            value={serial}
            onChange={(event) => setSerial(event.target.value)}
            spellCheck={false}
          />
        </Field>
        <Field label="Accessories" hint="Separate with commas." className="span-2">
          <input
            className="input"
            value={accessories}
            onChange={(event) => setAccessories(event.target.value)}
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
