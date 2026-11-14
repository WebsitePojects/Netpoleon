import { Boxes, CircleCheck, Download, RotateCcw, Search, Send } from 'lucide-react';
import { useMemo, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SkPage } from '../components/controls.js';
import { useAuth } from '../auth/auth.js';
import { Donut, GroupedBars, HBars, type BarSeries } from '../components/charts.js';
import {
  Button,
  Empty,
  PageHead,
  StatusChip,
  TableFoot,
  Tabs,
  type TabItem,
} from '../components/ui.js';
import { useWmsState } from '../data/context.js';
import {
  ACTIVE_STATUSES,
  countByStatus,
  MOVEMENT_LABELS,
  movementsByMonth,
  STATUS_LABELS,
} from '../data/selectors.js';
import type { Movement, WmsState } from '../data/types.js';
import { downloadCsv } from '../lib/csv.js';
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
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab');
  const tab: TabId = isTabId(tabParam) ? tabParam : 'overview';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const now = useMemo(() => new Date(), []);

  const setPage = (next: number) => {
    const updated = new URLSearchParams(params);
    if (next === 1) updated.delete('page');
    else updated.set('page', String(next));
    setParams(updated, { replace: true });
  };

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
          {tab === 'tracking' && (
            <Tracking
              state={state}
              page={page}
              onPage={setPage}
              canExport={can('reports.export')}
            />
          )}
          {tab === 'borrowers' && (
            <Borrowers state={state} now={now} canExport={can('reports.export')} />
          )}
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

function Tracking({
  state,
  page,
  onPage,
  canExport,
}: {
  state: WmsState;
  page: number;
  onPage: (page: number) => void;
  canExport: boolean;
}) {
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

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const visible = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <section className="card table-card" aria-labelledby="tracking-title">
      <div className="card-head" style={{ paddingBottom: 14 }}>
        <h2 id="tracking-title">Demo Unit Tracking Record</h2>
        {canExport && (
          <Button
            size="sm"
            icon={Download}
            onClick={() =>
              downloadCsv(
                `tracking-record-${toDateKey(new Date())}.csv`,
                ['Date', 'Transaction', 'Borrower / Partner', 'Asset code', 'Status', 'Remarks'],
                rows.map((movement) => [
                  movement.at,
                  MOVEMENT_LABELS[movement.type],
                  partnerOf(movement),
                  movement.unitCode,
                  STATUS_LABELS[movement.toStatus],
                  movement.note,
                ]),
              )
            }
          >
            Export CSV
          </Button>
        )}
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Transaction</th>
            <th>Borrower / Partner</th>
            <th>Asset Code</th>
            <th>Status</th>
            <th>Remarks</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((movement) => (
            <tr key={movement.id}>
              <td data-label="Date" className="num">
                {formatDate(movement.at)}
              </td>
              <td data-label="Transaction">
                <span className="cell-main">{MOVEMENT_LABELS[movement.type]}</span>
              </td>
              <td data-label="Borrower / Partner">{partnerOf(movement)}</td>
              <td data-label="Asset Code">
                <Link to={`/units/${movement.unitCode}`} className="row-link mono">
                  {movement.unitCode}
                </Link>
              </td>
              <td data-label="Status">
                <StatusChip status={movement.toStatus} />
              </td>
              <td data-label="Remarks">{movement.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <TableFoot
        page={current}
        pageSize={PAGE_SIZE}
        total={rows.length}
        noun="movements"
        onPage={onPage}
      />
    </section>
  );
}

function Borrowers({ state, now, canExport }: { state: WmsState; now: Date; canExport: boolean }) {
  const today = toDateKey(now);
  const rows = useMemo(() => {
    const byCompany = new Map<
      string,
      {
        company: string;
        loans: number;
        open: number;
        overdue: number;
        missing: number;
        last: string;
      }
    >();
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

  return (
    <section className="card table-card" aria-labelledby="borrowers-title">
      <div className="card-head" style={{ paddingBottom: 14 }}>
        <h2 id="borrowers-title">Borrowing and Return History by Partner</h2>
        {canExport && (
          <Button
            size="sm"
            icon={Download}
            onClick={() =>
              downloadCsv(
                `borrower-history-${today}.csv`,
                [
                  'Company',
                  'Loans',
                  'On demo now',
                  'Overdue',
                  'Returns with missing accessory',
                  'Last release',
                ],
                rows.map((row) => [
                  row.company,
                  row.loans,
                  row.open,
                  row.overdue,
                  row.missing,
                  row.last,
                ]),
              )
            }
          >
            Export CSV
          </Button>
        )}
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Company</th>
            <th className="right">Loans</th>
            <th className="right">On demo now</th>
            <th className="right">Overdue</th>
            <th className="right">Missing accessory</th>
            <th className="right">Last release</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.company} className={row.overdue > 0 ? 'is-late' : undefined}>
              <td data-label="Company">
                <Link
                  to={`/borrow?tab=all&q=${encodeURIComponent(row.company)}`}
                  className="row-link"
                >
                  {row.company}
                </Link>
              </td>
              <td data-label="Loans" className="right num">
                {row.loans}
              </td>
              <td data-label="On demo now" className="right num">
                {row.open}
              </td>
              <td data-label="Overdue" className={row.overdue > 0 ? 'right num late' : 'right num'}>
                {row.overdue}
              </td>
              <td data-label="Missing accessory" className="right num">
                {row.missing}
              </td>
              <td data-label="Last release" className="right num">
                {formatDate(row.last)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
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
  /** Units sitting in stock the longest since their last movement: candidates to redeploy. */
  const idle = useMemo(() => {
    const lastAt = new Map<string, string>();
    for (const movement of state.movements) lastAt.set(movement.unitCode, movement.at);
    return live
      .filter((unit) => unit.status === 'in_stock' && !unit.reservedFor)
      .map((unit) => ({
        unit,
        days: daysBetween(toDateKey(new Date(lastAt.get(unit.code) ?? unit.registeredAt)), today),
      }))
      .sort((a, b) => b.days - a.days)
      .slice(0, 8);
  }, [live, state.movements, today]);

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
        {idle.length === 0 ? (
          <Empty title="No idle stock" />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Asset Code</th>
                <th>Brand / Model</th>
                <th>Condition</th>
                <th className="right">Days idle</th>
              </tr>
            </thead>
            <tbody>
              {idle.map(({ unit, days }) => (
                <tr key={unit.code}>
                  <td data-label="Asset Code">
                    <Link to={`/units/${unit.code}`} className="row-link mono">
                      {unit.code}
                    </Link>
                  </td>
                  <td data-label="Brand / Model">
                    {unit.brand} {unit.model}
                  </td>
                  <td data-label="Condition">{unit.condition}</td>
                  <td data-label="Days idle" className="right num">
                    {days}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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

  return (
    <section className="card table-card" aria-labelledby="util-title">
      <div className="card-head" style={{ paddingBottom: 14 }}>
        <h2 id="util-title">Available vs deployed by category</h2>
        <span className="muted">Share of each category on demo right now</span>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Category</th>
            <th className="right">Units</th>
            <th className="right">Available</th>
            <th className="right">On demo</th>
            <th>Utilization</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const share = Math.round((row.deployed / row.total) * 100);
            return (
              <tr key={row.category.code}>
                <td data-label="Category">
                  <Link to={`/units?category=${row.category.code}`} className="row-link">
                    {row.category.name}
                  </Link>
                </td>
                <td data-label="Units" className="right num">
                  {row.total}
                </td>
                <td data-label="Available" className="right num">
                  {row.available}
                </td>
                <td data-label="On demo" className="right num">
                  {row.deployed}
                </td>
                <td data-label="Utilization">
                  <span className="row" style={{ gap: 10, flexWrap: 'nowrap', minWidth: 140 }}>
                    <span className="hbar-track" style={{ flex: 1 }}>
                      <span
                        className="hbar-fill"
                        style={
                          {
                            '--w': `${share}%`,
                            '--i': index,
                            '--c': 'var(--st-on_demo)',
                            display: 'block',
                          } as CSSProperties
                        }
                      />
                    </span>
                    <b className="num">{share}%</b>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
