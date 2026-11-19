import {
  ASSET_STATUSES,
  type Aging,
  type BorrowerRow,
  type DueSoon,
  type Movement,
  type MonthlyMovement,
  type StatusCounts,
  type TrackingQuery,
  type UtilizationRow,
} from '@wms/contracts';
import type { Tx } from '@wms/db';
import { sql } from 'drizzle-orm';
import { one, rows } from '../../platform/sql.js';
import { toMovement } from '../units/units.repository.js';

const MOVEMENT_SELECT = sql`
  SELECT mv.id, mv.occurred_at AS at, a.asset_code AS "unitCode", mv.movement_type AS type,
         mv.from_status AS "fromStatus", mv.to_status AS "toStatus",
         fl.name AS "fromLocation", tl.name AS "toLocation",
         CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object('id', u.id, 'name', u.full_name,
           'username', u.username, 'title', u.title) END AS by,
         lo.loan_no AS "transactionNumber", mv.note
    FROM asset_movements mv
    JOIN assets a ON a.id = mv.asset_id
    LEFT JOIN locations fl ON fl.id = mv.from_location_id
    LEFT JOIN locations tl ON tl.id = mv.to_location_id
    LEFT JOIN users u ON u.id = mv.actor_user_id
    LEFT JOIN loan_items li ON li.id = mv.loan_item_id
    LEFT JOIN loans lo ON lo.id = li.loan_id`;

/** Age bands of the aging report, by days since a unit was registered. */
const AGE_BANDS = [
  { label: 'Under 6 months', maxDays: 182 },
  { label: '6 to 12 months', maxDays: 365 },
  { label: '12 to 18 months', maxDays: 547 },
  { label: 'Over 18 months', maxDays: null },
] as const;

/**
 * Every report is one or two grouped queries over indexed columns (spec section 8): the
 * database does the counting, and only the figures cross the wire.
 */
export class ReportsRepository {
  async statusCounts(tx: Tx): Promise<StatusCounts> {
    const found = await rows<{ status: (typeof ASSET_STATUSES)[number]; n: number }>(
      tx,
      sql`SELECT status, count(*)::int AS n FROM assets GROUP BY status`,
    );
    const counts = Object.fromEntries(
      [...ASSET_STATUSES, 'total'].map((key) => [key, 0]),
    ) as StatusCounts;
    for (const row of found) {
      counts[row.status] = row.n;
      if (row.status !== 'retired' && row.status !== 'lost') counts.total += row.n;
    }
    return counts;
  }

  async reservedForPickup(tx: Tx): Promise<number> {
    const { n } = await one<{ n: number }>(
      tx,
      sql`SELECT count(DISTINCT r.asset_id)::int AS n FROM reservations r JOIN assets a ON a.id = r.asset_id
           WHERE r.status = 'active' AND a.status = 'in_stock'`,
    );
    return n;
  }

  async overdueCount(tx: Tx): Promise<number> {
    const { n } = await one<{ n: number }>(
      tx,
      sql`SELECT count(*)::int AS n FROM transaction_overview WHERE is_overdue`,
    );
    return n;
  }

  async categoryCount(tx: Tx): Promise<number> {
    const { n } = await one<{ n: number }>(tx, sql`SELECT count(*)::int AS n FROM categories`);
    return n;
  }

  async recentMovements(tx: Tx, limit: number): Promise<Movement[]> {
    const found = await rows<Parameters<typeof toMovement>[0]>(
      tx,
      sql`${MOVEMENT_SELECT} ORDER BY mv.occurred_at DESC, mv.id DESC LIMIT ${limit}`,
    );
    return found.map(toMovement);
  }

  /** Open loans due by `until` (overdue ones included), soonest first. */
  dueSoon(tx: Tx, today: string, until: string, limit: number): Promise<DueSoon[]> {
    return rows(
      tx,
      sql`SELECT t.request_no AS number, t.partner_org_name AS company, t.contact_name AS "contactName",
                 t.brand, t.model_name AS model, t.due_date::text AS "dueDate",
                 GREATEST(0, ${today}::date - t.due_date) AS "daysOverdue",
                 COALESCE((SELECT json_agg(a.asset_code ORDER BY a.asset_code) FROM loan_items li
                             JOIN assets a ON a.id = li.asset_id
                            WHERE li.loan_id = t.loan_id AND li.returned_at IS NULL), '[]'::json) AS "unitCodes"
            FROM transaction_overview t
           WHERE t.stage = 'released' AND t.due_date <= ${until}::date
           ORDER BY t.due_date, t.request_no
           LIMIT ${limit}`,
    );
  }

  /** Movement counts for the last `months` calendar months (Manila), oldest first, gaps as zero. */
  monthly(tx: Tx, months: number): Promise<MonthlyMovement[]> {
    return rows(
      tx,
      sql`WITH bounds AS (
            SELECT date_trunc('month', (now() AT TIME ZONE 'Asia/Manila'))::date AS this_month
          ), series AS (
            SELECT generate_series(this_month - make_interval(months => ${months - 1}), this_month,
                                   interval '1 month')::date AS month
              FROM bounds
          )
          SELECT to_char(s.month, 'YYYY-MM') AS month,
                 count(*) FILTER (WHERE mv.movement_type = 'released')::int AS released,
                 count(*) FILTER (WHERE mv.movement_type = 'returned')::int AS returned,
                 count(*) FILTER (WHERE mv.movement_type = 'restocked')::int AS restocked,
                 count(*) FILTER (WHERE mv.movement_type = 'inspection_started')::int AS inspection
            FROM series s
            LEFT JOIN asset_movements mv
              ON mv.occurred_at >= (s.month::timestamp AT TIME ZONE 'Asia/Manila')
             AND mv.occurred_at < ((s.month + interval '1 month')::timestamp AT TIME ZONE 'Asia/Manila')
             AND mv.movement_type IN ('released', 'returned', 'restocked', 'inspection_started')
           GROUP BY s.month
           ORDER BY s.month`,
    );
  }

  async tracking(
    tx: Tx,
    query: TrackingQuery,
    offset: number,
  ): Promise<{ items: Movement[]; total: number }> {
    const types = query.type ? sql`AND mv.movement_type IN ${query.type}` : sql``;
    const range = sql`mv.occurred_at >= (${query.from}::date::timestamp AT TIME ZONE 'Asia/Manila')
                  AND mv.occurred_at < ((${query.until}::date + 1)::timestamp AT TIME ZONE 'Asia/Manila')`;
    const found = await rows<Parameters<typeof toMovement>[0]>(
      tx,
      sql`${MOVEMENT_SELECT} WHERE ${range} ${types}
           ORDER BY mv.occurred_at DESC, mv.id DESC LIMIT ${query.pageSize} OFFSET ${offset}`,
    );
    const { total } = await one<{ total: number }>(
      tx,
      sql`SELECT count(*)::int AS total FROM asset_movements mv WHERE ${range} ${types}`,
    );
    return { items: found.map(toMovement), total };
  }

  /** Per company: loans released in the window, still open, overdue, and returned short. */
  borrowers(tx: Tx, from: string, until: string): Promise<BorrowerRow[]> {
    return rows(
      tx,
      sql`SELECT o.id AS "companyId", o.name AS company,
                 count(DISTINCT lo.id)::int AS loans,
                 count(DISTINCT lo.id) FILTER (WHERE lo.closed_at IS NULL)::int AS open,
                 count(DISTINCT t.request_id) FILTER (WHERE t.is_overdue)::int AS overdue,
                 count(DISTINCT li.id) FILTER (WHERE li.returned_at IS NOT NULL AND EXISTS (
                   SELECT 1 FROM jsonb_array_elements_text(li.accessories_out) x(v)
                    WHERE NOT (li.accessories_back ? x.v)))::int AS missing,
                 max(lo.released_at AT TIME ZONE 'Asia/Manila')::date::text AS "lastBorrowed"
            FROM loans lo
            JOIN partner_orgs o ON o.id = lo.partner_org_id
            LEFT JOIN loan_items li ON li.loan_id = lo.id
            LEFT JOIN transaction_overview t ON t.loan_id = lo.id
           WHERE lo.released_at >= (${from}::date::timestamp AT TIME ZONE 'Asia/Manila')
             AND lo.released_at < ((${until}::date + 1)::timestamp AT TIME ZONE 'Asia/Manila')
           GROUP BY o.id, o.name
           ORDER BY loans DESC, o.name`,
    );
  }

  async aging(tx: Tx, today: string, idleLimit: number): Promise<Aging> {
    const ages = await one<Record<string, number>>(
      tx,
      sql`SELECT ${sql.join(
        AGE_BANDS.map((band, index) => {
          const min = index === 0 ? -1 : (AGE_BANDS[index - 1]?.maxDays ?? 0);
          const upper = band.maxDays === null ? sql`TRUE` : sql`d <= ${band.maxDays}`;
          return sql`count(*) FILTER (WHERE d > ${min} AND ${upper})::int AS ${sql.identifier(`b${index}`)}`;
        }),
        sql`, `,
      )}
            FROM (SELECT ${today}::date - (a.created_at AT TIME ZONE 'Asia/Manila')::date AS d
                    FROM assets a WHERE a.status NOT IN ('retired', 'lost')) x`,
    );
    const grades = await rows<{ grade: Aging['grades'][number]['grade']; value: number }>(
      tx,
      sql`SELECT g.grade, count(a.id)::int AS value
            FROM unnest(enum_range(NULL::condition_grade)) AS g(grade)
            LEFT JOIN assets a ON a.condition = g.grade AND a.status NOT IN ('retired', 'lost')
           GROUP BY g.grade ORDER BY g.grade`,
    );
    const idle = await rows<Aging['idle'][number]>(
      tx,
      sql`SELECT a.asset_code AS code, m.brand, m.model_name AS model, l.name AS location,
                 (${today}::date - (lastmv.at AT TIME ZONE 'Asia/Manila')::date) AS days
            FROM assets a
            JOIN product_models m ON m.id = a.product_model_id
            LEFT JOIN locations l ON l.id = a.current_location_id
            JOIN LATERAL (SELECT max(mv.occurred_at) AS at FROM asset_movements mv WHERE mv.asset_id = a.id) lastmv ON TRUE
           WHERE a.status = 'in_stock'
             AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.asset_id = a.id AND r.status = 'active')
           ORDER BY lastmv.at ASC
           LIMIT ${idleLimit}`,
    );
    return {
      ages: AGE_BANDS.map((band, index) => ({ label: band.label, value: ages[`b${index}`] ?? 0 })),
      grades,
      idle,
    };
  }

  utilization(tx: Tx): Promise<UtilizationRow[]> {
    return rows(
      tx,
      sql`SELECT c.code AS "categoryCode", c.name AS "categoryName",
                 count(a.id)::int AS total,
                 count(a.id) FILTER (WHERE a.status = 'on_demo')::int AS deployed,
                 count(a.id) FILTER (WHERE a.status = 'in_stock')::int AS available
            FROM categories c
            JOIN product_models m ON m.category_id = c.id
            JOIN assets a ON a.product_model_id = m.id AND a.status NOT IN ('retired', 'lost')
           GROUP BY c.code, c.name
           ORDER BY c.name`,
    );
  }
}
