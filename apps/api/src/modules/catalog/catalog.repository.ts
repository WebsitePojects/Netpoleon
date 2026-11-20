import type {
  CategoryWithCount,
  CreateCategoryBody,
  CreateLocationBody,
  CreateModelBody,
  LocationWithCount,
  Model,
  ModelAvailability,
} from '@wms/contracts';
import type { Tx } from '@wms/db';
import { sql } from 'drizzle-orm';
import { maybeOne, one, rows } from '../../platform/sql.js';

/**
 * Reference data: categories, product models with their accessories, and the location tree. Small tables (dozens of rows), so lists are returned whole.
 */
export class CatalogRepository {
  listCategories(tx: Tx): Promise<CategoryWithCount[]> {
    return rows(
      tx,
      sql`SELECT c.id, c.code, c.name,
                 (SELECT count(*)::int FROM assets a JOIN product_models m ON m.id = a.product_model_id
                   WHERE m.category_id = c.id AND a.status NOT IN ('retired', 'lost')) AS "unitCount"
            FROM categories c
           ORDER BY c.name`,
    );
  }

  async createCategory(tx: Tx, body: CreateCategoryBody): Promise<{ id: string }> {
    return one(
      tx,
      sql`INSERT INTO categories (name, code) VALUES (${body.name}, ${body.code}) RETURNING id`,
    );
  }

  /** Every location with its parent room's name (the screens' "zone") and live unit count. */
  listLocations(tx: Tx): Promise<LocationWithCount[]> {
    return rows(
      tx,
      sql`SELECT l.id, l.code, l.name, l.kind, l.parent_id AS "parentId",
                 CASE WHEN l.kind = 'shelf' THEN p.name END AS "roomName",
                 (SELECT count(*)::int FROM assets a
                   WHERE a.current_location_id = l.id AND a.status NOT IN ('retired', 'lost')) AS "unitCount"
            FROM locations l
            LEFT JOIN locations p ON p.id = l.parent_id
           ORDER BY l.kind, p.name NULLS FIRST, l.name`,
    );
  }

  async parentKind(tx: Tx, id: string): Promise<string | null> {
    const row = await maybeOne<{ kind: string }>(
      tx,
      sql`SELECT kind FROM locations WHERE id = ${id}`,
    );
    return row?.kind ?? null;
  }

  async createLocation(tx: Tx, body: CreateLocationBody): Promise<{ id: string }> {
    const parentId = 'parentId' in body ? body.parentId : null;
    return one(
      tx,
      sql`INSERT INTO locations (kind, code, name, parent_id)
          VALUES (${body.kind}, ${body.code}, ${body.name}, ${parentId}) RETURNING id`,
    );
  }

  listModels(tx: Tx): Promise<Model[]> {
    return rows(
      tx,
      sql`SELECT m.id, m.brand, m.model_name AS name, m.is_bookable AS "isBookable",
                 json_build_object('id', c.id, 'code', c.code, 'name', c.name) AS category,
                 COALESCE((SELECT json_agg(x.name ORDER BY x.name) FROM model_accessories x
                            WHERE x.product_model_id = m.id), '[]'::json) AS accessories
            FROM product_models m
            JOIN categories c ON c.id = m.category_id
           ORDER BY m.brand, m.model_name`,
    );
  }

  async createModel(tx: Tx, body: CreateModelBody): Promise<{ id: string }> {
    const created = await one<{ id: string }>(
      tx,
      sql`INSERT INTO product_models (category_id, brand, model_name, is_bookable)
          VALUES (${body.categoryId}, ${body.brand}, ${body.name}, ${body.isBookable}) RETURNING id`,
    );
    await this.replaceAccessories(tx, created.id, body.accessories);
    return created;
  }

  async replaceAccessories(tx: Tx, modelId: string, accessories: readonly string[]): Promise<void> {
    await tx.execute(sql`DELETE FROM model_accessories WHERE product_model_id = ${modelId}`);
    for (const name of accessories) {
      await tx.execute(
        sql`INSERT INTO model_accessories (product_model_id, name) VALUES (${modelId}, ${name})`,
      );
    }
  }

  /**
   * Free units per bookable model for an inclusive window that already includes the
   * turnaround buffer (plan R6). Counts come from the elevated `model_availability` function,
   * which sees every company's reservations but returns only numbers.
   */
  availability(tx: Tx, from: string, until: string): Promise<ModelAvailability[]> {
    return rows(
      tx,
      sql`SELECT f.product_model_id AS "modelId", f.units_free AS "unitsFree",
                 (SELECT count(*)::int FROM assets a WHERE a.product_model_id = f.product_model_id
                     AND a.status NOT IN ('retired', 'lost')) AS "unitsTotal"
            FROM model_availability(${from}::date, ${until}::date) f`,
    );
  }
}
