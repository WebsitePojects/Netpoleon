import type { Catalog } from '@wms/contracts';
import { schema, type Tx } from '@wms/db';
import { asc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

const { categories, productModels, modelAccessories, locations } = schema;
const parent = alias(locations, 'parent');

/** SQL for categories, product models and locations. */
export class CatalogRepository {
  /** Three queries whatever the size: accessories are aggregated per model, not fetched per row. */
  async catalog(tx: Tx): Promise<Catalog> {
    const categoryRows = await tx
      .select({
        id: categories.id,
        code: categories.code,
        name: categories.name,
        unitCount: sql<number>`(
          SELECT count(*) FROM assets a JOIN product_models m ON m.id = a.product_model_id
           WHERE m.category_id = categories.id AND a.status <> 'retired')::int`,
      })
      .from(categories)
      .orderBy(asc(categories.name));
    const modelRows = await tx
      .select({
        id: productModels.id,
        categoryId: productModels.categoryId,
        brand: productModels.brand,
        modelName: productModels.modelName,
        isBookable: productModels.isBookable,
        // Written with explicit table names: in a one-table select Drizzle drops the table
        // from column references, and inside this subquery a bare "id" would mean the
        // accessory's own id.
        accessories: sql<string[]>`coalesce(
          (SELECT array_agg(ma.name ORDER BY ma.name)
             FROM model_accessories ma
            WHERE ma.product_model_id = product_models.id),
          '{}')`,
      })
      .from(productModels)
      .orderBy(asc(productModels.brand), asc(productModels.modelName));
    const locationRows = await tx
      .select({
        id: locations.id,
        code: locations.code,
        name: locations.name,
        kind: locations.kind,
        parentId: locations.parentId,
        parentName: parent.name,
        // Joined query: Drizzle qualifies these, but the subquery still names its own table.
        unitCount: sql<number>`(
          SELECT count(*) FROM assets a
           WHERE a.current_location_id = ${locations.id} AND a.status <> 'retired')::int`,
      })
      .from(locations)
      .leftJoin(parent, eq(parent.id, locations.parentId))
      .orderBy(asc(locations.kind), asc(locations.name));
    return { categories: categoryRows, models: modelRows, locations: locationRows };
  }

  async insertCategory(tx: Tx, values: { name: string; code: string }) {
    const [row] = await tx
      .insert(categories)
      .values(values)
      .returning({ id: categories.id, code: categories.code, name: categories.name });
    if (!row) throw new Error('Category insert returned no row.');
    return { ...row, unitCount: 0 };
  }

  async insertLocation(
    tx: Tx,
    values: {
      name: string;
      code: string;
      kind: 'site' | 'room' | 'shelf';
      parentId: string | null;
    },
  ) {
    const [row] = await tx.insert(locations).values(values).returning({ id: locations.id });
    if (!row) throw new Error('Location insert returned no row.');
    return row.id;
  }

  async locationKind(tx: Tx, id: string): Promise<'site' | 'room' | 'shelf' | null> {
    const [row] = await tx
      .select({ kind: locations.kind })
      .from(locations)
      .where(eq(locations.id, id));
    return row?.kind ?? null;
  }

  async categoryExists(tx: Tx, id: string): Promise<boolean> {
    const [row] = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, id));
    return row !== undefined;
  }

  async insertModel(
    tx: Tx,
    values: { categoryId: string; brand: string; modelName: string; isBookable: boolean },
    accessories: string[],
  ): Promise<string> {
    const [row] = await tx.insert(productModels).values(values).returning({ id: productModels.id });
    if (!row) throw new Error('Model insert returned no row.');
    const unique = [...new Map(accessories.map((name) => [name.toLowerCase(), name])).values()];
    if (unique.length > 0) {
      await tx
        .insert(modelAccessories)
        .values(unique.map((name) => ({ productModelId: row.id, name })));
    }
    return row.id;
  }
}
