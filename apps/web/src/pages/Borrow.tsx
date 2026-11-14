import { Ban, Plus } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, useCurrentUser } from '../auth/auth.js';
import { DateField, Select, SuggestInput } from '../components/controls.js';
import {
  DataTable,
  runBatch,
  type Column,
  type TableFilter,
} from '../components/DataTable.js';
import { ActionDialog, ReasonDialog } from '../components/dialogs.js';
import {
  Button,
  Field,
  LoanChip,
  PageHead,
  Tabs,
  useToast,
  type TabItem,
} from '../components/ui.js';
import { useStore, useWmsState } from '../data/context.js';
import { daysOverdue, LOAN_STATUS_LABELS, modelAvailability } from '../data/selectors.js';
import { WmsError } from '../data/store.js';
import type { Loan } from '../data/types.js';
import { addDays, daysBetween, formatDate, toDateKey } from '../lib/dates.js';
import { usePageReady } from '../lib/hooks.js';

type TabId = 'requests' | 'on_demo' | 'returned' | 'all';

const TAB_STATUSES: Record<TabId, Loan['status'][] | null> = {
  requests: ['pending', 'approved'],
  on_demo: ['released'],
  returned: ['returned'],
  all: null,
};

function isTabId(value: string | null): value is TabId {
  return value !== null && value in TAB_STATUSES;
}

export function Borrow() {
  const state = useWmsState();
  const { can } = useAuth();
  const navigate = useNavigate();
  const ready = usePageReady();
  const [params, setParams] = useSearchParams();
  const today = toDateKey(new Date());
  const [rejecting, setRejecting] = useState<{ loans: Loan[]; clear: () => void } | null>(null);

  const tabParam = params.get('tab');
  const tab: TabId = isTabId(tabParam) ? tabParam : 'requests';
  const creating = params.get('new') === '1';

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace: true });
  };

  const countFor = (id: TabId) => {
    const statuses = TAB_STATUSES[id];
    return statuses
      ? state.loans.filter((loan) => statuses.includes(loan.status)).length
      : state.loans.length;
  };
  const tabs: TabItem<TabId>[] = [
    { id: 'requests', label: 'Requests', count: countFor('requests') },
    { id: 'on_demo', label: 'On Demo', count: countFor('on_demo') },
    { id: 'returned', label: 'Returned', count: countFor('returned') },
    { id: 'all', label: 'All', count: countFor('all') },
  ];

  const rows = useMemo(() => {
    const statuses = TAB_STATUSES[tab];
    const list = state.loans.filter((loan) => !statuses || statuses.includes(loan.status));
    // Loans out: the most urgent return first. Everything else: newest first.
    return tab === 'on_demo'
      ? list.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      : list.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  }, [state.loans, tab]);

  const columns: Column<Loan>[] = [
    {
      id: 'number',
      header: 'Transaction',
      width: '1.1fr',
      skeleton: 120,
      sort: (loan) => loan.number,
      cell: (loan) => (
        <Link
          to={`/borrow/${loan.number}`}
          className="row-link mono"
          onClick={(event) => event.stopPropagation()}
        >
          {loan.number}
        </Link>
      ),
    },
    {
      id: 'borrower',
      header: 'Borrower',
      width: '1.3fr',
      skeleton: 150,
      sort: (loan) => loan.borrower.name,
      cell: (loan) => (
        <>
          <span className="cell-main">{loan.borrower.name}</span>
          <span className="cell-sub" style={{ display: 'block' }}>
            {loan.borrower.company}
          </span>
        </>
      ),
    },
    {
      id: 'unit',
      header: 'Demo unit',
      width: '1.5fr',
      skeleton: 170,
      sort: (loan) => `${loan.brand} ${loan.model}`,
      cell: (loan) => (
        <>
          {loan.brand} {loan.model}
          <span className="cell-sub mono" style={{ display: 'block' }}>
            {loan.unitCode ?? 'Unit not assigned yet'}
          </span>
        </>
      ),
    },
    {
      id: 'release',
      header: 'Release',
      skeleton: 110,
      className: 'num',
      sort: (loan) => loan.startDate,
      cell: (loan) => formatDate(loan.startDate),
    },
    {
      id: 'due',
      header: 'Expected return',
      width: '0.9fr',
      skeleton: 90,
      className: 'num',
      sort: (loan) => loan.dueDate,
      cell: (loan) => {
        const late = daysOverdue(loan, today);
        return (
          <>
            {formatDate(loan.dueDate)}
            {late > 0 && <span className="late"> · {late}d late</span>}
          </>
        );
      },
    },
    {
      id: 'state',
      header: 'Status',
      width: '0.9fr',
      skeleton: 'chip',
      sort: (loan) => LOAN_STATUS_LABELS[loan.status],
      cell: (loan) => <LoanChip status={loan.status} />,
    },
  ];

  const filters: TableFilter<Loan>[] = [
    {
      id: 'company',
      label: 'Company',
      allLabel: 'All companies',
      options: [...new Set(state.loans.map((loan) => loan.borrower.company))]
        .sort((a, b) => a.localeCompare(b))
        .map((company) => ({ value: company, label: company })),
      test: (loan, value) => loan.borrower.company === value,
    },
    {
      id: 'due',
      label: 'Due date',
      allLabel: 'Any due date',
      options: [
        { value: 'overdue', label: 'Overdue' },
        { value: 'week', label: 'Due within 7 days' },
      ],
      test: (loan, value) => {
        if (loan.status !== 'released') return false;
        const left = daysBetween(today, loan.dueDate);
        return value === 'overdue' ? left < 0 : left >= 0 && left <= 7;
      },
    },
  ];

  return (
    <div className="page">
      <PageHead
        title="Borrow / Return"
        lead="Requests, approvals, releases and returns of demo units"
        actions={
          can('loan.request') && (
            <Button variant="primary" icon={Plus} onClick={() => update({ new: '1' })}>
              New request
            </Button>
          )
        }
      />

      <div className="stack">
        <Tabs
          tabs={tabs}
          value={tab}
          onChange={(next) => update({ tab: next, page: '' })}
          label="Transactions"
        />

        <div className="card table-card">
          {/* Keyed by tab: a selection made in one queue does not carry into another. */}
          <DataTable
            key={tab}
            rows={rows}
            columns={columns}
            rowKey={(loan) => loan.number}
            noun="transactions"
            loading={!ready}
            syncUrl
            search={{
              placeholder: 'Search by transaction, borrower, company, or asset code…',
              text: (loan) =>
                `${loan.number} ${loan.borrower.name} ${loan.borrower.company} ${loan.unitCode ?? ''} ${loan.brand} ${loan.model}`,
            }}
            filters={filters}
            onRowClick={(loan) => void navigate(`/borrow/${loan.number}`)}
            rowClass={(loan) => (daysOverdue(loan, today) > 0 ? 'is-late' : undefined)}
            empty={{
              title: 'No transactions here',
              body: 'New requests appear in this list as soon as they are filed.',
            }}
            batchActions={
              can('loan.decide') && tab === 'requests'
                ? [
                    {
                      label: 'Reject requests',
                      icon: Ban,
                      danger: true,
                      run: (loans, clear) => setRejecting({ loans, clear }),
                    },
                  ]
                : []
            }
            exportCsv={{
              name: 'transactions',
              header: [
                'Transaction',
                'Borrower',
                'Company',
                'Brand',
                'Model',
                'Asset code',
                'Release',
                'Expected return',
                'Status',
              ],
              row: (loan) => [
                loan.number,
                loan.borrower.name,
                loan.borrower.company,
                loan.brand,
                loan.model,
                loan.unitCode ?? '',
                loan.startDate,
                loan.dueDate,
                LOAN_STATUS_LABELS[loan.status],
              ],
            }}
          />
        </div>
      </div>

      {creating && <RequestDialog onClose={() => update({ new: '' })} />}
      {rejecting && (
        <ReasonDialog
          title={`Reject ${rejecting.loans.length} request${rejecting.loans.length === 1 ? '' : 's'}`}
          description="Only requests still waiting for a decision are rejected; the rest are skipped."
          label="Reason"
          placeholder="Shown to the requester"
          confirmLabel="Reject requests"
          danger
          onClose={() => setRejecting(null)}
          onConfirm={(reason) => {
            const result = runBatch(rejecting.loans, (loan) =>
              store.rejectRequest(user.username, loan.number, reason),
            );
            if (result.done === 0) throw new WmsError(result.refused);
            const skipped = rejecting.loans.length - result.done;
            toast(
              skipped === 0
                ? `${result.done} rejected`
                : `${result.done} rejected, ${skipped} skipped`,
            );
            rejecting.clear();
          }}
        />
      )}
    </div>
  );
}

const PURPOSES = [
  'Customer proof of concept',
  'Product demo',
  'Partner training',
  'Customer evaluation',
  'Trade show booth',
  'Presales lab test',
];

function RequestDialog({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const state = useWmsState();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const toast = useToast();
  const today = toDateKey(new Date());
  /** Set once the request is filed: the page has moved on, so closing must not touch its URL. */
  const filed = useRef(false);

  const models = useMemo(() => modelAvailability(state.units), [state.units]);
  const [modelKey, setModelKey] = useState(models.find((item) => item.free > 0)?.key ?? '');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [purpose, setPurpose] = useState(PURPOSES[0] ?? '');
  const [startDate, setStartDate] = useState(today);
  const [dueDate, setDueDate] = useState(addDays(today, state.settings.defaultLoanDays));

  const chosen = models.find((item) => item.key === modelKey);
  const length = startDate && dueDate ? daysBetween(startDate, dueDate) : 0;
  const categoryName = new Map(state.categories.map((item) => [item.code, item.name]));

  /** Companies already on file, offered as suggestions so repeat borrowers are typed once. */
  const knownBorrowers = useMemo(() => {
    const seen = new Map<string, Loan['borrower']>();
    for (const loan of state.loans) seen.set(loan.borrower.company, loan.borrower);
    return seen;
  }, [state.loans]);

  return (
    <ActionDialog
      title="New borrowing request"
      description="The request goes to an approver, who assigns the physical unit."
      confirmLabel="Submit request"
      width={620}
      onClose={() => {
        if (!filed.current) onClose();
      }}
      onConfirm={() => {
        const loan = store.createRequest(user.username, {
          brand: chosen?.brand ?? '',
          model: chosen?.model ?? '',
          borrower: { name, company, email, phone },
          purpose,
          startDate,
          dueDate,
        });
        filed.current = true;
        toast(`${loan.number} submitted for approval`);
        void navigate(`/borrow/${loan.number}`);
      }}
    >
      <div className="form-grid cols-2">
        <Field
          label="Model requested"
          hint={chosen ? `${chosen.free} of ${chosen.total} units free right now` : undefined}
          className="span-2"
        >
          <Select
            value={modelKey}
            onChange={setModelKey}
            options={models.map((item) => ({
              value: item.key,
              label: `${item.brand} ${item.model}`,
              hint: `${categoryName.get(item.categoryCode) ?? item.categoryCode} · ${item.free} free`,
            }))}
          />
        </Field>
        <Field label="Company">
          <SuggestInput
            value={company}
            placeholder="ABC Technologies Inc."
            suggestions={[...knownBorrowers.keys()]}
            onChange={(value) => {
              setCompany(value);
              const known = knownBorrowers.get(value);
              if (known) {
                setName(known.name);
                setEmail(known.email);
                setPhone(known.phone);
              }
            }}
          />
        </Field>
        <Field label="Borrower name">
          <input
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field label="Email">
          <input
            className="input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field label="Contact number">
          <input
            className="input"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field label="Purpose" className="span-2">
          <Select
            value={purpose}
            onChange={setPurpose}
            options={PURPOSES.map((item) => ({ value: item, label: item }))}
          />
        </Field>
        <Field label="Release date">
          <DateField
            ariaLabel="Release date"
            min={today}
            value={startDate}
            onChange={setStartDate}
          />
        </Field>
        <Field
          label="Expected return"
          hint={
            length > 0
              ? `${length} day${length === 1 ? '' : 's'} · maximum ${state.settings.maxLoanDays}`
              : undefined
          }
        >
          <DateField
            ariaLabel="Expected return"
            min={startDate}
            value={dueDate}
            onChange={setDueDate}
          />
        </Field>
      </div>
    </ActionDialog>
  );
}
