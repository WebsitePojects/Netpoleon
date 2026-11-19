import type { TransactionDetail as Detail, TransactionUnit } from '@wms/contracts';
import { useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  Boxes,
  CalendarClock,
  Check,
  ClipboardCheck,
  FileText,
  Info,
  PackageCheck,
  Send,
  Undo2,
  User,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, apiSend } from '../api/client.js';
import { keys, useCandidates, useInvalidate, useTransaction } from '../api/queries.js';
import { useAuth, useCurrentUser, useReference } from '../auth/auth.js';
import { DateField, Select, SkPage } from '../components/controls.js';
import {
  AccessoryChecklist,
  ActionDialog,
  ReasonDialog,
  ScanField,
} from '../components/dialogs.js';
import { Button, Field, LoanChip, PageHead, useToast } from '../components/ui.js';
import { addDays, daysBetween, formatDate, formatDateTime } from '../lib/dates.js';
import { NotFound } from './NotFound.js';

type Open = 'approve' | 'reject' | 'cancel' | 'release' | 'receive' | 'extend' | null;

interface Step {
  label: string;
  detail: string;
  state: 'done' | 'current' | 'todo' | 'stopped';
}

const lastOf = (values: (string | null)[]) =>
  values
    .filter((value): value is string => value !== null)
    .sort()
    .at(-1) ?? null;

/** The transaction's path through the lifecycle, with the step that is waiting marked current. */
function buildSteps(loan: Detail): Step[] {
  const steps: Step[] = [
    {
      label: 'Request filed',
      detail: `${formatDateTime(loan.requestedAt)} by ${loan.filedBy?.name ?? '—'}`,
      state: 'done',
    },
  ];
  if (loan.stage === 'rejected' || loan.stage === 'cancelled' || loan.stage === 'expired') {
    steps.push({
      label: { rejected: 'Rejected', cancelled: 'Cancelled', expired: 'Expired, not collected' }[
        loan.stage
      ],
      detail: [loan.decidedAt ? formatDateTime(loan.decidedAt) : '', loan.decisionNote ?? '']
        .filter(Boolean)
        .join(' · '),
      state: 'stopped',
    });
    return steps;
  }
  const returnedAt =
    loan.itemsReleased > 0 && loan.itemsReturned === loan.itemsReleased
      ? lastOf(loan.units.map((unit) => unit.returnedAt))
      : null;
  steps.push({
    label: 'Approved',
    detail: loan.decidedAt
      ? `${formatDateTime(loan.decidedAt)} by ${loan.decidedBy?.name ?? '—'}`
      : 'Waiting for an approver',
    state: loan.decidedAt ? 'done' : 'current',
  });
  steps.push({
    label: 'Released',
    detail: loan.releasedAt
      ? `${formatDateTime(loan.releasedAt)} by ${loan.releasedBy?.name ?? '—'}`
      : 'Units are scanned out at pickup',
    state: loan.releasedAt ? 'done' : loan.stage === 'approved' ? 'current' : 'todo',
  });
  steps.push({
    label: 'Returned',
    detail: returnedAt ? formatDateTime(returnedAt) : `Expected ${formatDate(loan.dueDate)}`,
    state: returnedAt ? 'done' : loan.stage === 'released' ? 'current' : 'todo',
  });
  steps.push({
    label: 'Inspected and closed',
    detail: loan.stage === 'closed' ? 'Inspection recorded' : 'Condition check before restocking',
    state: loan.stage === 'closed' ? 'done' : loan.stage === 'returned' ? 'current' : 'todo',
  });
  return steps;
}

export function TransactionDetail() {
  const { number = '' } = useParams();
  const user = useCurrentUser();
  const { categories } = useReference();
  const { can } = useAuth();
  const toast = useToast();
  const client = useQueryClient();
  const invalidate = useInvalidate();
  const [open, setOpen] = useState<Open>(null);
  const query = useTransaction(number);

  if (query.error instanceof ApiError && query.error.status === 404) {
    return <NotFound what={`Transaction ${number} was not found.`} />;
  }
  const loan = query.data;

  /** Every action answers with the transaction as it now is; the affected lists are refreshed. */
  const act = async (path: string, body: unknown, key: string, done: string) => {
    const updated = await apiSend<Detail>('POST', `/transactions/${number}/${path}`, body, key);
    client.setQueryData(keys.transaction(number), updated);
    await invalidate('transactions', 'units', 'unit', 'dashboard', 'alerts', 'inspections');
    toast(done);
  };

  const ownRequest = loan?.filedBy?.id === user.id;
  const waiting = loan?.units.filter((unit) => unit.reservationStatus === 'active') ?? [];
  const out = loan?.units.filter((unit) => unit.releasedAt && !unit.returnedAt) ?? [];
  const close = () => setOpen(null);
  const category = categories.find((item) => item.code === loan?.model.categoryCode);

  return (
    <div className="page">
      <PageHead
        crumbs={[{ label: 'Borrow / Return', to: '/borrow' }, { label: 'Transaction Details' }]}
        title="Transaction Details"
        actions={
          loan && (
            <>
              {loan.stage === 'pending' && can('loan.decide') && (
                <>
                  <Button
                    variant="danger"
                    icon={X}
                    onClick={() => setOpen('reject')}
                    disabled={ownRequest}
                  >
                    Reject
                  </Button>
                  <Button
                    variant="primary"
                    icon={Check}
                    onClick={() => setOpen('approve')}
                    disabled={ownRequest}
                  >
                    Approve
                  </Button>
                </>
              )}
              {(loan.stage === 'pending' || loan.stage === 'approved') && can('loan.cancel') && (
                <Button icon={Ban} onClick={() => setOpen('cancel')}>
                  Cancel request
                </Button>
              )}
              {waiting.length > 0 && loan.stage !== 'pending' && can('loan.release') && (
                <Button variant="primary" icon={Send} onClick={() => setOpen('release')}>
                  Release unit
                </Button>
              )}
              {loan.stage === 'released' && out.length > 0 && can('loan.extend') && (
                <Button icon={CalendarClock} onClick={() => setOpen('extend')}>
                  Extend
                </Button>
              )}
              {out.length > 0 && can('loan.receive') && (
                <Button variant="primary" icon={Undo2} onClick={() => setOpen('receive')}>
                  Receive return
                </Button>
              )}
              {loan.stage === 'returned' && can('inspection.perform') && (
                <Link to="/inspection" className="btn btn-primary">
                  <ClipboardCheck aria-hidden="true" />
                  Go to inspection
                </Link>
              )}
            </>
          )
        }
      />

      {!loan ? (
        <SkPage kind="detail" />
      ) : (
        <div className="stack">
          {loan.stage === 'pending' && ownRequest && can('loan.decide') && (
            <p className="banner" role="note">
              <Info aria-hidden="true" />
              You filed this request, so another approver must decide it.
            </p>
          )}
          {loan.daysOverdue > 0 && (
            <p className="banner" role="alert">
              <CalendarClock aria-hidden="true" />
              {out.length === 1 ? 'This unit is' : 'Units on this loan are'} {loan.daysOverdue} day
              {loan.daysOverdue === 1 ? '' : 's'} overdue for return.
            </p>
          )}

          <div className="grid-2">
            <div className="stack">
              <section className="card">
                <div className="txn-head">
                  <div className="txn-id">
                    <FileText aria-hidden="true" />
                    <div>
                      <strong className="mono">{loan.number}</strong>
                      <span className="muted">Borrowing Transaction</span>
                    </div>
                  </div>
                  <div className="row" style={{ gap: 16 }}>
                    <div>
                      <span className="cell-sub">Transaction date</span>
                      <strong className="num" style={{ display: 'block' }}>
                        {formatDateTime(loan.requestedAt)}
                      </strong>
                    </div>
                    <LoanChip status={loan.stage} />
                  </div>
                </div>
              </section>

              <section className="card" aria-labelledby="borrower-title">
                <div className="section-head">
                  <User aria-hidden="true" />
                  <h2 id="borrower-title" className="section-title">
                    Borrower Information
                  </h2>
                </div>
                <div className="section-body">
                  <dl className="facts cols-2">
                    <div>
                      <dt>Name</dt>
                      <dd>{loan.contact.name}</dd>
                    </div>
                    <div>
                      <dt>Email</dt>
                      <dd>{loan.contact.email}</dd>
                    </div>
                    <div>
                      <dt>Company</dt>
                      <dd>{loan.company.name}</dd>
                    </div>
                    <div>
                      <dt>Contact No.</dt>
                      <dd className="num">{loan.contact.phone}</dd>
                    </div>
                    {loan.endCustomer && (
                      <div>
                        <dt>End customer</dt>
                        <dd>{loan.endCustomer}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              </section>

              <section className="card" aria-labelledby="unit-title">
                <div className="section-head">
                  <Boxes aria-hidden="true" />
                  <h2 id="unit-title" className="section-title">
                    Demo Unit Information
                  </h2>
                </div>
                <div className="section-body">
                  <dl className="facts cols-2">
                    <div>
                      <dt>Brand / Model</dt>
                      <dd>
                        {loan.model.brand} {loan.model.name}
                      </dd>
                    </div>
                    <div>
                      <dt>Category</dt>
                      <dd>{category?.name ?? loan.model.categoryCode}</dd>
                    </div>
                    <div>
                      <dt>Units</dt>
                      <dd className="num">
                        {loan.quantityAssigned > 0
                          ? `${loan.quantityAssigned} assigned of ${loan.quantityRequested} requested`
                          : `${loan.quantityRequested} requested, assigned at approval`}
                      </dd>
                    </div>
                  </dl>
                  {loan.units.length > 0 && (
                    <table className="table" style={{ marginTop: 12 }}>
                      <thead>
                        <tr>
                          <th>Asset code</th>
                          <th>Serial</th>
                          <th>Released</th>
                          <th>Returned</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loan.units.map((unit) => (
                          <tr key={unit.assetCode}>
                            <td data-label="Asset code">
                              <Link to={`/units/${unit.assetCode}`} className="link mono">
                                {unit.assetCode}
                              </Link>
                            </td>
                            <td data-label="Serial" className="mono">
                              {unit.serial}
                            </td>
                            <td data-label="Released" className="num">
                              {unit.releasedAt ? formatDateTime(unit.releasedAt) : '—'}
                            </td>
                            <td data-label="Returned" className="num">
                              {unit.returnedAt ? formatDateTime(unit.returnedAt) : '—'}
                              {unit.missingAccessories.length > 0 && (
                                <span className="late cell-sub" style={{ display: 'block' }}>
                                  Missing: {unit.missingAccessories.join(', ')}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </section>

              <section className="card" aria-labelledby="details-title">
                <div className="section-head">
                  <CalendarClock aria-hidden="true" />
                  <h2 id="details-title" className="section-title">
                    Transaction Details
                  </h2>
                </div>
                <div className="section-body">
                  <dl className="facts">
                    <div>
                      <dt>Purpose</dt>
                      <dd>{loan.purpose}</dd>
                    </div>
                    <div>
                      <dt>Release Date</dt>
                      <dd className="num">{formatDate(loan.neededFrom)}</dd>
                    </div>
                    <div>
                      <dt>Expected Return</dt>
                      <dd className="num">
                        {formatDate(loan.dueDate)} ({daysBetween(loan.neededFrom, loan.dueDate) + 1}{' '}
                        days)
                        {loan.dueDate !== loan.neededUntil && (
                          <span className="cell-sub" style={{ display: 'block' }}>
                            Extended from {formatDate(loan.neededUntil)}
                          </span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>{loan.stage === 'rejected' ? 'Rejected By' : 'Approved By'}</dt>
                      <dd>
                        {loan.decidedBy ? (
                          <>
                            {loan.decidedBy.name}
                            {loan.decidedBy.title && (
                              <span className="cell-sub" style={{ display: 'block' }}>
                                {loan.decidedBy.title}
                              </span>
                            )}
                          </>
                        ) : (
                          '—'
                        )}
                      </dd>
                    </div>
                    {loan.decisionNote && (
                      <div>
                        <dt>Decision note</dt>
                        <dd>{loan.decisionNote}</dd>
                      </div>
                    )}
                    {loan.units.some((unit) => unit.returnNote) && (
                      <div>
                        <dt>Return remarks</dt>
                        <dd>
                          {loan.units
                            .filter((unit) => unit.returnNote)
                            .map((unit) => `${unit.assetCode}: ${unit.returnNote}`)
                            .join(' · ')}
                        </dd>
                      </div>
                    )}
                    {loan.extensions.length > 0 && (
                      <div>
                        <dt>Extensions</dt>
                        <dd>
                          {loan.extensions
                            .map(
                              (extension) =>
                                `${formatDate(extension.requestedDueDate)} — ${extension.reason}`,
                            )
                            .join(' · ')}
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt>Status</dt>
                      <dd>
                        <LoanChip status={loan.stage} />
                      </dd>
                    </div>
                  </dl>
                </div>
              </section>
            </div>

            <section
              className="card"
              aria-labelledby="progress-title"
              style={{ alignSelf: 'start' }}
            >
              <div className="card-head" style={{ paddingBottom: 10 }}>
                <h2 id="progress-title">Progress</h2>
              </div>
              <ol className="steps">
                {buildSteps(loan).map((step, index) => (
                  <li key={step.label} className="step" data-state={step.state}>
                    <span className="step-dot">
                      {step.state === 'done' ? (
                        <Check aria-hidden="true" />
                      ) : step.state === 'stopped' ? (
                        <X aria-hidden="true" />
                      ) : (
                        index + 1
                      )}
                    </span>
                    <div>
                      <strong>{step.label}</strong>
                      <p>{step.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </div>
      )}

      {loan && open === 'approve' && (
        <ApproveDialog
          loan={loan}
          onClose={close}
          onApprove={(codes, key) =>
            act(
              'approve',
              { assetCodes: codes },
              key,
              `${loan.number} approved, ${codes.join(', ')} reserved`,
            )
          }
        />
      )}
      {loan && open === 'reject' && (
        <ReasonDialog
          title="Reject this request"
          label="Reason, shown to the person who filed it"
          placeholder="No unit free for these dates…"
          confirmLabel="Reject request"
          danger
          onClose={close}
          onConfirm={(reason, key) => act('reject', { reason }, key, `${loan.number} rejected`)}
        />
      )}
      {loan && open === 'cancel' && (
        <ReasonDialog
          title="Cancel this request"
          description={
            loan.unitCodes.length > 0
              ? `${loan.unitCodes.join(', ')} go back to the available stock.`
              : undefined
          }
          label="Reason"
          placeholder="Customer postponed the demo…"
          confirmLabel="Cancel request"
          danger
          onClose={close}
          onConfirm={(reason, key) => act('cancel', { reason }, key, `${loan.number} cancelled`)}
        />
      )}
      {loan && open === 'release' && (
        <ReleaseDialog
          loan={loan}
          units={waiting}
          onClose={close}
          onRelease={(code, accessories, key) =>
            act(
              'release',
              { items: [{ scannedCode: code, accessoriesOut: accessories }] },
              key,
              `${code} released to ${loan.company.name}`,
            )
          }
        />
      )}
      {loan && open === 'receive' && (
        <ReceiveDialog
          loan={loan}
          units={out}
          onClose={close}
          onReceive={(code, back, note, key, missing) =>
            act(
              'return',
              { scannedCode: code, accessoriesBack: back, note: note || null },
              key,
              missing ? `${code} returned, accessory missing` : `${code} returned complete`,
            )
          }
        />
      )}
      {loan && open === 'extend' && (
        <ExtendDialog
          loan={loan}
          onClose={close}
          onExtend={(due, reason, key) =>
            act(
              'extend',
              { newDueDate: due, reason },
              key,
              `Return date moved to ${formatDate(due)}`,
            )
          }
        />
      )}
    </div>
  );
}

function ApproveDialog({
  loan,
  onClose,
  onApprove,
}: {
  loan: Detail;
  onClose: () => void;
  onApprove: (codes: string[], key: string) => Promise<void>;
}) {
  // Fetched when the dialog opens and never from cache: what is free changes by the minute.
  const candidates = useCandidates(loan.number, true);
  const units = candidates.data?.units ?? [];
  const [chosen, setChosen] = useState<string[]>([]);
  const limit = loan.quantityRequested;
  const picked = chosen.length > 0 ? chosen : units.slice(0, limit).map((unit) => unit.code);

  return (
    <ActionDialog
      title="Approve and assign units"
      description={`${loan.company.name} asked for ${limit} × ${loan.model.brand} ${loan.model.name}, ${formatDate(loan.neededFrom)} to ${formatDate(loan.neededUntil)}.`}
      confirmLabel="Approve request"
      canConfirm={picked.length > 0}
      onClose={onClose}
      onConfirm={(key) => onApprove(picked, key)}
    >
      {candidates.isPending ? (
        <p className="muted">Checking which units are free for these dates…</p>
      ) : units.length === 0 ? (
        <p className="banner">
          <Info aria-hidden="true" />
          No {loan.model.brand} {loan.model.name} is free for these dates. Reject the request or
          wait for a return.
        </p>
      ) : (
        <>
          {(candidates.data?.competingPendingCount ?? 0) > 0 && (
            <p className="banner" role="note">
              <Info aria-hidden="true" />
              {candidates.data?.competingPendingCount} other pending request
              {candidates.data?.competingPendingCount === 1 ? '' : 's'} want this model for
              overlapping dates. The first approved wins.
            </p>
          )}
          {limit === 1 ? (
            <Field
              label="Unit to reserve"
              hint={`${units.length} free unit${units.length === 1 ? '' : 's'} of this model`}
            >
              <Select
                value={picked[0] ?? ''}
                onChange={(code) => setChosen([code])}
                options={units.map((unit) => ({
                  value: unit.code,
                  label: unit.code,
                  hint: `${unit.location?.name ?? unit.status.replace('_', ' ')} · condition ${unit.condition.toUpperCase()}`,
                }))}
              />
            </Field>
          ) : (
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="label" style={{ marginBottom: 4 }}>
                Units to reserve (up to {limit})
              </legend>
              {units.map((unit) => (
                <label key={unit.code} className="check">
                  <input
                    type="checkbox"
                    checked={picked.includes(unit.code)}
                    disabled={!picked.includes(unit.code) && picked.length >= limit}
                    onChange={(event) =>
                      setChosen(
                        event.target.checked
                          ? [...picked, unit.code]
                          : picked.filter((code) => code !== unit.code),
                      )
                    }
                  />
                  <span className="mono">{unit.code}</span>
                  <span className="muted">
                    {' '}
                    · {unit.location?.name ?? unit.status.replace('_', ' ')} · condition{' '}
                    {unit.condition.toUpperCase()}
                  </span>
                </label>
              ))}
            </fieldset>
          )}
        </>
      )}
    </ActionDialog>
  );
}

function UnitPicker({
  units,
  value,
  onChange,
}: {
  units: TransactionUnit[];
  value: string;
  onChange: (code: string) => void;
}) {
  if (units.length <= 1) return null;
  return (
    <Field label="Unit">
      <Select
        value={value}
        onChange={onChange}
        options={units.map((unit) => ({
          value: unit.assetCode,
          label: unit.assetCode,
          hint: unit.serial,
        }))}
      />
    </Field>
  );
}

function ReleaseDialog({
  loan,
  units,
  onClose,
  onRelease,
}: {
  loan: Detail;
  units: TransactionUnit[];
  onClose: () => void;
  onRelease: (code: string, accessories: string[], key: string) => Promise<void>;
}) {
  const [code, setCode] = useState(units[0]?.assetCode ?? '');
  const [scanned, setScanned] = useState('');
  const [accessories, setAccessories] = useState<string[]>(loan.accessories);
  const unit = units.find((item) => item.assetCode === code);
  const ready = scanned.trim().toUpperCase() === code;

  return (
    <ActionDialog
      title="Release unit"
      description={`Hand ${code} to ${loan.contact.name}, ${loan.company.name}.`}
      confirmLabel="Confirm release"
      canConfirm={ready}
      onClose={onClose}
      onConfirm={(key) => onRelease(code, accessories, key)}
    >
      <UnitPicker units={units} value={code} onChange={setCode} />
      {unit && unit.status !== 'in_stock' && (
        <p className="banner" role="note">
          <Info aria-hidden="true" />
          {code} is not on the shelf yet ({unit.status.replace('_', ' ')}). It can be released once
          it is restocked.
        </p>
      )}
      <ScanField expected={code} value={scanned} onChange={setScanned} />
      <AccessoryChecklist
        legend="Accessories going out with the unit"
        items={loan.accessories}
        checked={accessories}
        onChange={setAccessories}
      />
    </ActionDialog>
  );
}

function ReceiveDialog({
  loan,
  units,
  onClose,
  onReceive,
}: {
  loan: Detail;
  units: TransactionUnit[];
  onClose: () => void;
  onReceive: (
    code: string,
    back: string[],
    note: string,
    key: string,
    missing: boolean,
  ) => Promise<void>;
}) {
  const [code, setCode] = useState(units[0]?.assetCode ?? '');
  const unit = units.find((item) => item.assetCode === code);
  const sent = unit?.accessoriesOut ?? [];
  const [scanned, setScanned] = useState('');
  const [back, setBack] = useState<string[]>(sent);
  const [note, setNote] = useState('');
  const missing = sent.filter((item) => !back.includes(item));
  const ready = scanned.trim().toUpperCase() === code;

  return (
    <ActionDialog
      title="Receive return"
      description={`${code} coming back from ${loan.company.name}.`}
      confirmLabel="Confirm return"
      canConfirm={ready}
      onClose={onClose}
      onConfirm={(key) => onReceive(code, back, note.trim(), key, missing.length > 0)}
    >
      <UnitPicker
        units={units}
        value={code}
        onChange={(next) => {
          setCode(next);
          setBack(units.find((item) => item.assetCode === next)?.accessoriesOut ?? []);
        }}
      />
      <ScanField expected={code} value={scanned} onChange={setScanned} />
      <AccessoryChecklist
        legend="Tick each accessory that came back"
        items={sent}
        checked={back}
        onChange={setBack}
      />
      {missing.length > 0 && (
        <p className="banner" role="status">
          <PackageCheck aria-hidden="true" />
          Missing: {missing.join(', ')}. This raises a missing-accessory alert.
        </p>
      )}
      <Field label="Remarks (optional)">
        <textarea
          className="textarea"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </Field>
    </ActionDialog>
  );
}

function ExtendDialog({
  loan,
  onClose,
  onExtend,
}: {
  loan: Detail;
  onClose: () => void;
  onExtend: (due: string, reason: string, key: string) => Promise<void>;
}) {
  const { settings } = useReference();
  const latest = addDays(loan.neededFrom, settings.maxLoanDays - 1);
  const suggested = addDays(loan.dueDate, 7);
  const [dueDate, setDueDate] = useState(suggested > latest ? latest : suggested);
  const [reason, setReason] = useState('');

  return (
    <ActionDialog
      title="Extend this loan"
      description={`Currently due ${formatDate(loan.dueDate)}. The new date must not collide with the unit's next booking.`}
      confirmLabel="Extend loan"
      canConfirm={reason.trim() !== '' && dueDate > loan.dueDate}
      onClose={onClose}
      onConfirm={(key) => onExtend(dueDate, reason.trim(), key)}
    >
      <Field
        label="New return date"
        hint={`Latest allowed: ${formatDate(latest)} (${settings.maxLoanDays} days from release)`}
      >
        <DateField
          ariaLabel="New return date"
          min={addDays(loan.dueDate, 1)}
          max={latest}
          value={dueDate}
          onChange={setDueDate}
        />
      </Field>
      <Field label="Reason">
        <textarea
          className="textarea"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Customer extended the evaluation…"
        />
      </Field>
    </ActionDialog>
  );
}
