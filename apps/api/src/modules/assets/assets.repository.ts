import type { Asset, AssetListQuery, AssetStatus, Movement } from '@wms/contracts';
import { schema, type Tx } from '@wms/db';
import { and, asc, desc, eq, gt, ilike, inArray, lt, ne, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

const { assets, productModels, categories, locations, assetMovements, modelAccessories, users } =
  schema;
const fromLocation = alias(locations, 'from_location');
const toLocation = alias(locations, 'to_location');

export interface AssetRow extends Asset {
  currentLocationId: string | null;
}

const assetColumns = {
  id: assets.id,
  assetCode: assets.assetCode,
  serialNumber: assets.serialNumber,
  status: assets.status,
  condition: assets.condition,
  ownership: assets.ownership,
  ownerName: assets.ownerName,
  notes: assets.notes,
  createdAt: assets.createdAt,
  modelId: productModels.id,
  brand: productModels.brand,
  modelName: productModels.modelName,
  categoryId: categories.id,
  categoryCode: categories.code,
  categoryName: categories.name,
  locationId: locations.id,
  locationCode: locations.code,
  locationName: locations.name,
};

type RawAsset = {
  id: string;
  assetCode: string;
  serialNumber: string;
  status: AssetStatus;
  condition: Asset['condition'];
  ownership: Asset['ownership'];
  ownerName: string | null;
  notes: string | null;
  createdAt: Date;
  modelId: string;
  brand: string;
  modelName: string;
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  locationId: string | null;
  locationCode: string | null;
  locationName: string | null;
};

function toAsset(row: RawAsset): AssetRow {
  return {
    id: row.id,
    assetCode: row.assetCode,
    serialNumber: row.serialNumber,
    status: row.status,
    condition: row.condition,
    ownership: row.ownership,
    ownerName: row.ownerName,
    notes: row.notes,
    registeredAt: row.createdAt.toISOString(),
    model: {
      id: row.modelId,
      brand: row.brand,
      modelName: row.modelName,
      categoryId: row.categoryId,
      categoryCode: row.categoryCode,
      categoryName: row.categoryName,
    },
    location:
      row.locationId && row.locationCode && row.locationName
        ? { id: row.locationId, code: row.locationCode, name: row.locationName }
        : null,
    currentLocationId: row.locationId,
  };
}

/** Cursor for the units list: the last row's sort value and id, opaque to the client. */
interface Cursor {
  code?: string;
  at?: string;
  id: string;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function decodeCursor(value: string | undefined): Cursor | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (typeof parsed === 'object' && parsed !== null && 'id' in parsed) return parsed as Cursor;
  } catch {
    // A tampered or stale cursor starts the list again rather than failing the request.
  }
  return null;
}

/** SQL for units and their movements. Status and location change only through a movement row. */
export class AssetsRepository {
  private base(tx: Tx) {
    return tx
      .select(assetColumns)
      .from(assets)
      .innerJoin(productModels, eq(productModels.id, assets.productModelId))
      .innerJoin(categories, eq(categories.id, productModels.categoryId))
      .leftJoin(locations, eq(locations.id, assets.currentLocationId));
  }

  private filters(query: AssetListQuery): SQL | undefined {
    const conditions: (SQL | undefined)[] = [
      query.status ? eq(assets.status, query.status) : ne(assets.status, 'retired'),
      query.categoryId ? eq(categories.id, query.categoryId) : undefined,
      query.locationId ? eq(assets.currentLocationId, query.locationId) : undefined,
    ];
    if (query.q) {
      // A substring search cannot use a btree index. At the promised scale (about 500 units,
      // 5,000 at ten times) the scan is a few milliseconds; add a trigram index before 50,000.
      const pattern = `%${query.q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
      conditions.push(
        or(
          ilike(assets.assetCode, pattern),
          ilike(assets.serialNumber, pattern),
          ilike(productModels.brand, pattern),
          ilike(productModels.modelName, pattern),
          sql`(${productModels.brand} || ' ' || ${productModels.modelName}) ILIKE ${pattern}`,
        ),
      );
    }
    return and(...conditions);
  }

  /** One page by keyset, plus the total that matches the filters (two queries). */
  async list(
    tx: Tx,
    query: AssetListQuery,
  ): Promise<{ items: AssetRow[]; nextCursor: string | null; total: number }> {
    const cursor = decodeCursor(query.cursor);
    const where = this.filters(query);
    let after: SQL | undefined;
    let order: SQL[];
    if (query.sort === 'newest') {
      order = [desc(assets.createdAt), desc(assets.id)];
      if (cursor?.at) {
        after = sql`(${assets.createdAt}, ${assets.id}) < (${cursor.at}::timestamptz, ${cursor.id}::uuid)`;
      }
    } else if (query.sort === '-code') {
      order = [desc(assets.assetCode)];
      if (cursor?.code) after = lt(assets.assetCode, cursor.code);
    } else {
      order = [asc(assets.assetCode)];
      if (cursor?.code) after = gt(assets.assetCode, cursor.code);
    }

    const rows = await this.base(tx)
      .where(and(where, after))
      .orderBy(...order)
      .limit(query.limit + 1);
    const [count] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(assets)
      .innerJoin(productModels, eq(productModels.id, assets.productModelId))
      .innerJoin(categories, eq(categories.id, productModels.categoryId))
      .where(where);

    const page = rows.slice(0, query.limit).map(toAsset);
    const last = page.at(-1);
    const nextCursor =
      rows.length > query.limit && last
        ? encodeCursor(
            query.sort === 'newest'
              ? { at: last.registeredAt, id: last.id }
              : { code: last.assetCode, id: last.id },
          )
        : null;
    return { items: page, nextCursor, total: count?.total ?? 0 };
  }

  /** Locks the unit row, so two changes to one unit are applied one after the other. */
  async byCode(tx: Tx, code: string, lock = false): Promise<AssetRow | null> {
    const query = this.base(tx).where(eq(assets.assetCode, code));
    const [row] = lock ? await query.for('update', { of: assets }) : await query;
    return row ? toAsset(row) : null;
  }

  async byCodes(tx: Tx, codes: string[]): Promise<AssetRow[]> {
    if (codes.length === 0) return [];
    const rows = await this.base(tx)
      .where(inArray(assets.assetCode, codes))
      .orderBy(asc(assets.assetCode))
      .for('update', { of: assets });
    return rows.map(toAsset);
  }

  async movements(tx: Tx, assetId: string, limit: number): Promise<Movement[]> {
    const rows = await tx
      .select({
        id: assetMovements.id,
        type: assetMovements.movementType,
        fromStatus: assetMovements.fromStatus,
        toStatus: assetMovements.toStatus,
        fromLocation: fromLocation.name,
        toLocation: toLocation.name,
        actorName: users.fullName,
        note: assetMovements.note,
        occurredAt: assetMovements.occurredAt,
      })
      .from(assetMovements)
      .innerJoin(users, eq(users.id, assetMovements.actorUserId))
      .leftJoin(fromLocation, eq(fromLocation.id, assetMovements.fromLocationId))
      .leftJoin(toLocation, eq(toLocation.id, assetMovements.toLocationId))
      .where(eq(assetMovements.assetId, assetId))
      .orderBy(desc(assetMovements.occurredAt), desc(assetMovements.id))
      .limit(limit);
    return rows.map((row) => ({ ...row, occurredAt: row.occurredAt.toISOString() }));
  }

  async accessories(tx: Tx, modelId: string): Promise<string[]> {
    const rows = await tx
      .select({ name: modelAccessories.name })
      .from(modelAccessories)
      .where(eq(modelAccessories.productModelId, modelId))
      .orderBy(asc(modelAccessories.name));
    return rows.map((row) => row.name);
  }

  async modelCategoryCode(tx: Tx, modelId: string): Promise<string | null> {
    const [row] = await tx
      .select({ code: categories.code })
      .from(productModels)
      .innerJoin(categories, eq(categories.id, productModels.categoryId))
      .where(eq(productModels.id, modelId));
    return row?.code ?? null;
  }

  async locationKind(tx: Tx, id: string): Promise<'site' | 'room' | 'shelf' | null> {
    const [row] = await tx
      .select({ kind: locations.kind })
      .from(locations)
      .where(eq(locations.id, id));
    return row?.kind ?? null;
  }

  /** The next running number for a category, from a locked counter row: no gaps, no repeats. */
  async nextAssetCode(tx: Tx, categoryCode: string): Promise<string> {
    const result = await tx.execute<{ value: string }>(
      sql`SELECT next_counter(${`asset:${categoryCode}`})::text AS value`,
    );
    const value = Number(result.rows[0]?.value);
    if (!Number.isInteger(value) || value < 1 || value > 99_999) {
      throw new Error(`Asset counter for ${categoryCode} is out of range.`);
    }
    return `NTP-${categoryCode}-${String(value).padStart(5, '0')}`;
  }

  /**
   * Explicit SQL listing only the granted columns. Drizzle's insert() names every column, and
   * the app role has no privilege on status, so it would fail with 42501 by design.
   */
  async insert(
    tx: Tx,
    values: {
      assetCode: string;
      serialNumber: string;
      productModelId: string;
      condition: string;
      ownership: string;
      ownerName: string | null;
      notes: string | null;
    },
  ): Promise<string> {
    const result = await tx.execute<{ id: string }>(sql`
      INSERT INTO assets (asset_code, serial_number, product_model_id, condition, ownership, owner_name, notes)
      VALUES (${values.assetCode}, ${values.serialNumber}, ${values.productModelId},
              ${values.condition}::condition_grade, ${values.ownership}::ownership_type,
              ${values.ownerName}, ${values.notes})
      RETURNING id`);
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Asset insert returned no row.');
    return id;
  }

  /** The only way a status or location changes; the database trigger checks the move. */
  async insertMovement(
    tx: Tx,
    values: {
      assetId: string;
      type: (typeof schema.movementType.enumValues)[number];
      fromStatus: AssetStatus;
      toStatus: AssetStatus;
      toLocationId: string | null;
      actorUserId: string;
      note: string | null;
    },
  ): Promise<void> {
    await tx.insert(assetMovements).values({
      assetId: values.assetId,
      movementType: values.type,
      fromStatus: values.fromStatus,
      toStatus: values.toStatus,
      toLocationId: values.toLocationId,
      actorUserId: values.actorUserId,
      note: values.note,
    });
  }

  /** Changes only the fields given; an undefined field is left as it is. */
  async update(
    tx: Tx,
    id: string,
    patch: {
      serialNumber?: string | undefined;
      condition?: Asset['condition'] | undefined;
      ownership?: Asset['ownership'] | undefined;
      ownerName?: string | null | undefined;
      notes?: string | null | undefined;
      retiredAt?: Date | undefined;
    },
  ): Promise<void> {
    const changes = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(changes).length === 0) return;
    await tx.update(assets).set(changes).where(eq(assets.id, id));
  }

  /**
   * A unit that cannot be lent any more keeps its future reservations, flagged for a manager
   * to reassign (foundation spec section 6). The system never picks a substitute itself.
   */
  async flagFutureReservations(tx: Tx, assetId: string): Promise<number> {
    const result = await tx.execute(sql`
      UPDATE reservations
         SET status = 'needs_reassignment'
       WHERE asset_id = ${assetId}
         AND status = 'active'
         AND upper(period) > (now() AT TIME ZONE 'Asia/Manila')::date`);
    return result.rowCount ?? 0;
  }
}
