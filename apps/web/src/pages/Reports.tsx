import type {
  Aging as AgingData,
  BorrowerRow,
  MovementType,
  Overview as OverviewData,
  UtilizationRow,
} from '@wms/contracts';
import { Boxes, CircleCheck, Download, RotateCcw, Search, Send } from 'lucide-react';
import { type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { exportUrl } from '../api/client.js';
import { useReport, useTracking } from '../api/queries.js';
import { useAuth, useReference } from '../auth/auth.js';
import { Donut, GroupedBars, HBars, type BarSeries } from '../components/charts.js';
import { SkPage } from '../components/controls.js';
import {
  Button,
  Empty,
  PageHead,
  StatusChip,
  TableFoot,
  Tabs,
  type TabItem,
} from '../components/ui.js';
import { addDays, formatDate, formatMonth } from '../lib/dates.js';
import { useCountUp } from '../lib/hooks.js';
import {
  ACTIVE_STATUSES,
  CONDITION_LABELS,
  MOVEMENT_LABELS,
  STATUS_LABELS,
} from '../lib/labels.js';

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
/** The tracking record and borrower history look back this far by default. */
const TRACKING_DAYS = 90;
const BORROWER_DAYS = 365;

/** Movement types the tracking record lists; shelf moves are left out. */
const TRACKED: MovementType[] = [
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
  const { can } = useAuth();
  const { serverDate } = useReference();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab');
  const tab: TabId = isTabId(tabParam) ? tabParam : 'overview';
  const page = Math.max(1, Number(params.get('page')) || 1);

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
        lead={`Demo equipment movements, status and accountability · as of ${formatDate(serverDate)}`}
      />
      <div className="stack">
        <Tabs
          tabs={TABS}
          value={tab}
          onChange={(next) => setParams({ tab: next }, { replace: true })}
          label="Reports"
        />
        {tab === 'overview' && <Overview />}
        {tab === 'tracking' && (
          <Tracking
            today={serverDate}
            page={page}
            onPage={setPage}
            canExport={can('reports.export')}
          />
        )}
        {tab === 'borrowers' && <Borrowers today={serverDate} canExport={can('reports.export')} />}
        {tab === 'aging' && <Aging />}
        {tab === 'utilization' && <Utilization />}
      </div>
    </div>
  );
}

function Overview() {
  const report = useReport<OverviewData>('overview', { months: REPORT_MONTHS });
  if (!report.data) return <SkPage kind="reports" />;
  const { counts, monthly } = report.data;
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
            {busiest && busiest.released > 0 && (
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
  today,
  page,
  onPage,
  canExport,
}: {
  today: string;
  page: number;
  onPage: (page: number) => void;
  canExport: boolean;
}) {
  const range = { from: addDays(today, -TRACKING_DAYS), until: today };
  const report = useTracking({ ...range, type: TRACKED, page, pageSize: PAGE_SIZE });
  const rows = report.data?.items ?? [];

  return (
    <section className="card table-card" aria-labelledby="tracking-title">
      <div className="card-head" style={{ paddingBottom: 14 }}>
        <h2 id="tracking-title">Demo Unit Tracking Record</h2>
        <span className="muted">Last {TRACKING_DAYS} days</span>
        {canExport && (
          <Button
            size="sm"
            icon={Download}
            onClick={() =>
              window.location.assign(
                exportUrl('/transactions/export.csv', { sort: 'requestedAt', order: 'desc' }),
              )
            }
          >
            Export transactions
          </Button>
        )}
      </div>
      {!report.data ? (
        <SkPage kind="reports" />
      ) : rows.length === 0 ? (
        <Empty title="No movements in this period" />
      ) : (
        <>
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Movement</th>
                <th>Transaction</th>
                <th>Asset Code</th>
                <th>Status</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((movement) => (
                <tr key={movement.id}>
                  <td data-label="Date" className="num">
                    {formatDate(movement.at)}
                  </td>
                  <td data-label="Movement">
                    <span className="cell-main">{MOVEMENT_LABELS[movement.type]}</span>
                    <span className="cell-sub">{movement.by?.name ?? 'System'}</span>
                  </td>
                  <td data-label="Transaction">
                    {movement.transactionNumber ? (
                      <Link to={`/borrow/${movement.transactionNumber}`} className="link mono">
                        {movement.transactionNumber}
                      </Link>
                    ) : (
                      'Internal (Warehouse)'
                    )}
                  </td>
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
            page={page}
            pageSize={PAGE_SIZE}
            total={report.data.total}
            noun="movements"
            onPage={onPage}
          />
        </>
      )}
    </section>
  );
}

function Borrowers({ today, canExport }: { today: string; canExport: boolean }) {
  const range = { from: addDays(today, -BORROWER_DAYS), until: today };
  const report = useReport<BorrowerRow[]>('borrowers', range);
  const rows = report.data ?? [];

  return (
    <section className="card table-card" aria-labelledby="borrowers-title">
      <div className="card-head" style={{ paddingBottom: 14 }}>
        <h2 id="borrowers-title">Borrowing and Return History by Partner</h2>
        <span className="muted">Releases in the last 12 months</span>
        {canExport && (
          <Button
            size="sm"
            icon={Download}
            onClick={() => window.location.assign(exportUrl('/reports/borrowers.csv', range))}
          >
            Export CSV
          </Button>
        )}
      </div>
      {!report.data ? (
        <SkPage kind="reports" />
      ) : rows.length === 0 ? (
        <Empty title="No releases in this period" />
      ) : (
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
              <tr key={row.companyId} className={row.overdue > 0 ? 'is-late' : undefined}>
                <td data-label="Company">
                  <Link to={`/borrow?tab=all&company=${row.companyId}`} className="row-link">
                    {row.company}
                  </Link>
                </td>
                <td data-label="Loans" className="right num">
                  {row.loans}
                </td>
                <td data-label="On demo now" className="right num">
                  {row.open}
                </td>
                <td
                  data-label="Overdue"
                  className={row.overdue > 0 ? 'right num late' : 'right num'}
                >
                  {row.overdue}
                </td>
                <td data-label="Missing accessory" className="right num">
                  {row.missing}
                </td>
                <td data-label="Last release" className="right num">
                  {formatDate(row.lastBorrowed)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

const GRADE_COLOURS = {
  a: 'var(--st-in_stock)',
  b: 'var(--st-on_demo)',
  c: 'var(--st-under_inspection)',
  d: 'var(--st-for_repair)',
} as const;

function Aging() {
  const report = useReport<AgingData>('aging');
  if (!report.data) return <SkPage kind="reports" />;
  const { ages, grades, idle } = report.data;

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
          <HBars
            rows={grades.map((row) => ({
              label: CONDITION_LABELS[row.grade],
              value: row.value,
              color: GRADE_COLOURS[row.grade],
            }))}
          />
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
                <th>Location</th>
                <th className="right">Days idle</th>
              </tr>
            </thead>
            <tbody>
              {idle.map((row) => (
                <tr key={row.code}>
                  <td data-label="Asset Code">
                    <Link to={`/units/${row.code}`} className="row-link mono">
                      {row.code}
                    </Link>
                  </td>
                  <td data-label="Brand / Model">
                    {row.brand} {row.model}
                  </td>
                  <td data-label="Location">{row.location ?? '—'}</td>
                  <td data-label="Days idle" className="right num">
                    {row.days}
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

function Utilization() {
  const report = useReport<UtilizationRow[]>('utilization');
  const rows = report.data ?? [];

  return (
    <section className="card table-card" aria-labelledby="util-title">
      <div className="card-head" style={{ paddingBottom: 14 }}>
        <h2 id="util-title">Available vs deployed by category</h2>
        <span className="muted">Share of each category on demo right now</span>
      </div>
      {!report.data ? (
        <SkPage kind="reports" />
      ) : (
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
              const share = row.total === 0 ? 0 : Math.round((row.deployed / row.total) * 100);
              return (
                <tr key={row.categoryCode}>
                  <td data-label="Category">
                    <Link to={`/units?category=${row.categoryCode}`} className="row-link">
                      {row.categoryName}
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
      )}
    </section>
  );
}
