import type {
  ExportUnitsQuery,
  ListUnitsQuery,
  Movement,
  Unit,
  UnitReservation,
} from '@wms/contracts';
import type { Tx } from '@wms/db';
import { sql, type SQL } from 'drizzle-orm';
import { iso } from '../../platform/dates.js';
import { maybeOne, one, rowCount, rows } from '../../platform/sql.js';
import { modelKey, shelfKey, type ImportLookup } from './units.import.js';

export interface UnitRow extends Omit<Unit, 'registeredAt' | 'updatedAt'> {
  id: string;
  registeredAt: Date | string;
  updatedAt: Date | string;
}

/** A unit's status and the facts a status change needs, read under a row lock. */
export interface UnitState {
  id: string;
  code: string;
  status: Unit['status'];
  locationId: string | null;
  categoryCode: string;
}

const UNIT_SELECT = sql`
  SELECT a.id, a.asset_code AS code, a.serial_number AS serial, a.status, a.condition,
         m.id AS "modelId", m.brand, m.model_name AS model, c.code AS "categoryCode",
         CASE WHEN l.id IS NULL THEN NULL
              ELSE json_build_object('id', l.id, 'name', l.name, 'kind', l.kind,
                                     'roomName', CASE WHEN l.kind = 'shelf' THEN p.name END)
         END AS location,
         COALESCE((SELECT json_agg(x.name ORDER BY x.name) FROM model_accessories x
                    WHERE x.product_model_id = m.id), '[]'::json) AS accessories,
         a.notes,
         (SELECT lr.request_no
            FROM reservations r
            JOIN loan_request_items i ON i.id = r.loan_request_item_id
            JOIN loan_requests lr ON lr.id = i.loan_request_id
           WHERE r.asset_id = a.id AND r.status IN ('active', 'needs_reassignment')
           ORDER BY lower(r.period) LIMIT 1) AS "reservedFor",
         a.created_at AS "registeredAt", a.updated_at AS "updatedAt"
    FROM assets a
    JOIN product_models m ON m.id = a.product_model_id
    JOIN categories c ON c.id = m.category_id
    LEFT JOIN locations l ON l.id = a.current_location_id
    LEFT JOIN locations p ON p.id = l.parent_id`;

/** Allow-listed sort columns; `id` breaks ties so OFFSET paging never repeats or skips a row. */
const SORTS: Record<NonNullable<ListUnitsQuery['sort']>, SQL> = {
  code: sql`a.asset_code`,
  model: sql`m.brand, m.model_name`,
  status: sql`a.status`,
  location: sql`l.name`,
  updatedAt: sql`a.updated_at`,
};

/** LIKE wildcards in a search term are literal text, not patterns. */
export function containsPattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, '\\$&')}%`;
}

function where(filters: ExportUnitsQuery): SQL {
  const parts: SQL[] = [];
  parts.push(
    filters.status ? sql`a.status IN ${filters.status}` : sql`a.status NOT IN ('retired', 'lost')`,
  );
  if (filters.q) {
    const pattern = containsPattern(filters.q);
    // Each branch matches one trigram index from migration 0011, repeated exactly.
    parts.push(sql`(a.asset_code ILIKE ${pattern} OR a.serial_number ILIKE ${pattern}
                    OR (m.brand || ' ' || m.model_name) ILIKE ${pattern})`);
  }
  if (filters.category) parts.push(sql`c.code = ${filters.category}`);
  if (filters.location) parts.push(sql`a.current_location_id = ${filters.location}`);
  if (filters.codes) parts.push(sql`a.asset_code IN ${filters.codes}`);
  return sql.join(parts, sql` AND `);
}

function orderBy(filters: ExportUnitsQuery): SQL {
  const direction = filters.order === 'asc' ? sql`ASC` : sql`DESC`;
  if (!filters.sort) return sql`a.updated_at DESC, a.id DESC`;
  return sql`${SORTS[filters.sort]} ${direction} NULLS LAST, a.id ${direction}`;
}

export function toUnit(row: UnitRow): Unit {
  const { id: _id, registeredAt, updatedAt, ...rest } = row;
  return {
    ...rest,
    registeredAt: iso(registeredAt) as string,
    updatedAt: iso(updatedAt) as string,
  };
}

interface MovementRow extends Omit<Movement, 'at'> {
  at: Date | string;
}

const MOVEMENT_SELECT = sql`
  SELECT mv.id, mv.occurred_at AS at, a.asset_code AS "unitCode", mv.movement_type AS type,
         mv.from_status AS "fromStatus", mv.to_status AS "toStatus",
         fl.name AS "fromLocation", tl.name AS "toLocation",
         CASE WHEN u.id IS NULL THEN NULL
              ELSE json_build_object('id', u.id, 'name', u.full_name, 'username', u.username, 'title', u.title)
         END AS by,
         lo.loan_no AS "transactionNumber", mv.note
    FROM asset_movements mv
    JOIN assets a ON a.id = mv.asset_id
    LEFT JOIN locations fl ON fl.id = mv.from_location_id
    LEFT JOIN locations tl ON tl.id = mv.to_location_id
    LEFT JOIN users u ON u.id = mv.actor_user_id
    LEFT JOIN loan_items li ON li.id = mv.loan_item_id
    LEFT JOIN loans lo ON lo.id = li.loan_id`;

export function toMovement(row: MovementRow): Movement {
  return { ...row, at: iso(row.at) as string };
}

/** Keyset cursor for the movement feed: the last row's (occurred_at, id). */
export function movementCursor(row: Movement): string {
  return Buffer.from(JSON.stringify([row.at, row.id])).toString('base64url');
}

function decodeCursor(cursor: string): [string, string] | null {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === 'string' &&
      !Number.isNaN(Date.parse(value[0])) &&
      typeof value[1] === 'string' &&
      /^[0-9a-f-]{36}$/i.test(value[1])
    ) {
      return [value[0], value[1]];
    }
  } catch {
    // Fall through: a malformed cursor is the caller's error, reported below.
  }
  return null;
}

export class UnitsRepository {
  async list(
    tx: Tx,
    query: ListUnitsQuery,
    offset: number,
  ): Promise<{ items: Unit[]; total: number }> {
    const filter = where(query);
    const items = await rows<UnitRow>(
      tx,
      sql`${UNIT_SELECT} WHERE ${filter} ORDER BY ${orderBy(query)} LIMIT ${query.pageSize} OFFSET ${offset}`,
    );
    const { total } = await one<{ total: number }>(
      tx,
      sql`SELECT count(*)::int AS total
            FROM assets a
            JOIN product_models m ON m.id = a.product_model_id
            JOIN categories c ON c.id = m.category_id
           WHERE ${filter}`,
    );
    return { items: items.map(toUnit), total };
  }

  async export(tx: Tx, query: ExportUnitsQuery, limit: number): Promise<Unit[]> {
    const found = await rows<UnitRow>(
      tx,
      sql`${UNIT_SELECT} WHERE ${where(query)} ORDER BY ${orderBy(query)} LIMIT ${limit}`,
    );
    return found.map(toUnit);
  }

  async byCode(tx: Tx, code: string): Promise<(Unit & { id: string }) | null> {
    const row = await maybeOne<UnitRow>(tx, sql`${UNIT_SELECT} WHERE a.asset_code = ${code}`);
    return row ? { ...toUnit(row), id: row.id } : null;
  }

  /** Locks the unit row so two changes to one unit queue instead of interleaving. */
  lockByCode(tx: Tx, code: string): Promise<UnitState | null> {
    return maybeOne(
      tx,
      sql`SELECT a.id, a.asset_code AS code, a.status, a.current_location_id AS "locationId",
                 c.code AS "categoryCode"
            FROM assets a
            JOIN product_models m ON m.id = a.product_model_id
            JOIN categories c ON c.id = m.category_id
           WHERE a.asset_code = ${code}
             FOR UPDATE OF a`,
    );
  }

  ownership(
    tx: Tx,
    assetId: string,
  ): Promise<{ ownership: 'owned' | 'vendor_consigned'; ownerName: string | null }> {
    return one(
      tx,
      sql`SELECT ownership, owner_name AS "ownerName" FROM assets WHERE id = ${assetId}`,
    );
  }

  reservations(tx: Tx, assetId: string, bufferDays: number): Promise<UnitReservation[]> {
    return rows(
      tx,
      sql`SELECT lr.request_no AS "transactionNumber", o.name AS company,
                 lower(r.period)::text AS "from",
                 (upper(r.period) - 1 - ${bufferDays}::int)::text AS until,
                 r.status
            FROM reservations r
            JOIN loan_request_items i ON i.id = r.loan_request_item_id
            JOIN loan_requests lr ON lr.id = i.loan_request_id
            JOIN partner_orgs o ON o.id = lr.partner_org_id
           WHERE r.asset_id = ${assetId}
             AND r.status IN ('active', 'needs_reassignment', 'released')
           ORDER BY lower(r.period)`,
    );
  }

  async movements(
    tx: Tx,
    assetId: string,
    limit: number,
    cursor: string | undefined,
  ): Promise<Movement[] | null> {
    let after = sql`TRUE`;
    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (!decoded) return null;
      after = sql`(mv.occurred_at, mv.id) < (${decoded[0]}::timestamptz, ${decoded[1]}::uuid)`;
    }
    const found = await rows<MovementRow>(
      tx,
      sql`${MOVEMENT_SELECT}
           WHERE mv.asset_id = ${assetId} AND ${after}
           ORDER BY mv.occurred_at DESC, mv.id DESC
           LIMIT ${limit}`,
    );
    return found.map(toMovement);
  }

  /**
   * Everything an import file is matched against, in three queries whatever its length: every
   * model and shelf (dozens of rows each), and the units already holding one of its serials.
   */
  async importLookup(tx: Tx, serials: readonly string[]): Promise<ImportLookup> {
    const models = await rows<{ id: string; label: string; categoryCode: string }>(
      tx,
      sql`SELECT m.id, m.brand || ' ' || m.model_name AS label, c.code AS "categoryCode"
            FROM product_models m JOIN categories c ON c.id = m.category_id`,
    );
    const shelves = await rows<{ id: string; code: string }>(
      tx,
      sql`SELECT id, code FROM locations WHERE kind = 'shelf'`,
    );
    const taken =
      serials.length === 0
        ? []
        : await rows<{ modelId: string; serial: string }>(
            tx,
            sql`SELECT product_model_id AS "modelId", serial_number AS serial
                  FROM assets WHERE serial_number IN ${[...serials]}`,
          );
    return {
      models: new Map(
        models.map((m) => [modelKey(m.label), { id: m.id, categoryCode: m.categoryCode }]),
      ),
      shelves: new Map(shelves.map((s) => [shelfKey(s.code), s.id])),
      taken: new Set(taken.map((t) => `${t.modelId}|${t.serial}`)),
    };
  }

  modelCategory(tx: Tx, modelId: string): Promise<{ code: string } | null> {
    return maybeOne(
      tx,
      sql`SELECT c.code FROM product_models m JOIN categories c ON c.id = m.category_id
           WHERE m.id = ${modelId}`,
    );
  }

  async locationKind(tx: Tx, locationId: string): Promise<string | null> {
    const row = await maybeOne<{ kind: string }>(
      tx,
      sql`SELECT kind FROM locations WHERE id = ${locationId}`,
    );
    return row?.kind ?? null;
  }

  /**
   * Inserts only the columns the staff role may write (status and location are not among
   * them), with the next code from the category's gap-free counter.
   */
  insert(
    tx: Tx,
    input: {
      modelId: string;
      categoryCode: string;
      serial: string;
      condition: string;
      notes: string | null;
    },
  ): Promise<{ id: string; code: string }> {
    return one(
      tx,
      sql`INSERT INTO assets (asset_code, serial_number, product_model_id, condition, notes)
          VALUES ('NTP-' || ${input.categoryCode} || '-' ||
                    lpad(next_counter('NTP-' || ${input.categoryCode})::text, 5, '0'),
                  ${input.serial}, ${input.modelId}, ${input.condition}::condition_grade, ${input.notes})
          RETURNING id, asset_code AS code`,
    );
  }

  async update(
    tx: Tx,
    assetId: string,
    patch: {
      serial?: string | undefined;
      condition?: string | undefined;
      notes?: string | null | undefined;
    },
  ): Promise<void> {
    await tx.execute(sql`
      UPDATE assets
         SET serial_number = COALESCE(${patch.serial ?? null}, serial_number),
             condition = COALESCE(${patch.condition ?? null}::condition_grade, condition),
             notes = CASE WHEN ${'notes' in patch}::boolean THEN ${patch.notes ?? null} ELSE notes END
       WHERE id = ${assetId}`);
  }

  async markRetired(tx: Tx, assetId: string): Promise<void> {
    await tx.execute(sql`UPDATE assets SET retired_at = now() WHERE id = ${assetId}`);
  }

  /**
   * The only way a unit's status or location changes. The trigger checks `from` against the
   * unit's current status (raising WM001 if another request moved it first) and applies it.
   */
  async move(
    tx: Tx,
    input: {
      assetId: string;
      type: string;
      from: string;
      to: string;
      toLocationId?: string | null;
      actorUserId: string;
      loanItemId?: string | null;
      note?: string | null;
    },
  ): Promise<void> {
    await tx.execute(sql`
      INSERT INTO asset_movements
        (asset_id, movement_type, from_status, to_status, to_location_id, actor_user_id, loan_item_id, note)
      VALUES (${input.assetId}, ${input.type}::movement_type, ${input.from}::asset_status,
              ${input.to}::asset_status, ${input.toLocationId ?? null}, ${input.actorUserId},
              ${input.loanItemId ?? null}, ${input.note ?? null})`);
  }

  async openRepairTicket(tx: Tx, assetId: string, userId: string, problem: string): Promise<void> {
    await tx.execute(sql`
      INSERT INTO repair_tickets (asset_id, opened_by_user_id, problem)
      VALUES (${assetId}, ${userId}, ${problem})`);
  }

  async closeRepairTicket(tx: Tx, assetId: string, resolution: string | null): Promise<void> {
    await tx.execute(sql`
      UPDATE repair_tickets SET closed_at = now(), resolution = ${resolution}
       WHERE asset_id = ${assetId} AND closed_at IS NULL`);
  }

  /**
   * Plan D9: a unit that becomes unusable has its future bookings flagged for a manager to
   * reassign. Nothing is moved automatically: which borrower is disappointed is a business call.
   */
  flagFutureReservations(tx: Tx, assetId: string, today: string): Promise<number> {
    return rowCount(
      tx,
      sql`UPDATE reservations SET status = 'needs_reassignment'
           WHERE asset_id = ${assetId} AND status = 'active' AND upper(period) > ${today}::date`,
    );
  }
}
