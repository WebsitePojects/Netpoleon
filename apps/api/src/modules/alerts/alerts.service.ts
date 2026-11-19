import {
  ALERT_KINDS,
  type Alert,
  type AlertKind,
  type AlertList,
  type ListAlertsQuery,
  type MarkAlertsReadBody,
  type Settings,
} from '@wms/contracts';
import type { Database, Tx } from '@wms/db';
import type { RequestContext } from '../../platform/context.js';
import { iso } from '../../platform/dates.js';
import { idempotent, type Outcome } from '../../platform/idempotency.js';
import type { SettingsService } from '../../platform/settings.js';
import type { AlertRow, AlertsRepository } from './alerts.repository.js';

export const ALERT_TITLES: Readonly<Record<AlertKind, string>> = {
  overdue: 'Overdue return',
  missing_accessory: 'Returned with missing accessory',
  for_inspection: 'For inspection',
  ready: 'Available for redeployment',
  needs_reassignment: 'Booking needs a substitute unit',
};

/** The settings switch that silences each kind; reassignment cannot be switched off. */
const SWITCH: Readonly<Record<AlertKind, keyof Settings | null>> = {
  overdue: 'notifyOverdue',
  missing_accessory: 'notifyMissingAccessory',
  for_inspection: 'notifyForInspection',
  ready: 'notifyReadyForRedeployment',
  needs_reassignment: null,
};

function bodyOf(row: AlertRow): string {
  switch (row.kind) {
    case 'overdue':
      return `Demo unit is ${row.days} day${row.days === 1 ? '' : 's'} overdue for return from ${row.company ?? 'the borrower'}.`;
    case 'missing_accessory':
      return `Returned by ${row.company ?? 'the borrower'} without: ${(row.missing ?? []).join(', ')}.`;
    case 'for_inspection':
      return 'Unit is back and waiting for its inspection.';
    case 'ready':
      return 'Inspection completed. Ready for redeployment.';
    case 'needs_reassignment':
      return `The reserved unit for ${row.company ?? 'a borrower'} became unavailable; assign a substitute.`;
  }
}

export class AlertsService {
  constructor(
    private readonly db: Database,
    private readonly repo: AlertsRepository,
    private readonly settings: SettingsService,
  ) {}

  async list(ctx: RequestContext, query: ListAlertsQuery): Promise<AlertList> {
    const kinds = await this.enabledKinds(query.kind);
    return this.db.transaction(ctx.scope, (tx) =>
      this.listIn(tx, ctx.actor.userId, kinds, query.limit),
    );
  }

  /** Used by the dashboard inside its own transaction. */
  async listIn(
    tx: Tx,
    userId: string,
    kinds: readonly AlertKind[],
    limit: number,
  ): Promise<AlertList> {
    const found = await this.repo.list(tx, userId, kinds, limit);
    const counts = Object.fromEntries(ALERT_KINDS.map((kind) => [kind, 0])) as Record<
      AlertKind,
      number
    >;
    let unread = 0;
    const items: Alert[] = found.map((row) => {
      counts[row.kind] += 1;
      if (!row.read) unread += 1;
      return {
        key: row.key,
        kind: row.kind,
        title: ALERT_TITLES[row.kind],
        body: bodyOf(row),
        assetCode: row.assetCode,
        transactionNumber: row.transactionNumber,
        at: iso(row.at) as string,
        read: row.read,
      };
    });
    return { items, counts, unread };
  }

  async enabledKinds(requested?: readonly AlertKind[]): Promise<AlertKind[]> {
    const settings = await this.settings.get();
    return (requested ?? ALERT_KINDS).filter((kind) => {
      const key = SWITCH[kind];
      return key === null || settings[key] === true;
    });
  }

  markRead(ctx: RequestContext, body: MarkAlertsReadBody): Promise<Outcome<{ ok: true }>> {
    return this.db.transaction(ctx.scope, (tx) =>
      idempotent(tx, ctx, body, async () => {
        await this.repo.markRead(tx, ctx.actor.userId, body.keys);
        return { status: 200, body: { ok: true as const } };
      }),
    );
  }
}
