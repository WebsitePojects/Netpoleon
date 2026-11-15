import {
  Boxes,
  CalendarClock,
  CircleCheck,
  PackageCheck,
  PackagePlus,
  RotateCcw,
  Search,
  SearchCheck,
  Send,
  TriangleAlert,
  Undo2,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth.js';
import { Donut } from '../components/charts.js';
import { Sk, SkTable } from '../components/controls.js';
import { DataTable } from '../components/DataTable.js';
import { Empty, LoanChip, PageHead, order } from '../components/ui.js';
import { useWmsState } from '../data/context.js';
import {
  ACTIVE_STATUSES,
  buildAlerts,
  countByStatus,
  daysOverdue,
  STATUS_LABELS,
  type Alert,
  type AlertKind,
} from '../data/selectors.js';
import type { Movement, UnitStatus } from '../data/types.js';
import {
  daysBetween,
  formatDate,
  formatLongDate,
  formatRelative,
  toDateKey,
} from '../lib/dates.js';
import { useCountUp, usePageReady } from '../lib/hooks.js';

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
};

export const ALERT_TONES: Record<AlertKind, UnitStatus> = {
  overdue: 'under_inspection',
  missing_accessory: 'on_demo',
  for_inspection: 'returned',
  ready: 'in_stock',
};

export function AlertCard({ alert }: { alert: Alert }) {
  const Icon = ALERT_ICONS[alert.kind];
  return (
    <Link
      to={alert.href}
      className="alert-card"
      data-tone={ALERT_TONES[alert.kind]}
      data-read={alert.read}
    >
      <h3>{alert.title}</h3>
      <div>
        <strong className="mono">{alert.unitCode}</strong>
        <p>{alert.message}</p>
      </div>
      <time dateTime={alert.date}>{formatDate(alert.date)}</time>
      <Icon className="alert-art" aria-hidden="true" />
    </Link>
  );
}

/** Movement types worth a line in "recent activities"; shelf moves and reservations are noise. */
const FEED: Partial<
  Record<Movement['type'], { icon: LucideIcon; tone: UnitStatus; label: string }>
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
  const state = useWmsState();
  const { can } = useAuth();
  const ready = usePageReady();
  const now = useMemo(() => new Date(), []);
  const today = toDateKey(now);

  const counts = useMemo(() => countByStatus(state.units), [state.units]);
  const alerts = useMemo(() => buildAlerts(state, now), [state, now]);
  const unitByCode = useMemo(
    () => new Map(state.units.map((unit) => [unit.code, unit])),
    [state.units],
  );

  const recent = useMemo(() => {
    const items: Movement[] = [];
    for (
      let index = state.movements.length - 1;
      index >= 0 && items.length < RECENT_LIMIT;
      index -= 1
    ) {
      const movement = state.movements[index];
      if (movement && FEED[movement.type]) items.push(movement);
    }
    return items;
  }, [state.movements]);

  const dueSoon = useMemo(
    () =>
      state.loans
        .filter(
          (loan) => loan.status === 'released' && daysBetween(today, loan.dueDate) <= DUE_SOON_DAYS,
        )
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [state.loans, today],
  );

  const reserved = state.units.filter(
    (unit) => unit.status === 'in_stock' && unit.reservedFor,
  ).length;
  const overdueCount = alerts.filter((alert) => alert.kind === 'overdue').length;
  const kpis: KpiSpec[] = [
    {
      label: 'Total Demo Units',
      note: `Across ${state.categories.length} categories`,
      color: 'var(--st-total)',
      icon: Boxes,
      to: '/units',
      value: counts.total,
    },
    {
      label: 'Available',
      note: reserved > 0 ? `${reserved} reserved for pickup` : 'Ready to lend',
      color: 'var(--st-in_stock)',
      icon: CircleCheck,
      to: '/units?status=in_stock',
      value: counts.in_stock,
    },
    {
      label: 'On Demo',
      note: overdueCount > 0 ? `${overdueCount} overdue` : 'All within schedule',
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
  ];

  const slices = ACTIVE_STATUSES.map((status) => ({
    label: STATUS_LABELS[status],
    value: counts[status],
    color: `var(--st-${status})`,
  }));

  return (
    <div className="page">
      <PageHead
        title="Dashboard"
        lead="Overview of demo assets and warehouse operations"
        actions={
          <>
            <span className="btn" style={{ cursor: 'default' }}>
              <CalendarClock aria-hidden="true" />
              {formatLongDate(today)}
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

      {!ready ? (
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
                  const unit = unitByCode.get(movement.unitCode);
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
                          {unit ? ` · ${unit.brand} ${unit.model}` : ''}
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
                View all {alerts.length}
              </Link>
            </div>
            <div className="alert-grid stagger">
              {(['overdue', 'missing_accessory', 'for_inspection', 'ready'] as AlertKind[]).map(
                (kind, index) => {
                  const alert = alerts.find((item) => item.kind === kind);
                  return alert ? (
                    <div key={kind} style={order(index)}>
                      <AlertCard alert={alert} />
                    </div>
                  ) : null;
                },
              )}
            </div>
          </section>

          <section className="card table-card" aria-labelledby="due-title">
            <div className="card-head" style={{ paddingBottom: 14 }}>
              <h2 id="due-title">Returns Due Within {DUE_SOON_DAYS} Days</h2>
              <Link to="/borrow?tab=on_demo">All loans</Link>
            </div>
            <DataTable
              rows={dueSoon}
              columns={[
                {
                  id: 'number',
                  header: 'Transaction',
                  sort: (loan) => loan.number,
                  cell: (loan) => (
                    <Link to={`/borrow/${loan.number}`} className="row-link mono">
                      {loan.number}
                    </Link>
                  ),
                },
                {
                  id: 'company',
                  header: 'Borrower',
                  width: '1.4fr',
                  sort: (loan) => loan.borrower.company,
                  cell: (loan) => <span className="cell-main">{loan.borrower.company}</span>,
                },
                {
                  id: 'unit',
                  header: 'Unit',
                  className: 'mono',
                  sort: (loan) => loan.unitCode ?? '',
                  cell: (loan) => loan.unitCode,
                },
                {
                  id: 'due',
                  header: 'Due',
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
                  cell: (loan) => <LoanChip status={loan.status} />,
                },
              ]}
              rowKey={(loan) => loan.number}
              noun="loans"
              pageSize={6}
              rowClass={(loan) => (daysOverdue(loan, today) > 0 ? 'is-late' : undefined)}
              empty={{
                title: 'Nothing is due this week',
                body: 'Every unit on demo has more than a week left.',
              }}
              exportCsv={{
                name: 'returns-due',
                header: ['Transaction', 'Company', 'Asset code', 'Due', 'Days late'],
                row: (loan) => [
                  loan.number,
                  loan.borrower.company,
                  loan.unitCode ?? '',
                  loan.dueDate,
                  daysOverdue(loan, today),
                ],
              }}
            />
          </section>
        </div>
      )}
    </div>
  );
}
