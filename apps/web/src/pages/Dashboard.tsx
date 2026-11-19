import type { Alert, AlertKind, AssetStatus, Movement } from '@wms/contracts';
import {
  Boxes,
  CalendarClock,
  CircleCheck,
  PackageCheck,
  PackagePlus,
  RefreshCcw,
  RotateCcw,
  Search,
  SearchCheck,
  Send,
  TriangleAlert,
  Undo2,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useDashboard } from '../api/queries.js';
import { useAuth, useReference } from '../auth/auth.js';
import { Donut } from '../components/charts.js';
import { Sk, SkTable } from '../components/controls.js';
import { Empty, LoanChip, PageHead, order } from '../components/ui.js';
import { formatDate, formatLongDate, formatRelative } from '../lib/dates.js';
import { useCountUp } from '../lib/hooks.js';
import { ACTIVE_STATUSES, STATUS_LABELS } from '../lib/labels.js';

interface KpiSpec {
  label: string;
  note: string;
  color: string;
  icon: LucideIcon;
  to: string;
  value: number;
}

function Kpi({ spec, index }: { spec: KpiSpec; index: number }) {
  const value = useCountUp(spec.value);
  return (
    <Link
      to={spec.to}
      className="kpi"
      style={{ '--dot': spec.color, ...order(index) } as CSSProperties}
    >
      <span className="kpi-label">
        <i aria-hidden="true" />
        {spec.label}
      </span>
      <span className="kpi-value num">{value}</span>
      <span className="kpi-note">{spec.note}</span>
      <spec.icon className="kpi-art" aria-hidden="true" />
    </Link>
  );
}

export const ALERT_ICONS: Record<AlertKind, LucideIcon> = {
  overdue: TriangleAlert,
  missing_accessory: TriangleAlert,
  for_inspection: Search,
  ready: CircleCheck,
  needs_reassignment: RefreshCcw,
};

export const ALERT_TONES: Record<AlertKind, AssetStatus> = {
  overdue: 'under_inspection',
  missing_accessory: 'on_demo',
  for_inspection: 'returned',
  ready: 'in_stock',
  needs_reassignment: 'for_repair',
};

/** Where an alert leads: the transaction when it has one, otherwise the unit. */
export function alertHref(alert: Alert): string {
  if (alert.transactionNumber) return `/borrow/${alert.transactionNumber}`;
  if (alert.assetCode) return `/units/${alert.assetCode}`;
  return '/alerts';
}

export function AlertCard({ alert }: { alert: Alert }) {
  const Icon = ALERT_ICONS[alert.kind];
  return (
    <Link
      to={alertHref(alert)}
      className="alert-card"
      data-tone={ALERT_TONES[alert.kind]}
      data-read={alert.read}
    >
      <h3>{alert.title}</h3>
      <div>
        <strong className="mono">{alert.assetCode ?? alert.transactionNumber}</strong>
        <p>{alert.body}</p>
      </div>
      <time dateTime={alert.at}>{formatDate(alert.at)}</time>
      <Icon className="alert-art" aria-hidden="true" />
    </Link>
  );
}

/** Movement types worth a line in "recent activities"; shelf moves and reservations are noise. */
const FEED: Partial<
  Record<Movement['type'], { icon: LucideIcon; tone: AssetStatus; label: string }>
> = {
  released: { icon: Send, tone: 'on_demo', label: 'Borrowed' },
  returned: { icon: Undo2, tone: 'in_stock', label: 'Returned' },
  inspection_started: { icon: SearchCheck, tone: 'under_inspection', label: 'For inspection' },
  restocked: { icon: PackageCheck, tone: 'in_stock', label: 'Restocked' },
  registered: { icon: PackagePlus, tone: 'returned', label: 'New asset added' },
  sent_to_repair: { icon: Wrench, tone: 'for_repair', label: 'Sent to repair' },
};

const RECENT_LIMIT = 6;
const DUE_SOON_DAYS = 7;

function DashboardSkeleton() {
  return (
    <div className="stack sk-fade" role="status" aria-label="Loading dashboard">
      <div className="kpis">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="kpi sk-card">
            <Sk w={110} h={11} />
            <Sk
              w={index === 0 ? 96 : 64}
              h={index === 0 ? 44 : 32}
              r={8}
              style={{ margin: '6px 0' }}
            />
            <Sk w={130} h={10} />
          </div>
        ))}
      </div>
      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <Sk w={190} h={16} />
            <Sk w={84} h={11} />
          </div>
          <div className="sk-donut">
            <Sk w={176} h={176} r="50%" />
            <div className="stack" style={{ gap: 14, flex: 1 }}>
              {Array.from({ length: 5 }, (_, index) => (
                <Sk key={index} w={`${82 - index * 7}%`} h={12} />
              ))}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <Sk w={150} h={16} />
            <Sk w={56} h={11} />
          </div>
          <div className="feed">
            {Array.from({ length: RECENT_LIMIT }, (_, index) => (
              <div key={index} className="feed-item">
                <Sk w={34} h={34} r={10} />
                <span className="stack" style={{ gap: 7 }}>
                  <Sk w={120 - (index % 3) * 18} h={12} />
                  <Sk w={190 - (index % 2) * 30} h={10} />
                </span>
                <Sk w={48} h={10} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <Sk w={210} h={16} />
      <div className="alert-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="alert-card sk-card">
            <Sk w={120} h={12} />
            <Sk w={96} h={13} style={{ marginTop: 8 }} />
            <Sk w="70%" h={10} />
            <Sk w={70} h={10} />
          </div>
        ))}
      </div>
      <div className="card table-card">
        <div className="card-head" style={{ paddingBottom: 14 }}>
          <Sk w={230} h={16} />
          <Sk w={60} h={11} />
        </div>
        <SkTable
          template="1.1fr 1.5fr 1.1fr 1fr 0.8fr"
          cells={[120, 170, 110, 90, 'chip']}
          rows={4}
        />
      </div>
    </div>
  );
}

export function Dashboard() {
  const { can } = useAuth();
  const { serverDate } = useReference();
  const dashboard = useDashboard();
  const data = dashboard.data;
  const now = new Date();

  const counts = data?.counts;
  const kpis: KpiSpec[] = counts
    ? [
        {
          label: 'Total Demo Units',
          note: `Across ${data.categories} categories`,
          color: 'var(--st-total)',
          icon: Boxes,
          to: '/units',
          value: counts.total,
        },
        {
          label: 'Available',
          note:
            data.reservedForPickup > 0
              ? `${data.reservedForPickup} reserved for pickup`
              : 'Ready to lend',
          color: 'var(--st-in_stock)',
          icon: CircleCheck,
          to: '/units?status=in_stock',
          value: counts.in_stock,
        },
        {
          label: 'On Demo',
          note: data.overdue > 0 ? `${data.overdue} overdue` : 'All within schedule',
          color: 'var(--st-on_demo)',
          icon: Send,
          to: '/units?status=on_demo',
          value: counts.on_demo,
        },
        {
          label: 'Returned',
          note: 'Waiting for inspection',
          color: 'var(--st-returned)',
          icon: RotateCcw,
          to: '/inspection',
          value: counts.returned,
        },
        {
          label: 'Under Inspection',
          note: `${counts.for_repair} more in repair`,
          color: 'var(--st-under_inspection)',
          icon: Search,
          to: '/inspection?tab=inspecting',
          value: counts.under_inspection,
        },
      ]
    : [];

  const slices = ACTIVE_STATUSES.map((status) => ({
    label: STATUS_LABELS[status],
    value: counts?.[status] ?? 0,
    color: `var(--st-${status})`,
  }));
  const recent = (data?.recent ?? [])
    .filter((movement) => FEED[movement.type])
    .slice(0, RECENT_LIMIT);
  const alerts = data?.alerts;

  return (
    <div className="page">
      <PageHead
        title="Dashboard"
        lead="Overview of demo assets and warehouse operations"
        actions={
          <>
            <span className="btn" style={{ cursor: 'default' }}>
              <CalendarClock aria-hidden="true" />
              {formatLongDate(serverDate)}
            </span>
            {can('loan.request') && (
              <Link to="/borrow?new=1" className="btn btn-primary">
                <Send aria-hidden="true" />
                New request
              </Link>
            )}
          </>
        }
      />

      {!data ? (
        <DashboardSkeleton />
      ) : (
        <div className="stack content-in">
          <div className="kpis stagger">
            {kpis.map((spec, index) => (
              <Kpi key={spec.label} spec={spec} index={index} />
            ))}
          </div>

          <div className="grid-2 stagger">
            <section className="card" style={order(5)} aria-labelledby="status-title">
              <div className="card-head">
                <h2 id="status-title">Asset Status Distribution</h2>
                <Link to="/reports">Open reports</Link>
              </div>
              <Donut slices={slices} centerLabel="Total Units" />
            </section>

            <section className="card" style={order(6)} aria-labelledby="recent-title">
              <div className="card-head">
                <h2 id="recent-title">Recent Activities</h2>
                <Link to="/reports?tab=tracking">View all</Link>
              </div>
              <div className="feed">
                {recent.map((movement) => {
                  const spec = FEED[movement.type];
                  if (!spec) return null;
                  return (
                    <Link
                      key={movement.id}
                      to={`/units/${movement.unitCode}`}
                      className="feed-item"
                    >
                      <span className="feed-icon" data-tone={spec.tone}>
                        <spec.icon aria-hidden="true" />
                      </span>
                      <span>
                        <strong>{spec.label}</strong>
                        <span className="cell-sub" style={{ display: 'block' }}>
                          <span className="mono">{movement.unitCode}</span>
                          {movement.by ? ` · ${movement.by.name}` : ''}
                        </span>
                      </span>
                      <time dateTime={movement.at}>{formatRelative(movement.at, now)}</time>
                    </Link>
                  );
                })}
              </div>
            </section>
          </div>

          <section aria-labelledby="alerts-title" className="stack" style={{ gap: 10 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 id="alerts-title" className="section-title">
                Alerts and Notifications
              </h2>
              <Link to="/alerts" className="link">
                View all {alerts ? Object.values(alerts.counts).reduce((sum, n) => sum + n, 0) : ''}
              </Link>
            </div>
            <div className="alert-grid stagger">
              {(alerts?.items ?? []).map((alert, index) => (
                <div key={alert.key} style={order(index)}>
                  <AlertCard alert={alert} />
                </div>
              ))}
            </div>
          </section>

          <section className="card table-card" aria-labelledby="due-title">
            <div className="card-head" style={{ paddingBottom: 14 }}>
              <h2 id="due-title">Returns Due Within {DUE_SOON_DAYS} Days</h2>
              <Link to="/borrow?tab=on_demo">All loans</Link>
            </div>
            {data.dueSoon.length === 0 ? (
              <Empty title="Nothing is due this week">
                Every unit on demo has more than a week left.
              </Empty>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Transaction</th>
                    <th>Borrower</th>
                    <th>Unit</th>
                    <th>Due</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.dueSoon.map((loan) => (
                    <tr key={loan.number} className={loan.daysOverdue > 0 ? 'is-late' : undefined}>
                      <td data-label="Transaction">
                        <Link to={`/borrow/${loan.number}`} className="row-link mono">
                          {loan.number}
                        </Link>
                      </td>
                      <td data-label="Borrower">
                        <span className="cell-main">{loan.company}</span>
                      </td>
                      <td data-label="Unit" className="mono">
                        {loan.unitCodes.join(', ')}
                      </td>
                      <td data-label="Due" className="num">
                        {formatDate(loan.dueDate)}
                        {loan.daysOverdue > 0 && (
                          <span className="late"> · {loan.daysOverdue}d late</span>
                        )}
                      </td>
                      <td data-label="Status">
                        <LoanChip status="released" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
