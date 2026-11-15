import type { AssetDetail, Catalog, ConditionGrade, Movement } from '@wms/contracts';
import { Archive, MapPin, Pencil, Printer, Wrench } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/auth.js';
import { invalidate, useBackend, useIntent, useResource } from '../backend/context.js';
import { AssetLabel } from '../components/AssetLabel.js';
import { Select, SkPage } from '../components/controls.js';
import { DataTable } from '../components/DataTable.js';
import { ActionDialog, ReasonDialog, ShelfDialog } from '../components/dialogs.js';
import {
  Button,
  CategoryThumb,
  Empty,
  Field,
  FormError,
  PageHead,
  StatusChip,
  useToast,
} from '../components/ui.js';
import { useWmsState } from '../data/context.js';
import { WmsError } from '../data/store.js';
import { formatDate, formatDateTime } from '../lib/dates.js';
import { ASSET_STATUS_LABELS, GRADE_LABELS, GRADE_OPTIONS, movementLabel } from '../lib/labels.js';
import { NotFound } from './NotFound.js';

type Open = 'edit' | 'move' | 'repair' | 'repaired' | 'retire' | null;

export function UnitDetail() {
  const { code = '' } = useParams();
  const backend = useBackend();
  const { can } = useAuth();
  const toast = useToast();
  const { settings } = useWmsState();
  const [open, setOpen] = useState<Open>(null);
  const intent = useIntent();

  const detail = useResource(`units:detail:${code}`, () => backend.unit(code));
  const catalog = useResource('catalog', () => backend.catalog());
  const loans = useResource(`units:loans:${code}`, () => backend.unitLoans(code));

  if (detail.error && !detail.data) {
    return /asset code|that asset/i.test(detail.error) ? (
      <NotFound what={`No unit has the asset code ${code}.`} />
    ) : (
      <div className="page">
        <FormError message={detail.error} />
      </div>
    );
  }

  const data = detail.data;
  const unit = data?.asset;
  const free = unit?.status === 'in_stock' && !unit.reservedFor;
  const close = () => setOpen(null);

  /** Runs one step on the unit, then refreshes everything that shows it. */
  const step = async (run: () => Promise<AssetDetail>, done: string) => {
    await run();
    intent.renew();
    invalidate('units');
    toast(done);
  };

  return (
    <div className="page">
      <PageHead
        crumbs={[{ label: 'Demo Units', to: '/units' }, { label: unit?.assetCode ?? code }]}
        title={unit ? `${unit.model.brand} ${unit.model.modelName}` : 'Loading unit…'}
        {...(unit ? { lead: `${unit.model.categoryName} · asset code ${unit.assetCode}` } : {})}
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

      {!data || !unit ? (
        <SkPage kind="detail" />
      ) : (
        <div className="grid-2">
          <div className="stack">
            <section className="card card-pad" aria-labelledby="facts-title">
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <h2 id="facts-title" className="section-title">
                  Unit information
                </h2>
                <StatusChip status={unit.status} reserved={Boolean(unit.reservedFor)} />
              </div>
              <dl className="facts cols-2">
                <div>
                  <dt>Asset code</dt>
                  <dd className="mono">{unit.assetCode}</dd>
                </div>
                <div>
                  <dt>Serial number</dt>
                  <dd className="mono">{unit.serialNumber}</dd>
                </div>
                <div>
                  <dt>Category</dt>
                  <dd>{unit.model.categoryName}</dd>
                </div>
                <div>
                  <dt>Brand / model</dt>
                  <dd>
                    {unit.model.brand} {unit.model.modelName}
                  </dd>
                </div>
                <div>
                  <dt>Location</dt>
                  <dd>{unit.location?.name ?? '—'}</dd>
                </div>
                <div>
                  <dt>Condition</dt>
                  <dd>{GRADE_LABELS[unit.condition]}</dd>
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
                <span className="muted num">{data.movements.length} entries</span>
              </div>
              <History movements={data.movements} code={unit.assetCode} />
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
                <Link to={`/units/labels?codes=${unit.assetCode}`} className="btn btn-sm">
                  <Printer aria-hidden="true" />
                  Print
                </Link>
              </div>
              <AssetLabel
                unit={{
                  code: unit.assetCode,
                  brand: unit.model.brand,
                  model: unit.model.modelName,
                  serial: unit.serialNumber,
                }}
                size="70x35"
                showSerial={settings.labelShowsSerial}
              />
              <CategoryThumb unit={{ categoryCode: unit.model.categoryCode }} large />
            </section>

            <section className="card card-pad" aria-labelledby="acc-title">
              <h2 id="acc-title" className="section-title" style={{ marginBottom: 8 }}>
                Accessories
              </h2>
              {data.accessories.length === 0 ? (
                <p className="muted">None on record.</p>
              ) : (
                <ul className="row" style={{ gap: 6 }}>
                  {data.accessories.map((item) => (
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
                <span className="muted num">{loans.data?.length ?? 0}</span>
              </div>
              {!loans.data || loans.data.length === 0 ? (
                <Empty title="Never lent out">This unit has no loans yet.</Empty>
              ) : (
                <div className="feed">
                  {loans.data.slice(0, 6).map((loan) => (
                    <Link
                      key={loan.number}
                      to={`/borrow/${loan.number}`}
                      className="feed-item"
                      style={{ gridTemplateColumns: '1fr auto' }}
                    >
                      <span>
                        <strong>{loan.company}</strong>
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

      {data && open === 'edit' && (
        <EditDialog detail={data} onClose={close} onSaved={() => invalidate('units')} />
      )}
      {unit && open === 'move' && catalog.data && (
        <ShelfDialog
          title="Move to another shelf"
          description={`${unit.assetCode} is on ${unit.location?.name ?? 'an unknown shelf'}.`}
          confirmLabel="Move unit"
          currentId={unit.location?.id ?? ''}
          shelves={shelvesOf(catalog.data)}
          onClose={close}
          onConfirmAsync={(locationId) =>
            step(
              () => backend.moveUnit(intent.key, unit.assetCode, locationId),
              `${unit.assetCode} moved`,
            )
          }
        />
      )}
      {unit && open === 'repair' && (
        <ReasonDialog
          title="Send to repair"
          description={`${unit.assetCode} leaves the available stock until the repair is complete.`}
          label="What is wrong with it?"
          placeholder="Fan fault, port 3 dead, cracked bezel…"
          confirmLabel="Send to repair"
          onClose={close}
          onConfirmAsync={(reason) =>
            step(
              () => backend.repairUnit(intent.key, unit.assetCode, reason),
              `${unit.assetCode} sent to the repair bench`,
            )
          }
        />
      )}
      {unit && open === 'repaired' && (
        <ActionDialog
          title="Repair complete"
          description={`${unit.assetCode} goes back to inspection before it can be lent again.`}
          confirmLabel="Send to inspection"
          onClose={close}
          onConfirmAsync={() =>
            step(
              () => backend.repairComplete(intent.key, unit.assetCode),
              `${unit.assetCode} is ${ASSET_STATUS_LABELS.under_inspection.toLowerCase()}`,
            )
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
          onConfirmAsync={(reason) =>
            step(
              () => backend.retireUnit(intent.key, unit.assetCode, reason),
              `${unit.assetCode} retired`,
            )
          }
        />
      )}
    </div>
  );
}

function shelvesOf(catalog: Catalog) {
  return catalog.locations
    .filter((item) => item.kind === 'shelf')
    .map((item) => ({ value: item.id, label: item.name, hint: item.parentName ?? undefined }));
}

function History({ movements, code }: { movements: Movement[]; code: string }) {
  return (
    <DataTable
      rows={movements}
      columns={[
        {
          id: 'date',
          header: 'Date',
          className: 'num',
          sort: (movement) => movement.occurredAt,
          cell: (movement) => formatDateTime(movement.occurredAt),
        },
        {
          id: 'type',
          header: 'Movement',
          sort: (movement) => movementLabel(movement.type),
          cell: (movement) => <span className="cell-main">{movementLabel(movement.type)}</span>,
        },
        {
          id: 'state',
          header: 'Status after',
          sort: (movement) => ASSET_STATUS_LABELS[movement.toStatus],
          cell: (movement) => <StatusChip status={movement.toStatus} />,
        },
        {
          id: 'by',
          header: 'By',
          sort: (movement) => movement.actorName,
          cell: (movement) => movement.actorName,
        },
        {
          id: 'note',
          header: 'Remarks',
          width: '1.6fr',
          cell: (movement) => (
            <>
              {movement.note ?? (movement.toLocation ? `To ${movement.toLocation}` : '')}
              {movement.loanNumber && (
                <>
                  {' · '}
                  <Link to={`/borrow/${movement.loanNumber}`} className="link mono">
                    {movement.loanNumber}
                  </Link>
                </>
              )}
            </>
          ),
        },
      ]}
      rowKey={(movement) => movement.id}
      noun="movements"
      pageSize={8}
      search={{
        placeholder: 'Search remarks or transaction…',
        text: (movement) =>
          `${movementLabel(movement.type)} ${movement.note ?? ''} ${movement.loanNumber ?? ''}`,
      }}
      filters={[
        {
          id: 'type',
          label: 'Movement',
          allLabel: 'All movements',
          options: [...new Set(movements.map((movement) => movement.type))].map((type) => ({
            value: type,
            label: movementLabel(type),
          })),
          test: (movement, value) => movement.type === value,
        },
      ]}
      exportCsv={{
        name: `history-${code}`,
        header: ['Date', 'Movement', 'Status after', 'By', 'Remarks', 'Transaction'],
        row: (movement) => [
          movement.occurredAt,
          movementLabel(movement.type),
          ASSET_STATUS_LABELS[movement.toStatus],
          movement.actorName,
          movement.note ?? '',
          movement.loanNumber ?? '',
        ],
      }}
    />
  );
}

/** Edits the details a unit can change. The model is its identity, so it is not editable. */
function EditDialog({
  detail,
  onClose,
  onSaved,
}: {
  detail: AssetDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  const backend = useBackend();
  const toast = useToast();
  const intent = useIntent();
  const unit = detail.asset;
  const [serial, setSerial] = useState(unit.serialNumber);
  const [condition, setCondition] = useState<ConditionGrade>(unit.condition);
  const [notes, setNotes] = useState(unit.notes ?? '');

  return (
    <ActionDialog
      title={`Edit ${unit.assetCode}`}
      description="The asset code and model never change. Register a new unit for a different model."
      confirmLabel="Save changes"
      width={560}
      onClose={onClose}
      onConfirmAsync={async () => {
        const nextNotes = notes.trim() || null;
        const patch = {
          ...(serial.trim().toUpperCase() !== unit.serialNumber ? { serialNumber: serial } : {}),
          ...(condition !== unit.condition ? { condition } : {}),
          ...(nextNotes !== unit.notes ? { notes: nextNotes } : {}),
        };
        if (Object.keys(patch).length === 0) throw new WmsError('Nothing has changed.');
        await backend.editUnit(intent.key, unit.assetCode, patch);
        onSaved();
        toast(`${unit.assetCode} updated`);
      }}
    >
      <Field label="Serial number">
        <input
          className="input mono"
          value={serial}
          onChange={(event) => setSerial(event.target.value)}
          autoCapitalize="characters"
          spellCheck={false}
        />
      </Field>
      <Field label="Condition">
        <Select
          value={condition}
          onChange={(value) => setCondition(value as ConditionGrade)}
          options={GRADE_OPTIONS}
        />
      </Field>
      <Field label="Notes">
        <textarea
          className="textarea"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </Field>
    </ActionDialog>
  );
}
