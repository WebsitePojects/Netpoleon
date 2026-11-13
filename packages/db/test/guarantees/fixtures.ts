import type { Client } from 'pg';
import { connect, getTestDb } from '../helpers.js';

type StaffRole = 'admin' | 'manager' | 'warehouse' | 'auditor';
type SeededStatus = 'registered' | 'in_stock' | 'retired';

/**
 * Seeds rows as the superuser, so a guarantee test can set up state the app roles could never
 * create themselves. Every value is unique per call: test files share one database and run in
 * parallel, so nothing here may collide or be cleaned up.
 */
export class Fixtures {
  private readonly db: Client;

  private constructor(db: Client) {
    this.db = db;
  }

  static async open(): Promise<Fixtures> {
    return new Fixtures(await connect(getTestDb().superuserUrl));
  }

  async close(): Promise<void> {
    await this.db.end();
  }

  /** A number no other fixture call, in any test file, has received. */
  async next(): Promise<number> {
    const { rows } = await this.db.query<{ n: string }>("SELECT next_counter('test-fixture') AS n");
    return Number(rows[0]?.n);
  }

  async partnerOrg(): Promise<string> {
    const n = await this.next();
    return this.insertId(
      "INSERT INTO partner_orgs (name, type) VALUES ($1, 'partner') RETURNING id",
      [`Org ${n}`],
    );
  }

  async staffUser(role: StaffRole = 'warehouse'): Promise<string> {
    const n = await this.next();
    return this.insertId(
      `INSERT INTO users (email, full_name, kind, role)
       VALUES ($1, $2, 'staff', $3) RETURNING id`,
      [`staff-${n}@example.test`, `Staff ${n}`, role],
    );
  }

  async partnerUser(partnerOrgId: string): Promise<string> {
    const n = await this.next();
    return this.insertId(
      `INSERT INTO users (email, full_name, kind, role, partner_org_id)
       VALUES ($1, $2, 'partner', 'partner_member', $3) RETURNING id`,
      [`partner-${n}@example.test`, `Partner ${n}`, partnerOrgId],
    );
  }

  async productModel(options: { bookable?: boolean } = {}): Promise<string> {
    const n = await this.next();
    return this.insertId(
      `INSERT INTO product_models (category_id, brand, model_name, is_bookable)
       VALUES ((SELECT id FROM categories WHERE code = 'SW'), $1, $2, $3) RETURNING id`,
      [`Brand ${n}`, `Model ${n}`, options.bookable ?? true],
    );
  }

  async location(): Promise<string> {
    const n = await this.next();
    return this.insertId(
      "INSERT INTO locations (kind, code, name) VALUES ('shelf', $1, $2) RETURNING id",
      [`LOC-${n}`, `Shelf ${n}`],
    );
  }

  /**
   * A unit and its history in one transaction, because an asset without a movement cannot
   * commit. 'in_stock' is registered then stocked; 'retired' goes on to be retired.
   */
  async asset(
    productModelId: string,
    actorUserId: string,
    status: SeededStatus = 'in_stock',
  ): Promise<string> {
    const n = await this.next();
    await this.db.query('BEGIN');
    try {
      const assetId = await this.insertId(
        `INSERT INTO assets (asset_code, serial_number, product_model_id)
         VALUES ($1, $2, $3) RETURNING id`,
        [`NTP-SW-${String(n).padStart(5, '0')}`, `SN-${n}`, productModelId],
      );
      await this.movement(assetId, actorUserId, 'registered', 'registered', 'registered');
      if (status !== 'registered') {
        await this.movement(assetId, actorUserId, 'stocked', 'registered', 'in_stock');
      }
      if (status === 'retired') {
        await this.movement(assetId, actorUserId, 'retired', 'in_stock', 'retired');
      }
      await this.db.query('COMMIT');
      return assetId;
    } catch (error) {
      await this.db.query('ROLLBACK');
      throw error;
    }
  }

  async movement(
    assetId: string,
    actorUserId: string,
    movementType: string,
    fromStatus: string,
    toStatus: string,
    toLocationId: string | null = null,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO asset_movements
         (asset_id, movement_type, from_status, to_status, to_location_id, actor_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [assetId, movementType, fromStatus, toStatus, toLocationId, actorUserId],
    );
  }

  async auditEntry(actorUserId: string): Promise<void> {
    await this.db.query(
      "INSERT INTO audit_log (actor_user_id, action, target_type) VALUES ($1, 'test', 'test')",
      [actorUserId],
    );
  }

  async loanRequest(partnerOrgId: string, filedByUserId: string): Promise<string> {
    const n = await this.next();
    return this.insertId(
      `INSERT INTO loan_requests
         (request_no, partner_org_id, filed_by_user_id, contact_name, contact_email,
          contact_phone, needed_from, needed_until, purpose)
       VALUES ($1, $2, $3, 'Contact', 'contact@example.test', '0000', '2030-03-01', '2030-03-05', 'demo')
       RETURNING id`,
      [`REQ-T-${n}`, partnerOrgId, filedByUserId],
    );
  }

  async loanRequestItem(
    loanRequestId: string,
    partnerOrgId: string,
    productModelId: string,
    quantity = 1,
  ): Promise<string> {
    return this.insertId(
      `INSERT INTO loan_request_items
         (loan_request_id, partner_org_id, product_model_id, quantity_requested)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [loanRequestId, partnerOrgId, productModelId, quantity],
    );
  }

  /** `period` is the half-open text form, for example '[2030-03-01,2030-03-05)'. */
  async reservation(
    assetId: string,
    loanRequestItemId: string,
    period: string,
    status = 'active',
  ): Promise<string> {
    return this.insertId(
      `INSERT INTO reservations (asset_id, loan_request_item_id, period, status)
       VALUES ($1, $2, $3::daterange, $4) RETURNING id`,
      [assetId, loanRequestItemId, period, status],
    );
  }

  async loan(
    loanRequestId: string,
    partnerOrgId: string,
    releasedByUserId: string,
  ): Promise<string> {
    const n = await this.next();
    return this.insertId(
      `INSERT INTO loans
         (loan_no, loan_request_id, partner_org_id, contact_name, contact_email, contact_phone,
          released_by_user_id, released_at, due_date)
       VALUES ($1, $2, $3, 'Contact', 'contact@example.test', '0000', $4, now(), '2030-03-05')
       RETURNING id`,
      [`BRR-T-${n}`, loanRequestId, partnerOrgId, releasedByUserId],
    );
  }

  async loanItem(loanId: string, partnerOrgId: string, assetId: string): Promise<string> {
    return this.insertId(
      `INSERT INTO loan_items (loan_id, partner_org_id, asset_id, released_at)
       VALUES ($1, $2, $3, now()) RETURNING id`,
      [loanId, partnerOrgId, assetId],
    );
  }

  private async insertId(sql: string, params: unknown[]): Promise<string> {
    const { rows } = await this.db.query<{ id: string }>(sql, params);
    const id = rows[0]?.id;
    if (!id) {
      throw new Error('Fixture insert returned no id.');
    }
    return id;
  }
}
