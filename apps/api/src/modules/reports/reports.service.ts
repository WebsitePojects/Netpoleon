import type {
  Aging,
  BorrowerRow,
  BorrowersQuery,
  Dashboard,
  Overview,
  TrackingQuery,
  UtilizationRow,
} from '@wms/contracts';
import type { Database } from '@wms/db';
import type { RequestContext } from '../../platform/context.js';
import { addDays, manilaToday } from '../../platform/dates.js';
import { offsetOf } from '../../platform/http.js';
import type { AlertsService } from '../alerts/alerts.service.js';
import type { ReportsRepository } from './reports.repository.js';

const DASHBOARD = { recent: 6, dueSoon: 6, dueWithinDays: 7, alerts: 4 };
const IDLE_UNITS = 8;

export class ReportsService {
  constructor(
    private readonly db: Database,
    private readonly repo: ReportsRepository,
    private readonly alerts: AlertsService,
  ) {}

  /** The whole first screen in one round trip and one transaction (plan section 3, item 6). */
  async dashboard(ctx: RequestContext): Promise<Dashboard> {
    const today = manilaToday();
    const kinds = await this.alerts.enabledKinds();
    return this.db.transaction(ctx.scope, async (tx) => {
      const counts = await this.repo.statusCounts(tx);
      const reservedForPickup = await this.repo.reservedForPickup(tx);
      const overdue = await this.repo.overdueCount(tx);
      const categories = await this.repo.categoryCount(tx);
      const recent = await this.repo.recentMovements(tx, DASHBOARD.recent);
      const dueSoon = await this.repo.dueSoon(
        tx,
        today,
        addDays(today, DASHBOARD.dueWithinDays),
        DASHBOARD.dueSoon,
      );
      const alertList = await this.alerts.listIn(tx, ctx.actor.userId, kinds, 200);
      return {
        counts,
        reservedForPickup,
        overdue,
        categories,
        recent,
        dueSoon,
        alerts: { ...alertList, items: alertList.items.slice(0, DASHBOARD.alerts) },
      };
    });
  }

  overview(ctx: RequestContext, months: number): Promise<Overview> {
    return this.db.transaction(ctx.scope, async (tx) => ({
      counts: await this.repo.statusCounts(tx),
      monthly: await this.repo.monthly(tx, months),
    }));
  }

  async tracking(ctx: RequestContext, query: TrackingQuery) {
    const { items, total } = await this.db.transaction(ctx.scope, (tx) =>
      this.repo.tracking(tx, query, offsetOf(query.page, query.pageSize)),
    );
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  borrowers(ctx: RequestContext, query: BorrowersQuery): Promise<BorrowerRow[]> {
    return this.db.transaction(ctx.scope, (tx) => this.repo.borrowers(tx, query.from, query.until));
  }

  aging(ctx: RequestContext): Promise<Aging> {
    return this.db.transaction(ctx.scope, (tx) => this.repo.aging(tx, manilaToday(), IDLE_UNITS));
  }

  utilization(ctx: RequestContext): Promise<UtilizationRow[]> {
    return this.db.transaction(ctx.scope, (tx) => this.repo.utilization(tx));
  }
}
