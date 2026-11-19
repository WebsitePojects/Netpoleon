import type {
  Candidates,
  ExportTransactionsQuery,
  Extension,
  StageCounts,
  Transaction,
  TransactionUnit,
} from '@wms/contracts';
import type { Tx } from '@wms/db';
import { sql, type SQL } from 'drizzle-orm';
import { addDays, iso } from '../../platform/dates.js';
import { maybeOne, one, rowCount, rows } from '../../platform/sql.js';
import { containsPattern } from '../units/units.repository.js';

const userRef = (alias: string) =>
  sql.raw(`CASE WHEN ${alias}.id IS NULL THEN NULL ELSE json_build_object('id', ${alias}.id,
    'name', ${alias}.full_name, 'username', ${alias}.username, 'title', ${alias}.title) END`);

/**
 * One row per request from the `transaction_overview` view (migration 0011), which owns the
 * stage rule. The joins here only add display fields: people as references, the unit codes.
 */
const TRANSACTION_SELECT = sql`
  SELECT t.request_id AS "requestId", t.loan_id AS "loanId", t.request_no AS number, t.stage,
         json_build_object('id', t.partner_org_id, 'name', t.partner_org_name, 'type', t.partner_org_type) AS company,
         json_build_object('name', t.contact_name, 'email', t.contact_email, 'phone', t.contact_phone) AS contact,
         json_build_object('id', t.product_model_id, 'brand', t.brand, 'name', t.model_name,
                           'categoryCode', t.category_code) AS model,
         t.quantity_requested AS "quantityRequested", t.quantity_assigned AS "quantityAssigned",
         COALESCE((SELECT json_agg(a.asset_code ORDER BY r.created_at, a.asset_code)
                     FROM loan_request_items i
                     JOIN reservations r ON r.loan_request_item_id = i.id
                     JOIN assets a ON a.id = r.asset_id
                    WHERE i.loan_request_id = t.request_id
                      AND r.status IN ('active', 'needs_reassignment', 'released', 'completed')),
                  '[]'::json) AS "unitCodes",
         t.needed_from::text AS "neededFrom", t.needed_until::text AS "neededUntil",
         COALESCE(t.due_date, t.needed_until)::text AS "dueDate",
         COALESCE(t.is_overdue, false) AS "isOverdue",
         t.purpose, t.end_customer AS "endCustomer",
         ${userRef('fu')} AS "filedBy", t.created_at AS "requestedAt",
         ${userRef('du')} AS "decidedBy", t.decided_at AS "decidedAt", t.decision_note AS "decisionNote",
         ${userRef('ru')} AS "releasedBy", t.released_at AS "releasedAt",
         COALESCE(t.items_released, 0) AS "itemsReleased", COALESCE(t.items_returned, 0) AS "itemsReturned",
         t.updated_at AS "updatedAt"
    FROM transaction_overview t
    LEFT JOIN users fu ON fu.id = t.filed_by_user_id
    LEFT JOIN users du ON du.id = t.decided_by_user_id
    LEFT JOIN users ru ON ru.id = t.released_by_user_id`;

interface TransactionRow extends Omit<
  Transaction,
  'requestedAt' | 'decidedAt' | 'releasedAt' | 'updatedAt' | 'daysOverdue'
> {
  requestId: string;
  loanId: string | null;
  requestedAt: Date | string;
  decidedAt: Date | string | null;
  releasedAt: Date | string | null;
  updatedAt: Date | string;
}

export interface TransactionRecord extends Transaction {
  requestId: string;
  loanId: string | null;
}

function toTransaction(row: TransactionRow, today: string): TransactionRecord {
  const overdueDays = row.isOverdue
    ? Math.max(0, Math.round((Date.parse(today) - Date.parse(row.dueDate)) / 86_400_000))
    : 0;
  return {
    ...row,
    daysOverdue: overdueDays,
    requestedAt: iso(row.requestedAt) as string,
    decidedAt: iso(row.decidedAt),
    releasedAt: iso(row.releasedAt),
    updatedAt: iso(row.updatedAt) as string,
  };
}

const SORTS: Record<NonNullable<ExportTransactionsQuery['sort']>, SQL> = {
  number: sql`t.request_no`,
  requestedAt: sql`t.created_at`,
  neededFrom: sql`t.needed_from`,
  dueDate: sql`COALESCE(t.due_date, t.needed_until)`,
  company: sql`t.partner_org_name`,
};

function where(filters: ExportTransactionsQuery, today: string): SQL {
  const parts: SQL[] = [sql`TRUE`];
  if (filters.q) {
    const pattern = containsPattern(filters.q);
    parts.push(sql`(t.request_no ILIKE ${pattern} OR t.contact_name ILIKE ${pattern}
                    OR t.partner_org_name ILIKE ${pattern})`);
  }
  if (filters.stage) parts.push(sql`t.stage IN ${filters.stage}`);
  if (filters.company) parts.push(sql`t.partner_org_id = ${filters.company}`);
  if (filters.due === 'overdue') parts.push(sql`t.is_overdue`);
  if (filters.due === 'week') {
    parts.push(sql`t.stage = 'released' AND COALESCE(t.due_date, t.needed_until)
                   BETWEEN ${today}::date AND ${addDays(today, 7)}::date`);
  }
  if (filters.unit) {
    parts.push(sql`EXISTS (SELECT 1 FROM loan_request_items i
                             JOIN reservations r ON r.loan_request_item_id = i.id
                             JOIN assets a ON a.id = r.asset_id
                            WHERE i.loan_request_id = t.request_id AND a.asset_code = ${filters.unit})`);
  }
  return sql.join(parts, sql` AND `);
}

function orderBy(filters: ExportTransactionsQuery): SQL {
  if (!filters.sort) return sql`t.created_at DESC, t.request_id DESC`;
  const direction = filters.order === 'asc' ? sql`ASC` : sql`DESC`;
  return sql`${SORTS[filters.sort]} ${direction} NULLS LAST, t.request_id ${direction}`;
}

export interface RequestState {
  id: string;
  number: string;
  status: 'submitted' | 'approved' | 'rejected' | 'cancelled' | 'expired' | 'fulfilled';
  filedBy: string;
  partnerOrgId: string;
  modelId: string;
  itemId: string;
  quantityRequested: number;
  neededFrom: string;
  neededUntil: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
}

export class TransactionsRepository {
  async list(
    tx: Tx,
    query: ExportTransactionsQuery,
    today: string,
    limit: number,
    offset: number,
  ): Promise<{ items: TransactionRecord[]; total: number }> {
    const filter = where(query, today);
    const found = await rows<TransactionRow>(
      tx,
      sql`${TRANSACTION_SELECT} WHERE ${filter} ORDER BY ${orderBy(query)} LIMIT ${limit} OFFSET ${offset}`,
    );
    const { total } = await one<{ total: number }>(
      tx,
      sql`SELECT count(*)::int AS total FROM transaction_overview t WHERE ${filter}`,
    );
    return { items: found.map((row) => toTransaction(row, today)), total };
  }

  async stageCounts(tx: Tx): Promise<StageCounts> {
    const found = await rows<{ stage: keyof StageCounts; count: number }>(
      tx,
      sql`SELECT stage, count(*)::int AS count FROM transaction_overview GROUP BY stage`,
    );
    return Object.fromEntries(found.map((row) => [row.stage, row.count])) as StageCounts;
  }

  async byNumber(tx: Tx, number: string, today: string): Promise<TransactionRecord | null> {
    const row = await maybeOne<TransactionRow>(
      tx,
      sql`${TRANSACTION_SELECT} WHERE t.request_no = ${number}`,
    );
    return row ? toTransaction(row, today) : null;
  }

  /** The request row locked for a state change, so two decisions on it queue (plan R8). */
  lockRequest(tx: Tx, number: string): Promise<RequestState | null> {
    return maybeOne(
      tx,
      sql`SELECT lr.id, lr.request_no AS number, lr.status, lr.filed_by_user_id AS "filedBy",
                 lr.partner_org_id AS "partnerOrgId", i.product_model_id AS "modelId", i.id AS "itemId",
                 i.quantity_requested AS "quantityRequested",
                 lr.needed_from::text AS "neededFrom", lr.needed_until::text AS "neededUntil",
                 lr.contact_name AS "contactName", lr.contact_email::text AS "contactEmail",
                 lr.contact_phone AS "contactPhone"
            FROM loan_requests lr
            JOIN LATERAL (SELECT * FROM loan_request_items x WHERE x.loan_request_id = lr.id
                          ORDER BY x.created_at, x.id LIMIT 1) i ON TRUE
           WHERE lr.request_no = ${number}
             FOR UPDATE OF lr`,
    );
  }

  accessoriesOf(tx: Tx, modelId: string): Promise<string[]> {
    return rows<{ name: string }>(
      tx,
      sql`SELECT name FROM model_accessories WHERE product_model_id = ${modelId} ORDER BY name`,
    ).then((found) => found.map((row) => row.name));
  }

  units(tx: Tx, requestId: string): Promise<TransactionUnit[]> {
    return rows<TransactionUnit & { releasedAt: Date | string | null; returnedAt: Date | null }>(
      tx,
      sql`SELECT a.asset_code AS "assetCode", a.serial_number AS serial, a.status,
                 r.status AS "reservationStatus", li.released_at AS "releasedAt", li.returned_at AS "returnedAt",
                 COALESCE(li.accessories_out, '[]'::jsonb) AS "accessoriesOut",
                 li.accessories_back AS "accessoriesBack",
                 CASE WHEN li.returned_at IS NULL THEN '[]'::jsonb ELSE
                   COALESCE((SELECT jsonb_agg(o.v) FROM jsonb_array_elements_text(li.accessories_out) o(v)
                              WHERE NOT (li.accessories_back ? o.v)), '[]'::jsonb) END AS "missingAccessories",
                 ${userRef('ru')} AS "receivedBy", ret.note AS "returnNote"
            FROM loan_request_items i
            JOIN reservations r ON r.loan_request_item_id = i.id
            JOIN assets a ON a.id = r.asset_id
            LEFT JOIN loan_items li ON li.reservation_id = r.id
            LEFT JOIN LATERAL (SELECT m.actor_user_id, m.note FROM asset_movements m
                                WHERE m.loan_item_id = li.id AND m.movement_type = 'returned'
                                ORDER BY m.occurred_at DESC LIMIT 1) ret ON TRUE
            LEFT JOIN users ru ON ru.id = ret.actor_user_id
           WHERE i.loan_request_id = ${requestId}
             AND r.status IN ('active', 'needs_reassignment', 'released', 'completed')
           ORDER BY r.created_at, a.asset_code`,
    ).then((found) =>
      found.map((row) => ({
        ...row,
        releasedAt: iso(row.releasedAt),
        returnedAt: iso(row.returnedAt),
      })),
    );
  }

  extensions(tx: Tx, loanId: string): Promise<Extension[]> {
    return rows<Extension & { at: Date | string }>(
      tx,
      sql`SELECT e.requested_due_date::text AS "requestedDueDate", e.reason, e.status,
                 ${userRef('u')} AS by, e.created_at AS at
            FROM loan_extensions e
            LEFT JOIN users u ON u.id = COALESCE(e.decided_by_user_id, e.requested_by_user_id)
           WHERE e.loan_id = ${loanId}
           ORDER BY e.created_at`,
    ).then((found) => found.map((row) => ({ ...row, at: iso(row.at) as string })));
  }

  async modelForRequest(tx: Tx, modelId: string): Promise<{ bookable: boolean } | null> {
    return maybeOne(
      tx,
      sql`SELECT is_bookable AS bookable FROM product_models WHERE id = ${modelId}`,
    );
  }

  /** `BRR-<Manila year>-<5 digits>` from the year's gap-free counter (seed uses the same prefix). */
  createRequest(
    tx: Tx,
    input: {
      year: string;
      partnerOrgId: string;
      filedBy: string;
      contact: { name: string; email: string; phone: string };
      neededFrom: string;
      neededUntil: string;
      purpose: string;
      endCustomer: string | null;
    },
  ): Promise<{ id: string; number: string }> {
    return one(
      tx,
      sql`INSERT INTO loan_requests (request_no, partner_org_id, filed_by_user_id, contact_name, contact_email,
                                     contact_phone, needed_from, needed_until, purpose, end_customer)
          VALUES ('BRR-' || ${input.year} || '-' || lpad(next_counter('BRR-' || ${input.year})::text, 5, '0'),
                  ${input.partnerOrgId}, ${input.filedBy}, ${input.contact.name}, ${input.contact.email},
                  ${input.contact.phone}, ${input.neededFrom}::date, ${input.neededUntil}::date,
                  ${input.purpose}, ${input.endCustomer})
          RETURNING id, request_no AS number`,
    );
  }

  async addItem(
    tx: Tx,
    requestId: string,
    partnerOrgId: string,
    modelId: string,
    quantity: number,
  ): Promise<void> {
    await tx.execute(sql`
      INSERT INTO loan_request_items (loan_request_id, partner_org_id, product_model_id, quantity_requested)
      VALUES (${requestId}, ${partnerOrgId}, ${modelId}, ${quantity})`);
  }

  /** The conditional state change: succeeds only from the expected status, so a race loses cleanly. */
  async decide(
    tx: Tx,
    requestId: string,
    from: readonly string[],
    to: 'approved' | 'rejected' | 'cancelled' | 'expired' | 'fulfilled',
    decidedBy: string | null,
    note: string | null,
  ): Promise<boolean> {
    const changed = await rowCount(
      tx,
      sql`UPDATE loan_requests
             SET status = ${to}::request_status,
                 decided_by_user_id = COALESCE(${decidedBy}::uuid, decided_by_user_id),
                 decided_at = CASE WHEN ${decidedBy}::uuid IS NULL THEN decided_at ELSE now() END,
                 decision_note = COALESCE(${note}, decision_note)
           WHERE id = ${requestId} AND status IN ${from}`,
    );
    return changed === 1;
  }

  async setAssigned(tx: Tx, itemId: string, quantity: number): Promise<void> {
    await tx.execute(
      sql`UPDATE loan_request_items SET quantity_assigned = ${quantity} WHERE id = ${itemId}`,
    );
  }

  /** The unit with what an approval needs to judge it, locked against a concurrent change. */
  lockAsset(
    tx: Tx,
    code: string,
  ): Promise<{ id: string; status: string; modelId: string; overdue: boolean } | null> {
    return maybeOne(
      tx,
      sql`SELECT a.id, a.status, a.product_model_id AS "modelId",
                 EXISTS (SELECT 1 FROM loan_items li JOIN loans lo ON lo.id = li.loan_id
                          WHERE li.asset_id = a.id AND li.returned_at IS NULL
                            AND lo.due_date < (now() AT TIME ZONE 'Asia/Manila')::date) AS overdue
            FROM assets a WHERE a.asset_code = ${code}
             FOR UPDATE OF a`,
    );
  }

  /** Half-open [from, until + 1 + buffer): the buffer keeps the unit for its inspection (D5). */
  async reserve(
    tx: Tx,
    assetId: string,
    itemId: string,
    from: string,
    until: string,
    bufferDays: number,
  ): Promise<void> {
    await tx.execute(sql`
      INSERT INTO reservations (asset_id, loan_request_item_id, period)
      VALUES (${assetId}, ${itemId}, daterange(${from}::date, ${addDays(until, 1 + bufferDays)}::date, '[)'))`);
  }

  async cancelReservations(
    tx: Tx,
    requestId: string,
    to: 'cancelled' | 'expired',
  ): Promise<number> {
    return rowCount(
      tx,
      sql`UPDATE reservations r SET status = ${to}::reservation_status
            FROM loan_request_items i
           WHERE i.id = r.loan_request_item_id AND i.loan_request_id = ${requestId}
             AND r.status IN ('active', 'needs_reassignment')`,
    );
  }

  /** The request's reservation for a scanned unit, if it is still waiting to be released. */
  reservationFor(
    tx: Tx,
    requestId: string,
    code: string,
  ): Promise<{ id: string; assetId: string; status: string; assetStatus: string } | null> {
    return maybeOne(
      tx,
      sql`SELECT r.id, r.asset_id AS "assetId", r.status, a.status AS "assetStatus"
            FROM reservations r
            JOIN loan_request_items i ON i.id = r.loan_request_item_id
            JOIN assets a ON a.id = r.asset_id
           WHERE i.loan_request_id = ${requestId} AND a.asset_code = ${code}
             AND r.status IN ('active', 'needs_reassignment', 'released')
             FOR UPDATE OF r`,
    );
  }

  async loanFor(tx: Tx, requestId: string): Promise<{ id: string } | null> {
    return maybeOne(tx, sql`SELECT id FROM loans WHERE loan_request_id = ${requestId}`);
  }

  createLoan(tx: Tx, request: RequestState, releasedBy: string): Promise<{ id: string }> {
    return one(
      tx,
      sql`INSERT INTO loans (loan_no, loan_request_id, partner_org_id, contact_name, contact_email, contact_phone,
                             released_by_user_id, released_at, due_date)
          VALUES (${request.number}, ${request.id}, ${request.partnerOrgId}, ${request.contactName},
                  ${request.contactEmail}, ${request.contactPhone}, ${releasedBy}, now(), ${request.neededUntil}::date)
          RETURNING id`,
    );
  }

  addLoanItem(
    tx: Tx,
    input: {
      loanId: string;
      partnerOrgId: string;
      assetId: string;
      reservationId: string;
      accessoriesOut: string[];
    },
  ): Promise<{ id: string }> {
    return one(
      tx,
      sql`INSERT INTO loan_items (loan_id, partner_org_id, asset_id, reservation_id, released_at, accessories_out)
          VALUES (${input.loanId}, ${input.partnerOrgId}, ${input.assetId}, ${input.reservationId}, now(),
                  ${JSON.stringify(input.accessoriesOut)}::jsonb)
          RETURNING id`,
    );
  }

  async setReservationStatus(tx: Tx, reservationId: string, status: string): Promise<void> {
    await tx.execute(
      sql`UPDATE reservations SET status = ${status}::reservation_status WHERE id = ${reservationId}`,
    );
  }

  async waitingReservations(tx: Tx, requestId: string): Promise<number> {
    const { n } = await one<{ n: number }>(
      tx,
      sql`SELECT count(*)::int AS n FROM reservations r JOIN loan_request_items i ON i.id = r.loan_request_item_id
           WHERE i.loan_request_id = ${requestId} AND r.status IN ('active', 'needs_reassignment')`,
    );
    return n;
  }

  /** The unreturned loan item for a scanned unit on this loan, locked. */
  openItem(tx: Tx, loanId: string, code: string): Promise<{ id: string; assetId: string } | null> {
    return maybeOne(
      tx,
      sql`SELECT li.id, li.asset_id AS "assetId"
            FROM loan_items li JOIN assets a ON a.id = li.asset_id
           WHERE li.loan_id = ${loanId} AND a.asset_code = ${code} AND li.returned_at IS NULL
             FOR UPDATE OF li`,
    );
  }

  async markReturned(tx: Tx, itemId: string, accessoriesBack: string[]): Promise<void> {
    await tx.execute(sql`
      UPDATE loan_items SET returned_at = now(), accessories_back = ${JSON.stringify(accessoriesBack)}::jsonb
       WHERE id = ${itemId}`);
  }

  /** Closes the loan once its last unit is back (plan D8). */
  async closeLoanIfDone(tx: Tx, loanId: string): Promise<boolean> {
    const changed = await rowCount(
      tx,
      sql`UPDATE loans SET closed_at = now()
           WHERE id = ${loanId} AND closed_at IS NULL
             AND NOT EXISTS (SELECT 1 FROM loan_items WHERE loan_id = ${loanId} AND returned_at IS NULL)`,
    );
    return changed === 1;
  }

  async currentDueDate(tx: Tx, loanId: string): Promise<{ due: string; closed: boolean }> {
    return one(
      tx,
      sql`SELECT GREATEST(lo.due_date, (SELECT max(e.requested_due_date) FROM loan_extensions e
                                          WHERE e.loan_id = lo.id AND e.status = 'approved'))::text AS due,
                 lo.closed_at IS NOT NULL AS closed
            FROM loans lo WHERE lo.id = ${loanId} FOR UPDATE`,
    );
  }

  async addExtension(
    tx: Tx,
    loanId: string,
    partnerOrgId: string,
    userId: string,
    due: string,
    reason: string,
  ): Promise<void> {
    await tx.execute(sql`
      INSERT INTO loan_extensions (loan_id, partner_org_id, requested_by_user_id, requested_due_date, reason,
                                   status, decided_by_user_id, decided_at)
      VALUES (${loanId}, ${partnerOrgId}, ${userId}, ${due}::date, ${reason}, 'approved', ${userId}, now())`);
  }

  /** Widens the occupying reservations of units still out; the exclusion constraint decides (D6). */
  async extendReservations(
    tx: Tx,
    loanId: string,
    newDue: string,
    bufferDays: number,
  ): Promise<void> {
    await tx.execute(sql`
      UPDATE reservations r
         SET period = daterange(lower(r.period), ${addDays(newDue, 1 + bufferDays)}::date, '[)')
        FROM loan_items li
       WHERE li.reservation_id = r.id AND li.loan_id = ${loanId} AND li.returned_at IS NULL`);
  }

  /** Units an approver may assign: the model's units that are physically usable and free. */
  async candidates(tx: Tx, request: RequestState, bufferDays: number): Promise<Candidates> {
    const upper = addDays(request.neededUntil, 1 + bufferDays);
    const units = await rows<Candidates['units'][number]>(
      tx,
      sql`SELECT a.asset_code AS code, a.serial_number AS serial, a.status, a.condition,
                 CASE WHEN l.id IS NULL THEN NULL ELSE json_build_object('id', l.id, 'name', l.name,
                   'kind', l.kind, 'roomName', CASE WHEN l.kind = 'shelf' THEN p.name END) END AS location
            FROM assets a
            LEFT JOIN locations l ON l.id = a.current_location_id
            LEFT JOIN locations p ON p.id = l.parent_id
           WHERE a.product_model_id = ${request.modelId}
             AND a.status IN ('in_stock', 'returned', 'under_inspection', 'on_demo')
             AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.asset_id = a.id
                               AND r.status IN ('active', 'needs_reassignment', 'released')
                               AND r.period && daterange(${request.neededFrom}::date, ${upper}::date, '[)'))
             AND NOT EXISTS (SELECT 1 FROM loan_items li JOIN loans lo ON lo.id = li.loan_id
                              WHERE li.asset_id = a.id AND li.returned_at IS NULL
                                AND lo.due_date < (now() AT TIME ZONE 'Asia/Manila')::date)
           ORDER BY (a.status = 'in_stock') DESC, a.asset_code
           LIMIT 100`,
    );
    const { n } = await one<{ n: number }>(
      tx,
      sql`SELECT count(*)::int AS n FROM loan_requests lr
            JOIN loan_request_items i ON i.loan_request_id = lr.id
           WHERE lr.status = 'submitted' AND lr.id <> ${request.id}
             AND i.product_model_id = ${request.modelId}
             AND lr.needed_from <= ${request.neededUntil}::date AND lr.needed_until >= ${request.neededFrom}::date`,
    );
    return { units, competingPendingCount: n };
  }
}
