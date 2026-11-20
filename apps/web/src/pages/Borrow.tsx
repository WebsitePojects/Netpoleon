import type {
  BulkResult,
  OrgType,
  Transaction,
  TransactionDetail,
  TransactionStage,
} from '@wms/contracts';
import { Ban, Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiSend, exportUrl } from '../api/client.js';
import {
  useAvailability,
  useDebounced,
  useInvalidate,
  usePartner,
  usePartners,
  useStageCounts,
  useTransactions,
} from '../api/queries.js';
import { useAuth, useReference } from '../auth/auth.js';
import { DateField, Select, SuggestInput } from '../components/controls.js';
import {
  DataTable,
  readTableState,
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
import { addDays, daysBetween, formatDate } from '../lib/dates.js';
import { ORG_TYPE_OPTIONS, STAGE_LABELS } from '../lib/labels.js';

type TabId = 'requests' | 'on_demo' | 'returned' | 'all';

const TAB_STAGES: Record<TabId, TransactionStage[] | null> = {
  requests: ['pending', 'approved'],
  on_demo: ['released'],
  returned: ['returned'],
  all: null,
};

const PAGE_SIZE = 10;
const FILTERS = ['company', 'due'] as const;

function isTabId(value: string | null): value is TabId {
  return value !== null && value in TAB_STAGES;
}

export function Borrow() {
  const toast = useToast();
  const { can } = useAuth();
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const [params, setParams] = useSearchParams();
  const [rejecting, setRejecting] = useState<{ loans: Transaction[]; clear: () => void } | null>(
    null,
  );

  const tabParam = params.get('tab');
  const tab: TabId = isTabId(tabParam) ? tabParam : 'requests';
  const creating = params.get('new') === '1';
  const table = readTableState(params, FILTERS);
  const q = useDebounced(table.q.trim());
  const stages = TAB_STAGES[tab];
  // Loans out: the most urgent return first, unless the person chose another order.
  const sort =
    'sort' in table.sort ? table.sort : tab === 'on_demo' ? { sort: 'dueDate', order: 'asc' } : {};
  const query = {
    page: table.page,
    pageSize: PAGE_SIZE,
    q: q || undefined,
    stage: stages ?? undefined,
    company: table.filters.company || undefined,
    due: table.filters.due || undefined,
    ...sort,
  };
  const list = useTransactions(query);
  const counts = useStageCounts().data;
  const companies = usePartners('').data ?? [];

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace: true });
  };

  const countFor = (id: TabId) => {
    if (!counts) return undefined;
    const wanted = TAB_STAGES[id];
    return (wanted ?? (Object.keys(counts) as TransactionStage[])).reduce(
      (sum, stage) => sum + (counts[stage] ?? 0),
      0,
    );
  };
  const tabs: TabItem<TabId>[] = [
    { id: 'requests', label: 'Requests', count: countFor('requests') ?? 0 },
    { id: 'on_demo', label: 'On Demo', count: countFor('on_demo') ?? 0 },
    { id: 'returned', label: 'Returned', count: countFor('returned') ?? 0 },
    { id: 'all', label: 'All', count: countFor('all') ?? 0 },
  ];

  const columns: Column<Transaction>[] = [
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
      id: 'company',
      header: 'Borrower',
      width: '1.3fr',
      skeleton: 150,
      sort: (loan) => loan.company.name,
      cell: (loan) => (
        <>
          <span className="cell-main">{loan.contact.name}</span>
          <span className="cell-sub" style={{ display: 'block' }}>
            {loan.company.name}
          </span>
        </>
      ),
    },
    {
      id: 'unit',
      header: 'Demo unit',
      width: '1.5fr',
      skeleton: 170,
      cell: (loan) => (
        <>
          {loan.model.brand} {loan.model.name}
          {loan.quantityRequested > 1 ? ` × ${loan.quantityRequested}` : ''}
          <span className="cell-sub mono" style={{ display: 'block' }}>
            {loan.unitCodes.length > 0 ? loan.unitCodes.join(', ') : 'Unit not assigned yet'}
          </span>
        </>
      ),
    },
    {
      id: 'neededFrom',
      header: 'Release',
      skeleton: 110,
      className: 'num',
      sort: (loan) => loan.neededFrom,
      cell: (loan) => formatDate(loan.neededFrom),
    },
    {
      id: 'dueDate',
      header: 'Expected return',
      width: '0.9fr',
      skeleton: 90,
      className: 'num',
      sort: (loan) => loan.dueDate,
      cell: (loan) => (
        <>
          {formatDate(loan.dueDate)}
          {loan.daysOverdue > 0 && <span className="late"> · {loan.daysOverdue}d late</span>}
        </>
      ),
    },
    {
      id: 'stage',
      header: 'Status',
      width: '0.9fr',
      skeleton: 'chip',
      cell: (loan) => <LoanChip status={loan.stage} />,
    },
  ];

  const filters: TableFilter<Transaction>[] = [
    {
      id: 'company',
      label: 'Company',
      allLabel: 'All companies',
      options: companies.map((company) => ({ value: company.id, label: company.name })),
      test: () => true,
    },
    {
      id: 'due',
      label: 'Due date',
      allLabel: 'Any due date',
      options: [
        { value: 'overdue', label: 'Overdue' },
        { value: 'week', label: 'Due within 7 days' },
      ],
      test: () => true,
    },
  ];

  const { page: _page, pageSize: _size, ...exportFilters } = query;

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
            rows={list.data?.items ?? []}
            columns={columns}
            rowKey={(loan) => loan.number}
            noun="transactions"
            pageSize={PAGE_SIZE}
            loading={list.isPending}
            syncUrl
            server={{
              total: list.data?.total ?? 0,
              exportHref: exportUrl('/transactions/export.csv', exportFilters),
            }}
            search={{ placeholder: 'Search by transaction, borrower or company…', text: () => '' }}
            filters={filters}
            onRowClick={(loan) => void navigate(`/borrow/${loan.number}`)}
            rowClass={(loan) => (loan.isOverdue ? 'is-late' : undefined)}
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
                'Asset codes',
                'Release',
                'Expected return',
                'Status',
              ],
              row: (loan) => [
                loan.number,
                loan.contact.name,
                loan.company.name,
                loan.model.brand,
                loan.model.name,
                loan.unitCodes.join(' '),
                loan.neededFrom,
                loan.dueDate,
                STAGE_LABELS[loan.stage],
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
          onConfirm={async (reason, key) => {
            const { results } = await apiSend<BulkResult>(
              'POST',
              '/transactions/bulk-reject',
              { numbers: rejecting.loans.map((loan) => loan.number), reason },
              key,
            );
            await invalidate('transactions', 'dashboard');
            const done = results.filter((row) => row.ok).length;
            const skipped = results.length - done;
            if (done === 0) {
              const first = results.find((row) => !row.ok);
              toast(first && !first.ok ? first.message : 'Nothing was rejected', 'error');
              return;
            }
            toast(skipped === 0 ? `${done} rejected` : `${done} rejected, ${skipped} skipped`);
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
  const { models, settings, serverDate, categories } = useReference();
  const navigate = useNavigate();
  const toast = useToast();
  const invalidate = useInvalidate();
  const today = serverDate;
  /** Set once the request is filed: the page has moved on, so closing must not touch its URL. */
  const filed = useRef(false);

  const bookable = models.filter((model) => model.isBookable);
  const [modelId, setModelId] = useState(bookable[0]?.id ?? '');
  const [quantity, setQuantity] = useState(1);
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [companyType, setCompanyType] = useState<OrgType>('partner');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [purpose, setPurpose] = useState(PURPOSES[0] ?? '');
  const [endCustomer, setEndCustomer] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [dueDate, setDueDate] = useState(addDays(today, settings.defaultLoanDays - 1));

  const partners = usePartners(company).data ?? [];
  const known = partners.find((item) => item.name.toLowerCase() === company.trim().toLowerCase());
  // A company on file offers the people it was dealt with before; picking one fills the rest.
  const contacts = usePartner(known?.id ?? null).data?.contacts ?? [];
  const pickName = (value: string) => {
    setName(value);
    const match = contacts.find((item) => item.name.toLowerCase() === value.trim().toLowerCase());
    if (match) {
      setEmail(match.email);
      setPhone(match.phone);
    }
  };
  const settledFrom = useDebounced(startDate);
  const settledUntil = useDebounced(dueDate);
  const availability = useAvailability(settledFrom, settledUntil, true);
  const freeFor = new Map((availability.data?.items ?? []).map((item) => [item.modelId, item]));
  const chosen = freeFor.get(modelId);
  const length = startDate && dueDate ? daysBetween(startDate, dueDate) + 1 : 0;
  const categoryName = new Map(categories.map((item) => [item.id, item.name]));

  const valid =
    modelId !== '' &&
    company.trim() !== '' &&
    name.trim() !== '' &&
    email.includes('@') &&
    phone.trim().length >= 7 &&
    length >= 1 &&
    length <= settings.maxLoanDays;

  return (
    <ActionDialog
      title="New borrowing request"
      description="The request goes to an approver, who assigns the physical units. Pending requests do not hold stock."
      confirmLabel="Submit request"
      width={640}
      canConfirm={valid}
      onClose={() => {
        if (!filed.current) onClose();
      }}
      onConfirm={async (key) => {
        const created = await apiSend<TransactionDetail>(
          'POST',
          '/transactions',
          {
            company: known ? { id: known.id } : { name: company.trim(), type: companyType },
            contact: { name: name.trim(), email: email.trim(), phone: phone.trim() },
            modelId,
            quantity,
            neededFrom: startDate,
            neededUntil: dueDate,
            purpose,
            endCustomer: endCustomer.trim() || null,
          },
          key,
        );
        filed.current = true;
        await invalidate('transactions', 'dashboard');
        toast(`${created.number} submitted for approval`);
        void navigate(`/borrow/${created.number}`);
      }}
    >
      <div className="form-grid cols-2">
        <Field
          label="Model requested"
          hint={
            chosen
              ? `${chosen.unitsFree} of ${chosen.unitsTotal} units free for these dates (subject to approval)`
              : undefined
          }
          className="span-2"
        >
          <Select
            value={modelId}
            onChange={setModelId}
            options={bookable.map((model) => {
              const free = freeFor.get(model.id);
              return {
                value: model.id,
                label: `${model.brand} ${model.name}`,
                hint: `${categoryName.get(model.category.id) ?? model.category.code}${free ? ` · ${free.unitsFree} free` : ''}`,
              };
            })}
          />
        </Field>
        <Field
          label="Company"
          hint={known ? 'On file' : company.trim() ? 'New company: choose its type' : undefined}
        >
          <SuggestInput
            value={company}
            placeholder="ABC Technologies Inc."
            suggestions={partners.map((item) => item.name)}
            onChange={setCompany}
          />
        </Field>
        {!known && company.trim() !== '' && (
          <Field label="Company type">
            <Select
              value={companyType}
              onChange={(value) => setCompanyType(value as OrgType)}
              options={ORG_TYPE_OPTIONS}
            />
          </Field>
        )}
        {
          <Field label="Units">
            <input
              className="input num"
              type="number"
              min={1}
              max={settings.maxUnitsPerRequest}
              value={quantity}
              onChange={(event) =>
                setQuantity(
                  Math.max(
                    1,
                    Math.min(settings.maxUnitsPerRequest, Number(event.target.value) || 1),
                  ),
                )
              }
            />
          </Field>
        }
        <Field
          label="Borrower name"
          hint={contacts.length > 0 ? 'Pick someone on file to fill email and number' : undefined}
        >
          <SuggestInput
            value={name}
            suggestions={contacts.map((item) => item.name)}
            onChange={pickName}
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
        <Field label="End customer" hint="Optional">
          <input
            className="input"
            value={endCustomer}
            onChange={(event) => setEndCustomer(event.target.value)}
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
              ? `${length} day${length === 1 ? '' : 's'} · maximum ${settings.maxLoanDays}`
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
