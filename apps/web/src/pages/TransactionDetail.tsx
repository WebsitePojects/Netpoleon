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
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth, useCurrentUser } from '../auth/auth.js';
import { DateField, Select, SkPage } from '../components/controls.js';
import { usePageReady } from '../lib/hooks.js';
import {
  AccessoryChecklist,
  ActionDialog,
  ReasonDialog,
  ScanField,
} from '../components/dialogs.js';
import { Button, Field, LoanChip, PageHead, StatusChip, useToast } from '../components/ui.js';
import { useStore, useWmsState } from '../data/context.js';
import { daysOverdue, missingAccessories } from '../data/selectors.js';
import type { Loan, Unit } from '../data/types.js';
import { addDays, daysBetween, formatDate, formatDateTime, toDateKey } from '../lib/dates.js';
import { NotFound } from './NotFound.js';

type Open = 'approve' | 'reject' | 'cancel' | 'release' | 'receive' | 'extend' | null;

interface Step {
  label: string;
  detail: string;
  state: 'done' | 'current' | 'todo' | 'stopped';
}

/** The loan's path through the lifecycle, with the step that is waiting marked current. */
function buildSteps(loan: Loan, nameOf: (username: string | null) => string): Step[] {
  const stopped = loan.status === 'rejected' || loan.status === 'cancelled';
  const reached = (statuses: Loan['status'][]) => statuses.includes(loan.status);
  const steps: Step[] = [
    {
      label: 'Request filed',
      detail: `${formatDateTime(loan.requestedAt)} by ${nameOf(loan.filedBy)}`,
      state: 'done',
    },
  ];
  if (stopped) {
    steps.push({
      label: loan.status === 'rejected' ? 'Rejected' : 'Cancelled',
      detail: [loan.decidedAt ? formatDateTime(loan.decidedAt) : '', loan.rejectionReason ?? '']
        .filter(Boolean)
        .join(' · '),
      state: 'stopped',
    });
    return steps;
  }
  steps.push({
    label: 'Approved',
    detail: loan.decidedAt
      ? `${formatDateTime(loan.decidedAt)} by ${nameOf(loan.decidedBy)}`
      : 'Waiting for an approver',
    state: loan.decidedAt ? 'done' : 'current',
  });
  steps.push({
    label: 'Released',
    detail: loan.releasedAt
      ? `${formatDateTime(loan.releasedAt)} by ${nameOf(loan.releasedBy)}`
      : 'Unit is scanned out at pickup',
    state: loan.releasedAt ? 'done' : reached(['approved']) ? 'current' : 'todo',
  });
  steps.push({
    label: 'Returned',
    detail: loan.returnedAt
      ? `${formatDateTime(loan.returnedAt)} by ${nameOf(loan.receivedBy)}`
      : `Expected ${formatDate(loan.dueDate)}`,
    state: loan.returnedAt ? 'done' : reached(['released']) ? 'current' : 'todo',
  });
  steps.push({
    label: 'Inspected and closed',
    detail: loan.status === 'closed' ? 'Inspection recorded' : 'Condition check before restocking',
    state: loan.status === 'closed' ? 'done' : reached(['returned']) ? 'current' : 'todo',
  });
  return steps;
}

export function TransactionDetail() {
  const ready = usePageReady();
  const { number = '' } = useParams();
  const state = useWmsState();
  const store = useStore();
  const user = useCurrentUser();
  const { can } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState<Open>(null);
  const today = toDateKey(new Date());

  const loan = state.loans.find((item) => item.number === number);
  const userByName = useMemo(
    () => new Map(state.users.map((item) => [item.username, item])),
    [state.users],
  );
  if (!loan) return <NotFound what={`Transaction ${number} was not found.`} />;

  const unit = state.units.find((item) => item.code === loan.unitCode) ?? null;
  const category = state.categories.find((item) => item.code === loan.categoryCode);
  const nameOf = (username: string | null) =>
    username ? (userByName.get(username)?.name ?? username) : '—';
  const approver = loan.decidedBy ? userByName.get(loan.decidedBy) : undefined;
  const late = daysOverdue(loan, today);
  const missing = missingAccessories(loan);
  const ownRequest = loan.filedBy === user.username;
  const close = () => setOpen(null);
  const steps = buildSteps(loan, nameOf);

  return (
    <div className="page">
      <PageHead
        crumbs={[{ label: 'Borrow / Return', to: '/borrow' }, { label: 'Transaction Details' }]}
        title="Transaction Details"
        actions={
          <>
            {loan.status === 'pending' && can('loan.decide') && (
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
            {(loan.status === 'pending' || loan.status === 'approved') && can('loan.cancel') && (
              <Button icon={Ban} onClick={() => setOpen('cancel')}>
                Cancel request
              </Button>
            )}
            {loan.status === 'approved' && can('loan.release') && (
              <Button variant="primary" icon={Send} onClick={() => setOpen('release')}>
                Release unit
              </Button>
            )}
            {loan.status === 'released' && can('loan.extend') && (
              <Button icon={CalendarClock} onClick={() => setOpen('extend')}>
                Extend
              </Button>
            )}
            {loan.status === 'released' && can('loan.receive') && (
              <Button variant="primary" icon={Undo2} onClick={() => setOpen('receive')}>
                Receive return
              </Button>
            )}
            {loan.status === 'returned' && can('inspection.perform') && (
              <Link to="/inspection" className="btn btn-primary">
                <ClipboardCheck aria-hidden="true" />
                Go to inspection
              </Link>
            )}
          </>
        }
      />

      {!ready ? (
        <SkPage kind="detail" />
      ) : (
        <div className="stack">
          {loan.status === 'pending' && ownRequest && can('loan.decide') && (
            <p className="banner" role="note">
              <Info aria-hidden="true" />
              You filed this request, so another approver must decide it. Switch account from the
              menu at the top right to try it as a different person.
            </p>
          )}
          {late > 0 && (
            <p className="banner" role="alert">
              <CalendarClock aria-hidden="true" />
              This unit is {late} day{late === 1 ? '' : 's'} overdue for return.
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
                    <LoanChip status={loan.status} />
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
                      <dd>{loan.borrower.name}</dd>
                    </div>
                    <div>
                      <dt>Email</dt>
                      <dd>{loan.borrower.email}</dd>
                    </div>
                    <div>
                      <dt>Company</dt>
                      <dd>{loan.borrower.company}</dd>
                    </div>
                    <div>
                      <dt>Contact No.</dt>
                      <dd className="num">{loan.borrower.phone}</dd>
                    </div>
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
                      <dt>Asset Code</dt>
                      <dd>
                        {unit ? (
                          <Link to={`/units/${unit.code}`} className="link mono">
                            {unit.code}
                          </Link>
                        ) : (
                          'Assigned at approval'
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Serial Number</dt>
                      <dd className="mono">{unit?.serial ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Brand / Model</dt>
                      <dd>
                        {loan.brand} {loan.model}
                      </dd>
                    </div>
                    <div>
                      <dt>Category</dt>
                      <dd>{category?.name ?? loan.categoryCode}</dd>
                    </div>
                  </dl>
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
                      <dd className="num">{formatDate(loan.startDate)}</dd>
                    </div>
                    <div>
                      <dt>Expected Return</dt>
                      <dd className="num">
                        {formatDate(loan.dueDate)} ({daysBetween(loan.startDate, loan.dueDate)}{' '}
                        days)
                      </dd>
                    </div>
                    <div>
                      <dt>Approved By</dt>
                      <dd>
                        {approver && loan.status !== 'rejected' ? (
                          <>
                            {approver.name}
                            <span className="cell-sub" style={{ display: 'block' }}>
                              {approver.title}
                            </span>
                          </>
                        ) : (
                          '—'
                        )}
                      </dd>
                    </div>
                    {loan.accessoriesOut.length > 0 && (
                      <div>
                        <dt>Accessories released</dt>
                        <dd>{loan.accessoriesOut.join(', ')}</dd>
                      </div>
                    )}
                    {loan.returnedAt && (
                      <div>
                        <dt>Return remarks</dt>
                        <dd className={missing.length > 0 ? 'late' : undefined}>
                          {loan.returnNote}
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt>Status</dt>
                      <dd>
                        <LoanChip status={loan.status} />
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
                {unit && <StatusChip status={unit.status} reserved={unit.reservedFor !== null} />}
              </div>
              <ol className="steps">
                {steps.map((step, index) => (
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

      {open === 'approve' && <ApproveDialog loan={loan} onClose={close} />}
      {open === 'reject' && (
        <ReasonDialog
          title="Reject this request"
          label="Reason, shown to the person who filed it"
          placeholder="No unit free for these dates…"
          confirmLabel="Reject request"
          danger
          onClose={close}
          onConfirm={(reason) => {
            store.rejectRequest(user.username, loan.number, reason);
            toast(`${loan.number} rejected`);
          }}
        />
      )}
      {open === 'cancel' && (
        <ReasonDialog
          title="Cancel this request"
          description={unit ? `${unit.code} goes back to the available stock.` : undefined}
          label="Reason"
          placeholder="Customer postponed the demo…"
          confirmLabel="Cancel request"
          danger
          onClose={close}
          onConfirm={(reason) => {
            store.cancelRequest(user.username, loan.number, reason);
            toast(`${loan.number} cancelled`);
          }}
        />
      )}
      {open === 'release' && unit && <ReleaseDialog loan={loan} unit={unit} onClose={close} />}
      {open === 'receive' && unit && <ReceiveDialog loan={loan} unit={unit} onClose={close} />}
      {open === 'extend' && <ExtendDialog loan={loan} onClose={close} />}
    </div>
  );
}

function ApproveDialog({ loan, onClose }: { loan: Loan; onClose: () => void }) {
  const store = useStore();
  const state = useWmsState();
  const user = useCurrentUser();
  const toast = useToast();

  const candidates = state.units.filter(
    (unit) =>
      unit.brand === loan.brand &&
      unit.model === loan.model &&
      unit.status === 'in_stock' &&
      !unit.reservedFor,
  );
  const [unitCode, setUnitCode] = useState(candidates[0]?.code ?? '');
  const locationName = new Map(state.locations.map((item) => [item.id, item.name]));

  return (
    <ActionDialog
      title="Approve and assign a unit"
      description={`${loan.borrower.company} asked for a ${loan.brand} ${loan.model}.`}
      confirmLabel="Approve request"
      canConfirm={unitCode !== ''}
      onClose={onClose}
      onConfirm={() => {
        store.approveRequest(user.username, loan.number, unitCode);
        toast(`${loan.number} approved, ${unitCode} reserved`);
      }}
    >
      {candidates.length === 0 ? (
        <p className="banner">
          <Info aria-hidden="true" />
          No {loan.brand} {loan.model} is free right now. Reject the request or wait for a return.
        </p>
      ) : (
        <Field
          label="Unit to reserve"
          hint={`${candidates.length} free unit${candidates.length === 1 ? '' : 's'} of this model`}
        >
          <Select
            value={unitCode}
            onChange={setUnitCode}
            options={candidates.map((unit) => ({
              value: unit.code,
              label: unit.code,
              hint: `${locationName.get(unit.locationId) ?? ''} · condition ${unit.condition}`,
            }))}
          />
        </Field>
      )}
    </ActionDialog>
  );
}

function ReleaseDialog({ loan, unit, onClose }: { loan: Loan; unit: Unit; onClose: () => void }) {
  const store = useStore();
  const user = useCurrentUser();
  const toast = useToast();
  const [scanned, setScanned] = useState('');
  const [accessories, setAccessories] = useState<string[]>(unit.accessories);

  return (
    <ActionDialog
      title="Release unit"
      description={`Hand ${unit.code} to ${loan.borrower.name}, ${loan.borrower.company}.`}
      confirmLabel="Confirm release"
      onClose={onClose}
      onConfirm={() => {
        store.releaseLoan(user.username, loan.number, scanned, accessories);
        toast(`${unit.code} released to ${loan.borrower.company}`);
      }}
    >
      <ScanField expected={unit.code} value={scanned} onChange={setScanned} />
      <AccessoryChecklist
        legend="Accessories going out with the unit"
        items={unit.accessories}
        checked={accessories}
        onChange={setAccessories}
      />
    </ActionDialog>
  );
}

function ReceiveDialog({ loan, unit, onClose }: { loan: Loan; unit: Unit; onClose: () => void }) {
  const store = useStore();
  const user = useCurrentUser();
  const toast = useToast();
  const [scanned, setScanned] = useState('');
  const [back, setBack] = useState<string[]>(loan.accessoriesOut);
  const [note, setNote] = useState('');
  const missing = loan.accessoriesOut.filter((item) => !back.includes(item));

  return (
    <ActionDialog
      title="Receive return"
      description={`${unit.code} coming back from ${loan.borrower.company}.`}
      confirmLabel="Confirm return"
      onClose={onClose}
      onConfirm={() => {
        store.receiveReturn(user.username, loan.number, scanned, back, note);
        toast(
          missing.length > 0
            ? `${unit.code} returned, accessory missing`
            : `${unit.code} returned complete`,
        );
      }}
    >
      <ScanField expected={unit.code} value={scanned} onChange={setScanned} />
      <AccessoryChecklist
        legend="Tick each accessory that came back"
        items={loan.accessoriesOut}
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

function ExtendDialog({ loan, onClose }: { loan: Loan; onClose: () => void }) {
  const store = useStore();
  const { settings } = useWmsState();
  const user = useCurrentUser();
  const toast = useToast();
  const latest = addDays(loan.startDate, settings.maxLoanDays);
  const [dueDate, setDueDate] = useState(
    addDays(loan.dueDate, 7) > latest ? latest : addDays(loan.dueDate, 7),
  );

  return (
    <ActionDialog
      title="Extend this loan"
      description={`Currently due ${formatDate(loan.dueDate)}.`}
      confirmLabel="Extend loan"
      onClose={onClose}
      onConfirm={() => {
        store.extendLoan(user.username, loan.number, dueDate);
        toast(`Return date moved to ${formatDate(dueDate)}`);
      }}
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
    </ActionDialog>
  );
}
