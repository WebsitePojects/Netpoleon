import type { AlertKind } from '@wms/contracts';
import type { Tx } from '@wms/db';
import { sql } from 'drizzle-orm';
import { rows } from '../../platform/sql.js';

export interface AlertRow {
  kind: AlertKind;
  key: string;
  assetCode: string | null;
  transactionNumber: string | null;
  at: Date | string;
  company: string | null;
  person: string | null;
  days: number | null;
  missing: string[] | null;
  read: boolean;
}

/** Returned-short and freshly-restocked alerts stay relevant for this long. */
const RECENT_DAYS = { missing: 30, ready: 7 };

/**
 * Every alert is a condition in the live data with a stable key (plan R5). Overdue loans,
 * returns missing an accessory, units waiting for inspection, units freshly back on the shelf
 * and bookings that need a substitute. Fixing the cause removes the alert; the person's read
 * marks are joined from `notifications`.
 */
export class AlertsRepository {
  list(tx: Tx, userId: string, kinds: readonly AlertKind[], limit: number): Promise<AlertRow[]> {
    if (kinds.length === 0) return Promise.resolve([]);
    return rows<AlertRow>(
      tx,
      sql`
      WITH today AS (SELECT (now() AT TIME ZONE 'Asia/Manila')::date AS d),
      alerts AS (
        SELECT 'overdue'::text AS kind, 'overdue:' || t.request_no AS key,
               (SELECT a.asset_code FROM loan_items li JOIN assets a ON a.id = li.asset_id
                 WHERE li.loan_id = t.loan_id AND li.returned_at IS NULL ORDER BY a.asset_code LIMIT 1) AS "assetCode",
               t.request_no AS "transactionNumber", (t.due_date + 1)::timestamp AT TIME ZONE 'Asia/Manila' AS at,
               t.partner_org_name AS company, t.contact_name AS person,
               ((SELECT d FROM today) - t.due_date) AS days, NULL::jsonb AS missing
          FROM transaction_overview t
         WHERE t.is_overdue
        UNION ALL
        SELECT 'missing_accessory', 'missing:' || li.id, a.asset_code, lo.loan_no, li.returned_at,
               o.name, lo.contact_name, NULL,
               (SELECT jsonb_agg(x.v) FROM jsonb_array_elements_text(li.accessories_out) x(v)
                 WHERE NOT (li.accessories_back ? x.v))
          FROM loan_items li
          JOIN loans lo ON lo.id = li.loan_id
          JOIN partner_orgs o ON o.id = lo.partner_org_id
          JOIN assets a ON a.id = li.asset_id
         WHERE li.returned_at > now() - make_interval(days => ${RECENT_DAYS.missing})
           AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(li.accessories_out) x(v)
                        WHERE NOT (li.accessories_back ? x.v))
        UNION ALL
        SELECT 'for_inspection', 'inspect:' || a.asset_code || ':' || mv.id, a.asset_code, lo.loan_no,
               mv.occurred_at, o.name, NULL, NULL, NULL
          FROM assets a
          JOIN LATERAL (SELECT m.id, m.occurred_at, m.loan_item_id FROM asset_movements m
                         WHERE m.asset_id = a.id ORDER BY m.occurred_at DESC, m.id DESC LIMIT 1) mv ON TRUE
          LEFT JOIN loan_items li ON li.id = mv.loan_item_id
          LEFT JOIN loans lo ON lo.id = li.loan_id
          LEFT JOIN partner_orgs o ON o.id = lo.partner_org_id
         WHERE a.status = 'returned'
        UNION ALL
        SELECT 'ready', 'ready:' || mv.id, a.asset_code, NULL, mv.occurred_at, NULL, NULL, NULL, NULL
          FROM asset_movements mv
          JOIN assets a ON a.id = mv.asset_id
         WHERE mv.movement_type = 'restocked' AND a.status = 'in_stock'
           AND mv.occurred_at > now() - make_interval(days => ${RECENT_DAYS.ready})
        UNION ALL
        SELECT 'needs_reassignment', 'reassign:' || r.id, a.asset_code, lr.request_no,
               r.updated_at, o.name, NULL, NULL, NULL
          FROM reservations r
          JOIN assets a ON a.id = r.asset_id
          JOIN loan_request_items i ON i.id = r.loan_request_item_id
          JOIN loan_requests lr ON lr.id = i.loan_request_id
          JOIN partner_orgs o ON o.id = lr.partner_org_id
         WHERE r.status = 'needs_reassignment'
      )
      SELECT alerts.*, n.read_at IS NOT NULL AS read
        FROM alerts
        LEFT JOIN notifications n ON n.user_id = ${userId} AND n.dedupe_key = alerts.key
       WHERE alerts.kind IN ${kinds}
       ORDER BY alerts.at DESC
       LIMIT ${limit}`,
    );
  }

  /** Idempotent by construction: marking an already-read alert keeps its first read time. */
  async markRead(tx: Tx, userId: string, keys: readonly string[]): Promise<void> {
    for (const key of keys) {
      await tx.execute(sql`
        INSERT INTO notifications (user_id, kind, payload, dedupe_key, read_at)
        VALUES (${userId}, ${key.slice(0, key.indexOf(':'))}, '{}'::jsonb, ${key}, now())
        ON CONFLICT (user_id, dedupe_key) DO UPDATE SET read_at = COALESCE(notifications.read_at, now())`);
    }
  }
}
