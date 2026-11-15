import { Boxes, CircleCheck, RotateCcw, Search, Send } from 'lucide-react';
import { useMemo, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SkPage } from '../components/controls.js';
import { DataTable, type Column } from '../components/DataTable.js';
import { useAuth } from '../auth/auth.js';
import { Donut, GroupedBars, HBars, type BarSeries } from '../components/charts.js';
import { PageHead, StatusChip, Tabs, type TabItem } from '../components/ui.js';
import { useWmsState } from '../data/context.js';
import {
  ACTIVE_STATUSES,
  countByStatus,
  MOVEMENT_LABELS,
  movementsByMonth,
  STATUS_LABELS,
} from '../data/selectors.js';
import type { Movement, Unit, WmsState } from '../data/types.js';
import { daysBetween, formatDate, formatMonth, toDateKey } from '../lib/dates.js';
import { usePageReady, useCountUp } from '../lib/hooks.js';

type TabId = 'overview' | 'tracking' | 'borrowers' | 'aging' | 'utilization';

const TABS: TabItem<TabId>[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'tracking', label: 'Tracking record' },
  { id: 'borrowers', label: 'Borrower history' },
  { id: 'aging', label: 'Aging and condition' },
  { id: 'utilization', label: 'Utilization' },
];

const MOVEMENT_SERIES: BarSeries[] = [
  { key: 'released', label: 'Released', color: 'var(--st-total)' },
  { key: 'returned', label: 'Returned', color: 'var(--st-in_stock)' },
  { key: 'restocked', label: 'Restocked', color: 'var(--st-on_demo)' },
  { key: 'inspection', label: 'Under Inspection', color: 'var(--st-under_inspection)' },
];

const REPORT_MONTHS = 7;
const PAGE_SIZE = 12;
const IDLE_PAGE_SIZE = 8;

/** Movement types the tracking record lists; shelf moves and reservations are left out. */
const TRACKED: Movement['type'][] = [
  'released',
  'returned',
  'inspection_started',
  'restocked',
  'sent_to_repair',
  'repaired',
  'registered',
];

function isTabId(value: string | null): value is TabId {
  return TABS.some((tab) => tab.id === value);
}

function Figure({
  label,
  value,
  color,
  icon: Icon,
}: {
  label: string;
  value: number;
  color: string;
  icon: typeof Boxes;
}) {
  const shown = useCountUp(value);
  return (
    <div className="figure">
      <span>
        <Icon aria-hidden="true" width={15} height={15} style={{ color }} />
        {label}
      </span>
      <strong className="num">{shown}</strong>
    </div>
  );
}

export function Reports() {
  const ready = usePageReady();
  const state = useWmsState();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab');
  const tab: TabId = isTabId(tabParam) ? tabParam : 'overview';
  const now = useMemo(() => new Date(), []);

  return (
    <div className="page">
      <PageHead
        title="Reports"
        lead={`Demo equipment movements, status and accountability · as of ${formatDate(toDateKey(now))}`}
      />
      {!ready ? (
        <SkPage kind="reports" />
      ) : (
        <div className="stack">
          <Tabs
            tabs={TABS}
            value={tab}
            onChange={(next) => setParams({ tab: next }, { replace: true })}
            label="Reports"
          />
          {tab === 'overview' && <Overview state={state} now={now} />}
          {tab === 'tracking' && <Tracking state={state} />}
          {tab === 'borrowers' && <Borrowers state={state} now={now} />}
          {tab === 'aging' && <Aging state={state} now={now} />}
          {tab === 'utilization' && <Utilization state={state} />}
        </div>
      )}
    </div>
  );
}

function Overview({ state, now }: { state: WmsState; now: Date }) {
  const counts = useMemo(() => countByStatus(state.units), [state.units]);
  const monthly = useMemo(
    () => movementsByMonth(state.movements, now, REPORT_MONTHS),
    [state.movements, now],
  );
  const groups = monthly.map((row) => ({
    label: formatMonth(row.month),
    values: {
      released: row.released,
      returned: row.returned,
      restocked: row.restocked,
      inspection: row.inspection,
    },
  }));
  const slices = ACTIVE_STATUSES.map((status) => ({
    label: STATUS_LABELS[status],
    value: counts[status],
    color: `var(--st-${status})`,
  }));
  const busiest = [...monthly].sort((a, b) => b.released - a.released)[0];

  return (
    <>
      <section className="card figures" aria-label="Key figures">
        <Figure label="Total Assets" value={counts.total} color="var(--st-total)" icon={Boxes} />
        <Figure
          label="Available"
          value={counts.in_stock}
          color="var(--st-in_stock)"
          icon={CircleCheck}
        />
        <Figure label="On Demo" value={counts.on_demo} color="var(--st-on_demo)" icon={Send} />
        <Figure
          label="Returned"
          value={counts.returned}
          color="var(--st-returned)"
          icon={RotateCcw}
        />
        <Figure
          label="Under Inspection"
          value={counts.under_inspection}
          color="var(--st-under_inspection)"
          icon={Search}
        />
      </section>
      <div className="grid-2">
        <section className="card" aria-labelledby="movement-title">
          <div className="card-head">
            <h2 id="movement-title">Equipment Movement Report</h2>
            {busiest && (
              <span className="muted">
                Busiest month: {formatMonth(busiest.month)},{' '}
                <span className="num">{busiest.released}</span> releases
              </span>
            )}
          </div>
          <GroupedBars
            series={MOVEMENT_SERIES}
            groups={groups}
            label={`Movements per month for the last ${REPORT_MONTHS} months`}
          />
        </section>
        <section className="card" aria-labelledby="inventory-title">
          <div className="card-head">
            <h2 id="inventory-title">Inventory Status Report</h2>
          </div>
          <Donut slices={slices} centerLabel="Total Assets" />
        </section>
      </div>
    </>
  );
}

function Tracking({ state }: { state: WmsState }) {
  const loanByNumber = useMemo(
    () => new Map(state.loans.map((loan) => [loan.number, loan])),
    [state.loans],
  );
  const rows = useMemo(
    () => state.movements.filter((movement) => TRACKED.includes(movement.type)).reverse(),
    [state.movements],
  );
  const partnerOf = (movement: Movement) =>
    movement.type === 'released' || movement.type === 'returned'
      ? (loanByNumber.get(movement.loanNumber ?? '')?.borrower.company ?? 'Internal (Warehouse)')
      : 'Internal (Warehouse)';

  const columns: Column<Movement>[] = [
    {
      id: 'date',
      header: 'Date',
      className: 'num',
      skeleton: 90,
      sort: (movement) => movement.at,
      cell: (movement) => formatDate(movement.at),
    },
    {
      id: 'type',
      header: 'Transaction',
      skeleton: 110,
      sort: (movement) => MOVEMENT_LABELS[movement.type],
      cell: (movement) => <span className="cell-main">{MOVEMENT_LABELS[movement.type]}</span>,
    },
    {
      id: 'partner',
      header: 'Borrower / Partner',
      width: '1.3fr',
      skeleton: 140,
      sort: partnerOf,
      cell: partnerOf,
    },
    {
      id: 'unit',
      header: 'Asset Code',
      skeleton: 110,
      sort: (movement) => movement.unitCode,
      cell: (movement) => (
        <Link to={`/units/${movement.unitCode}`} className="row-link mono">
          {movement.unitCode}
        </Link>
      ),
    },
    {
      id: 'state',
      header: 'Status',
      skeleton: 'chip',
      sort: (movement) => STATUS_LABELS[movement.toStatus],
      cell: (movement) => <StatusChip status={movement.toStatus} />,
    },
    {
      id: 'note',
      header: 'Remarks',
      width: '1.4fr',
      skeleton: 160,
      cell: (movement) => movement.note,
    },
  ];

  return (
    <section className="card table-card" aria-labelledby="tracking-title">
      <div className="card-head" style={{ paddingBottom: 14 }}>
        <h2 id="tracking-title">Demo Unit Tracking Record</h2>
      </div>
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(movement) => String(movement.id)}
        noun="movements"
        pageSize={PAGE_SIZE}
        syncUrl
        search={{
          placeholder: 'Search by asset code, partner, or remark…',
          text: (movement) =>
            `${movement.unitCode} ${partnerOf(movement)} ${movement.note} ${movement.loanNumber ?? ''}`,
        }}
        filters={[
          {
            id: 'type',
            label: 'Transaction',
            allLabel: 'All transactions',
            options: TRACKED.map((type) => ({ value: type, label: MOVEMENT_LABELS[type] })),
            test: (movement, value) => movement.type === value,
          },
          {
            id: 'status',
            label: 'Status',
            allLabel: 'All statuses',
            options: ACTIVE_STATUSES.map((status) => ({
              value: status,
              label: STATUS_LABELS[status],
            })),
            test: (movement, value) => movement.toStatus === value,
          },
        ]}
        exportCsv={{
          name: 'tracking-record',
          header: ['Date', 'Transaction', 'Borrower / Partner', 'Asset code', 'Status', 'Remarks'],
          row: (movement) => [
            movement.at,
            MOVEMENT_LABELS[movement.type],
            partnerOf(movement),
            movement.unitCode,
            STATUS_LABELS[movement.toStatus],
            movement.note,
          ],
        }}
      />
    </section>
  );
}

interface PartnerRow {
  company: string;
  loans: number;
  open: number;
  overdue: number;
  missing: number;
  last: string;
}

function Borrowers({ state, now }: { state: WmsState; now: Date }) {
  const today = toDateKey(now);
  const rows = useMemo(() => {
    const byCompany = new Map<string, PartnerRow>();
    for (const loan of state.loans) {
      if (!loan.releasedAt) continue;
      const row = byCompany.get(loan.borrower.company) ?? {
        company: loan.borrower.company,
        loans: 0,
        open: 0,
        overdue: 0,
        missing: 0,
        last: loan.startDate,
      };
      row.loans += 1;
      if (loan.status === 'released') {
        row.open += 1;
        if (loan.dueDate < today) row.overdue += 1;
      }
      if (loan.returnedAt && loan.accessoriesBack.length < loan.accessoriesOut.length)
        row.missing += 1;
      if (loan.startDate > row.last) row.last = loan.startDate;
      byCompany.set(row.company, row);
    }
    return [...byCompany.values()].sort((a, b) => b.loans - a.loans);
  }, [state.loans, today]);

  const count = (id: string, header: string, value: (row: PartnerRow) => number) => ({
    id,
    header,
    align: 'right' as const,
    width: '0.8fr',
    skeleton: 40,
    className: 'num',
    sort: value,
    cell: value,
  });
  const columns: Column<PartnerRow>[] = [
    {
      id: 'company',
      header: 'Company',
      width: '1.6fr',
      skeleton: 160,
      sort: (row) => row.company,
      cell: (row) => (
        <Link to={`/borrow?tab=all&q=${encodeURIComponent(row.company)}`} className="row-link">
          {row.company}
        </Link>
      ),
    },
    count('loans', 'Loans', (row) => row.loans),
    count('open', 'On demo now', (row) => row.open),
    {
      ...count('overdue', 'Overdue', (row) => row.overdue),
      className: (row) => (row.overdue > 0 ? 'num late' : 'num'),
    },
    count('missing', 'Missing accessory', (row) => row.missing),
    {
      id: 'last',
      header: 'Last release',
      align: 'right',
      skeleton: 90,
      className: 'num',
      sort: (row) => row.last,
      cell: (row) => formatDate(row.last),
    },
  ];

  return (
    <section className="card table-card" aria-labelledby="borrowers-title">
      <div className="card-head" style={{ paddingBottom: 14 }}>
        <h2 id="borrowers-title">Borrowing and Return History by Partner</h2>
      </div>
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(row) => row.company}
        noun="partners"
        pageSize={PAGE_SIZE}
        syncUrl
        rowClass={(row) => (row.overdue > 0 ? 'is-late' : undefined)}
        search={{ placeholder: 'Search by company…', text: (row) => row.company }}
        filters={[
          {
            id: 'standing',
            label: 'Standing',
            allLabel: 'All partners',
            options: [
              { value: 'open', label: 'Has a unit on demo' },
              { value: 'overdue', label: 'Has an overdue return' },
              { value: 'missing', label: 'Returned with a missing accessory' },
            ],
            test: (row, value) =>
              value === 'open'
                ? row.open > 0
                : value === 'overdue'
                  ? row.overdue > 0
                  : row.missing > 0,
          },
        ]}
        exportCsv={{
          name: 'borrower-history',
          header: [
            'Company',
            'Loans',
            'On demo now',
            'Overdue',
            'Returns with missing accessory',
            'Last release',
          ],
          row: (row) => [row.company, row.loans, row.open, row.overdue, row.missing, row.last],
        }}
      />
    </section>
  );
}

interface IdleRow {
  unit: Unit;
  days: number;
}

const AGE_BANDS: { label: string; maxDays: number }[] = [
  { label: 'Under 6 months', maxDays: 182 },
  { label: '6 to 12 months', maxDays: 365 },
  { label: '12 to 18 months', maxDays: 547 },
  { label: 'Over 18 months', maxDays: Number.POSITIVE_INFINITY },
];

function Aging({ state, now }: { state: WmsState; now: Date }) {
  const today = toDateKey(now);
  const live = useMemo(
    () => state.units.filter((unit) => unit.status !== 'retired'),
    [state.units],
  );
  const ages = AGE_BANDS.map((band, index) => {
    const min = index === 0 ? -1 : (AGE_BANDS[index - 1]?.maxDays ?? 0);
    const value = live.filter((unit) => {
      const days = daysBetween(toDateKey(new Date(unit.registeredAt)), today);
      return days > min && days <= band.maxDays;
    }).length;
    return { label: band.label, value };
  });
  const grades = (['A', 'B', 'C'] as const).map((grade) => ({
    label: { A: 'A · Like new', B: 'B · Light wear', C: 'C · Heavy wear' }[grade],
    value: live.filter((unit) => unit.condition === grade).length,
    color: { A: 'var(--st-in_stock)', B: 'var(--st-on_demo)', C: 'var(--st-under_inspection)' }[
      grade
    ],
  }));
  /** Units sitting in stock since their last movement, longest first: candidates to redeploy. */
  const idle = useMemo(() => {
    const lastAt = new Map<string, string>();
    for (const movement of state.movements) lastAt.set(movement.unitCode, movement.at);
    return live
      .filter((unit) => unit.status === 'in_stock' && !unit.reservedFor)
      .map((unit) => ({
        unit,
        days: daysBetween(toDateKey(new Date(lastAt.get(unit.code) ?? unit.registeredAt)), today),
      }))
      .sort((a, b) => b.days - a.days);
  }, [live, state.movements, today]);

  const idleColumns: Column<IdleRow>[] = [
    {
      id: 'code',
      header: 'Asset Code',
      skeleton: 110,
      sort: ({ unit }) => unit.code,
      cell: ({ unit }) => (
        <Link to={`/units/${unit.code}`} className="row-link mono">
          {unit.code}
        </Link>
      ),
    },
    {
      id: 'model',
      header: 'Brand / Model',
      width: '1.5fr',
      skeleton: 150,
      sort: ({ unit }) => `${unit.brand} ${unit.model}`,
      cell: ({ unit }) => `${unit.brand} ${unit.model}`,
    },
    {
      id: 'grade',
      header: 'Condition',
      width: '0.7fr',
      skeleton: 30,
      sort: ({ unit }) => unit.condition,
      cell: ({ unit }) => unit.condition,
    },
    {
      id: 'days',
      header: 'Days idle',
      align: 'right',
      width: '0.7fr',
      skeleton: 40,
      className: 'num',
      sort: ({ days }) => days,
      cell: ({ days }) => days,
    },
  ];

  return (
    <>
      <div className="grid-2 even">
        <section className="card" aria-labelledby="age-title">
          <div className="card-head">
            <h2 id="age-title">Asset age since registration</h2>
          </div>
          <HBars rows={ages} />
        </section>
        <section className="card" aria-labelledby="grade-title">
          <div className="card-head">
            <h2 id="grade-title">Condition grade</h2>
          </div>
          <HBars rows={grades} />
        </section>
      </div>
      <section className="card table-card" aria-labelledby="idle-title">
        <div className="card-head" style={{ paddingBottom: 14 }}>
          <h2 id="idle-title">Longest idle in stock</h2>
          <span className="muted">Candidates for redeployment</span>
        </div>
        <DataTable
          rows={idle}
          columns={idleColumns}
          rowKey={({ unit }) => unit.code}
          noun="idle units"
          pageSize={IDLE_PAGE_SIZE}
          syncUrl
          empty={{ title: 'No idle stock', body: 'Every unit in stock moved recently.' }}
          search={{
            placeholder: 'Search by asset code or model…',
            text: ({ unit }) => `${unit.code} ${unit.brand} ${unit.model}`,
          }}
          filters={[
            {
              id: 'category',
              label: 'Category',
              allLabel: 'All categories',
              options: state.categories.map((item) => ({ value: item.code, label: item.name })),
              test: ({ unit }, value) => unit.categoryCode === value,
            },
            {
              id: 'grade',
              label: 'Condition',
              allLabel: 'All grades',
              options: [
                { value: 'A', label: 'A · Like new' },
                { value: 'B', label: 'B · Light wear' },
                { value: 'C', label: 'C · Heavy wear' },
              ],
              test: ({ unit }, value) => unit.condition === value,
            },
          ]}
          exportCsv={{
            name: 'idle-stock',
            header: ['Asset code', 'Brand', 'Model', 'Condition', 'Days idle'],
            row: ({ unit, days }) => [unit.code, unit.brand, unit.model, unit.condition, days],
          }}
        />
      </section>
    </>
  );
}

function Utilization({ state }: { state: WmsState }) {
  const rows = useMemo(
    () =>
      state.categories
        .map((category) => {
          const units = state.units.filter(
            (unit) => unit.categoryCode === category.code && unit.status !== 'retired',
          );
          const deployed = units.filter((unit) => unit.status === 'on_demo').length;
          const available = units.filter((unit) => unit.status === 'in_stock').length;
          return { category, total: units.length, deployed, available };
        })
        .filter((row) => row.total > 0),
    [state.categories, state.units],
  );
  type UtilRow = (typeof rows)[number];
  const share = (row: UtilRow) => Math.round((row.deployed / row.total) * 100);
  const utilColumns: Column<UtilRow>[] = [
    {
      id: 'category',
      header: 'Category',
      width: '1.3fr',
      skeleton: 120,
      sort: (row) => row.category.name,
      cell: (row) => (
        <Link to={`/units?category=${row.category.code}`} className="row-link">
          {row.category.name}
        </Link>
      ),
    },
    {
      id: 'total',
      header: 'Units',
      align: 'right',
      className: 'num',
      sort: (row) => row.total,
      cell: (row) => row.total,
    },
    {
      id: 'available',
      header: 'Available',
      align: 'right',
      className: 'num',
      sort: (row) => row.available,
      cell: (row) => row.available,
    },
    {
      id: 'deployed',
      header: 'On demo',
      align: 'right',
      className: 'num',
      sort: (row) => row.deployed,
      cell: (row) => row.deployed,
    },
    {
      id: 'share',
      header: 'Utilization',
      width: '1.6fr',
      sort: share,
      cell: (row) => (
        <span className="row" style={{ gap: 10, flexWrap: 'nowrap', minWidth: 140 }}>
          <span className="hbar-track" style={{ flex: 1 }}>
            <span
              className="hbar-fill"
              style={
                {
                  '--w': `${share(row)}%`,
                  '--i': rows.indexOf(row),
                  '--c': 'var(--st-on_demo)',
                  display: 'block',
                } as CSSProperties
              }
            />
          </span>
          <b className="num">{share(row)}%</b>
        </span>
      ),
    },
  ];

  return (
    <section className="card table-card" aria-labelledby="util-title">
      <div className="card-head" style={{ paddingBottom: 14 }}>
        <h2 id="util-title">Available vs deployed by category</h2>
        <span className="muted">Share of each category on demo right now</span>
      </div>
      <DataTable
        rows={rows}
        columns={utilColumns}
        rowKey={(row) => row.category.code}
        noun="categories"
        exportCsv={{
          name: 'utilization',
          header: ['Category', 'Units', 'Available', 'On demo', 'Utilization %'],
          row: (row) => [
            row.category.name,
            row.total,
            row.available,
            row.deployed,
            Math.round((row.deployed / row.total) * 100),
          ],
        }}
      />
    </section>
  );
}
