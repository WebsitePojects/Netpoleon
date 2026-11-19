import type { InspectionQueue, InspectionQueueItem, InspectionQueueQuery } from '@wms/contracts';
import type { Tx } from '@wms/db';
import { sql } from 'drizzle-orm';
import { iso } from '../../platform/dates.js';
import { maybeOne, one, rows } from '../../platform/sql.js';
import { containsPattern, toUnit, type UnitRow } from '../units/units.repository.js';

interface QueueRow {
  unit: UnitRow;
  transactionNumber: string | null;
  company: string | null;
  returnedAt: Date | null;
  missingAccessories: string[];
  note: string | null;
  since: Date;
  lastShelfId: string | null;
}

export interface ReturnContext {
  loanItemId: string | null;
  reservationId: string | null;
  missing: string[];
  lastShelfId: string | null;
}

export class InspectionsRepository {
  async queue(
    tx: Tx,
    query: InspectionQueueQuery,
    offset: number,
  ): Promise<{
    items: InspectionQueueItem[];
    total: number;
    counts: Record<InspectionQueue, number>;
  }> {
    const search = query.q
      ? sql`AND (a.asset_code ILIKE ${containsPattern(query.q)} OR a.serial_number ILIKE ${containsPattern(query.q)})`
      : sql``;
    const found = await rows<QueueRow>(
      tx,
      sql`SELECT row_to_json(u.*) AS unit, lo.loan_no AS "transactionNumber", o.name AS company,
                 li.returned_at AS "returnedAt",
                 CASE WHEN li.id IS NULL OR li.returned_at IS NULL THEN '[]'::jsonb ELSE
                   COALESCE((SELECT jsonb_agg(x.v) FROM jsonb_array_elements_text(li.accessories_out) x(v)
                              WHERE NOT (li.accessories_back ? x.v)), '[]'::jsonb) END AS "missingAccessories",
                 last_move.note, last_move.occurred_at AS since, shelf.location_id AS "lastShelfId"
            FROM (
              SELECT a.id, a.asset_code AS code, a.serial_number AS serial, a.status, a.condition,
                     m.id AS "modelId", m.brand, m.model_name AS model, c.code AS "categoryCode",
                     CASE WHEN l.id IS NULL THEN NULL ELSE json_build_object('id', l.id, 'name', l.name,
                       'kind', l.kind, 'roomName', CASE WHEN l.kind = 'shelf' THEN p.name END) END AS location,
                     COALESCE((SELECT json_agg(x.name ORDER BY x.name) FROM model_accessories x
                                WHERE x.product_model_id = m.id), '[]'::json) AS accessories,
                     a.notes, NULL::text AS "reservedFor",
                     a.created_at AS "registeredAt", a.updated_at AS "updatedAt"
                FROM assets a
                JOIN product_models m ON m.id = a.product_model_id
                JOIN categories c ON c.id = m.category_id
                LEFT JOIN locations l ON l.id = a.current_location_id
                LEFT JOIN locations p ON p.id = l.parent_id
               WHERE a.status = ${query.status}::asset_status ${search}
               ORDER BY a.updated_at, a.id
               LIMIT ${query.pageSize} OFFSET ${offset}
            ) u
            LEFT JOIN LATERAL (SELECT x.* FROM loan_items x WHERE x.asset_id = u.id
                                ORDER BY x.released_at DESC LIMIT 1) li ON TRUE
            LEFT JOIN loans lo ON lo.id = li.loan_id
            LEFT JOIN partner_orgs o ON o.id = lo.partner_org_id
            LEFT JOIN LATERAL (SELECT mv.note, mv.occurred_at FROM asset_movements mv
                                WHERE mv.asset_id = u.id ORDER BY mv.occurred_at DESC, mv.id DESC LIMIT 1) last_move ON TRUE
            LEFT JOIN LATERAL (SELECT mv.to_location_id AS location_id FROM asset_movements mv
                                JOIN locations sl ON sl.id = mv.to_location_id AND sl.kind = 'shelf'
                                WHERE mv.asset_id = u.id ORDER BY mv.occurred_at DESC, mv.id DESC LIMIT 1) shelf ON TRUE
           ORDER BY u."updatedAt", u.id`,
    );
    const counts = await rows<{ status: InspectionQueue; n: number }>(
      tx,
      sql`SELECT status, count(*)::int AS n FROM assets
           WHERE status IN ('returned', 'under_inspection', 'for_repair') GROUP BY status`,
    );
    const byStatus: Record<InspectionQueue, number> = {
      returned: 0,
      under_inspection: 0,
      for_repair: 0,
    };
    for (const row of counts) byStatus[row.status] = row.n;
    return {
      items: found.map((row) => ({
        ...row,
        unit: toUnit({
          ...row.unit,
          registeredAt: new Date(row.unit.registeredAt),
          updatedAt: new Date(row.unit.updatedAt),
        }),
        returnedAt: iso(row.returnedAt),
        since: iso(row.since) as string,
      })),
      total: byStatus[query.status],
      counts: byStatus,
    };
  }

  /** The loan item the unit last came back on, its reservation, and what was missing. */
  returnContext(tx: Tx, assetId: string): Promise<ReturnContext> {
    return one(
      tx,
      sql`SELECT li.id AS "loanItemId", li.reservation_id AS "reservationId",
                 CASE WHEN li.id IS NULL OR li.returned_at IS NULL THEN '[]'::jsonb ELSE
                   COALESCE((SELECT jsonb_agg(x.v) FROM jsonb_array_elements_text(li.accessories_out) x(v)
                              WHERE NOT (li.accessories_back ? x.v)), '[]'::jsonb) END AS missing,
                 (SELECT mv.to_location_id FROM asset_movements mv
                    JOIN locations sl ON sl.id = mv.to_location_id AND sl.kind = 'shelf'
                   WHERE mv.asset_id = ${assetId} ORDER BY mv.occurred_at DESC LIMIT 1) AS "lastShelfId"
            FROM (SELECT 1) one_row
            LEFT JOIN LATERAL (SELECT x.* FROM loan_items x WHERE x.asset_id = ${assetId} AND x.returned_at IS NOT NULL
                                ORDER BY x.returned_at DESC LIMIT 1) li ON TRUE`,
    );
  }

  async record(
    tx: Tx,
    input: {
      assetId: string;
      loanItemId: string | null;
      inspectorId: string;
      grade: string;
      checklist: Record<string, boolean>;
      missing: string[];
      notes: string | null;
      outcome: string;
    },
  ): Promise<{ id: string }> {
    return one(
      tx,
      sql`INSERT INTO inspections (loan_item_id, asset_id, inspector_user_id, condition, checklist,
                                   missing_accessories, notes, outcome)
          VALUES (${input.loanItemId}, ${input.assetId}, ${input.inspectorId}, ${input.grade}::condition_grade,
                  ${JSON.stringify(input.checklist)}::jsonb, ${JSON.stringify(input.missing)}::jsonb,
                  ${input.notes}, ${input.outcome}::inspection_outcome)
          RETURNING id`,
    );
  }

  async setCondition(tx: Tx, assetId: string, grade: string): Promise<void> {
    await tx.execute(
      sql`UPDATE assets SET condition = ${grade}::condition_grade WHERE id = ${assetId}`,
    );
  }

  /** Inspection is the moment a returned unit stops occupying its booking (spec section 7). */
  async completeReservation(tx: Tx, reservationId: string | null): Promise<void> {
    if (!reservationId) return;
    await tx.execute(sql`
      UPDATE reservations SET status = 'completed' WHERE id = ${reservationId} AND status = 'released'`);
  }

  async locationKind(tx: Tx, id: string): Promise<string | null> {
    const row = await maybeOne<{ kind: string }>(
      tx,
      sql`SELECT kind FROM locations WHERE id = ${id}`,
    );
    return row?.kind ?? null;
  }
}
