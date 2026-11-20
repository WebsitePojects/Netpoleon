import type {
  CreatePartnerBody,
  ListDirectoryQuery,
  Partner,
  PartnerContact,
  PartnerSummary,
  UpdatePartnerBody,
} from '@wms/contracts';
import type { Tx } from '@wms/db';
import { sql, type SQL } from 'drizzle-orm';
import { iso } from '../../platform/dates.js';
import { maybeOne, one, rowCount, rows } from '../../platform/sql.js';
import { containsPattern } from '../units/units.repository.js';

/**
 * Activity per company. Correlated subqueries, each served by an index on `partner_org_id`
 * (`loan_requests_org_created_idx`, `loan_items_open_org_idx`, `partner_contacts_org_email_key`),
 * so a page of 25 costs 25 index probes per column. The directory is expected to hold a few
 * hundred companies; sorting by an activity column computes it for every filtered company,
 * which stays cheap well past ten thousand.
 */
const SUMMARY_SELECT = sql`
  SELECT o.id, o.name, o.type, o.status, o.created_at AS "createdAt",
         (SELECT count(*)::int FROM partner_contacts c WHERE c.partner_org_id = o.id) AS "contactCount",
         (SELECT count(*)::int FROM loan_requests r WHERE r.partner_org_id = o.id) AS "requestCount",
         (SELECT count(*)::int FROM loan_requests r
           WHERE r.partner_org_id = o.id AND r.status IN ('submitted', 'approved')) AS "openRequests",
         (SELECT count(*)::int FROM loan_items i
           WHERE i.partner_org_id = o.id AND i.returned_at IS NULL) AS "unitsOut",
         (SELECT max(r.created_at) FROM loan_requests r WHERE r.partner_org_id = o.id) AS "lastActivityAt"
    FROM partner_orgs o`;

type SummaryRow = Omit<PartnerSummary, 'createdAt' | 'lastActivityAt'> & {
  createdAt: Date | string;
  lastActivityAt: Date | string | null;
};

function toSummary(row: SummaryRow): PartnerSummary {
  return {
    ...row,
    createdAt: iso(row.createdAt) as string,
    lastActivityAt: iso(row.lastActivityAt),
  };
}

const SORTS: Record<NonNullable<ListDirectoryQuery['sort']>, SQL> = {
  name: sql`lower(s.name)`,
  type: sql`s.type`,
  unitsOut: sql`s."unitsOut"`,
  lastActivityAt: sql`s."lastActivityAt"`,
};

/** Locked company state: the row every directory write and every new request serialises on. */
export interface PartnerState {
  id: string;
  name: string;
  status: Partner['status'];
}

export interface ContactInput {
  name: string;
  email: string;
  phone: string;
}

export class PartnersRepository {
  /** Company suggestions for the request form; recently used first when there is no search. */
  suggest(tx: Tx, q: string | undefined, limit: number): Promise<Partner[]> {
    const pattern = q ? containsPattern(q) : null;
    return rows(
      tx,
      sql`SELECT o.id, o.name, o.type, o.status
            FROM partner_orgs o
           WHERE o.status = 'active' AND (${pattern}::text IS NULL OR o.name ILIKE ${pattern})
           ORDER BY (SELECT max(r.created_at) FROM loan_requests r WHERE r.partner_org_id = o.id) DESC NULLS LAST,
                    o.name
           LIMIT ${limit}`,
    );
  }

  async directory(
    tx: Tx,
    query: ListDirectoryQuery,
    offset: number,
  ): Promise<{ items: PartnerSummary[]; total: number }> {
    const parts: SQL[] = [sql`TRUE`];
    if (query.q) parts.push(sql`o.name ILIKE ${containsPattern(query.q)}`);
    if (query.type) parts.push(sql`o.type IN ${query.type}`);
    if (query.status) parts.push(sql`o.status IN ${query.status}`);
    const filter = sql.join(parts, sql` AND `);
    const direction = query.order === 'desc' ? sql`DESC` : sql`ASC`;
    const order = query.sort
      ? sql`${SORTS[query.sort]} ${direction} NULLS LAST, s.id`
      : sql`lower(s.name), s.id`;
    const found = await rows<SummaryRow>(
      tx,
      sql`SELECT * FROM (${SUMMARY_SELECT} WHERE ${filter}) s
           ORDER BY ${order} LIMIT ${query.pageSize} OFFSET ${offset}`,
    );
    const { total } = await one<{ total: number }>(
      tx,
      sql`SELECT count(*)::int AS total FROM partner_orgs o WHERE ${filter}`,
    );
    return { items: found.map(toSummary), total };
  }

  async summary(tx: Tx, id: string): Promise<PartnerSummary | null> {
    const row = await maybeOne<SummaryRow>(tx, sql`${SUMMARY_SELECT} WHERE o.id = ${id}`);
    return row ? toSummary(row) : null;
  }

  async contacts(tx: Tx, partnerOrgId: string): Promise<PartnerContact[]> {
    const found = await rows<
      Omit<PartnerContact, 'lastUsedAt'> & { lastUsedAt: Date | string | null }
    >(
      tx,
      sql`SELECT id, full_name AS name, email::text AS email, phone, last_used_at AS "lastUsedAt"
            FROM partner_contacts
           WHERE partner_org_id = ${partnerOrgId}
           ORDER BY last_used_at DESC NULLS LAST, lower(full_name), id`,
    );
    return found.map((row) => ({ ...row, lastUsedAt: iso(row.lastUsedAt) }));
  }

  /** `FOR UPDATE`: archiving, editing and contact changes on one company queue up. */
  lock(tx: Tx, id: string): Promise<PartnerState | null> {
    return maybeOne(tx, sql`SELECT id, name, status FROM partner_orgs WHERE id = ${id} FOR UPDATE`);
  }

  /**
   * `FOR SHARE`: a request being filed blocks an archive of its company until it commits, so
   * the archive's "no open work" check always sees it. Two requests do not block each other.
   */
  share(tx: Tx, id: string): Promise<PartnerState | null> {
    return maybeOne(tx, sql`SELECT id, name, status FROM partner_orgs WHERE id = ${id} FOR SHARE`);
  }

  create(tx: Tx, body: CreatePartnerBody): Promise<{ id: string }> {
    return one(
      tx,
      sql`INSERT INTO partner_orgs (name, type) VALUES (${body.name}, ${body.type}::org_type) RETURNING id`,
    );
  }

  /**
   * Finds a company by name (case-insensitively) or creates it (plan R1), then share-locks it
   * like `share`. `ON CONFLICT DO NOTHING` keeps two requests naming a new company at once from
   * failing: the loser finds the winner's row.
   */
  async findOrCreate(
    tx: Tx,
    name: string,
    type: string,
  ): Promise<PartnerState & { created: boolean }> {
    const inserted = await maybeOne<PartnerState>(
      tx,
      sql`INSERT INTO partner_orgs (name, type) VALUES (${name}, ${type}::org_type)
          ON CONFLICT (lower(name)) DO NOTHING RETURNING id, name, status`,
    );
    if (inserted) return { ...inserted, created: true };
    const found = await one<PartnerState>(
      tx,
      sql`SELECT id, name, status FROM partner_orgs WHERE lower(name) = lower(${name}) FOR SHARE`,
    );
    return { ...found, created: false };
  }

  async nameTaken(tx: Tx, name: string, exceptId: string | null): Promise<boolean> {
    const found = await maybeOne(
      tx,
      sql`SELECT 1 FROM partner_orgs
           WHERE lower(name) = lower(${name}) AND (${exceptId}::uuid IS NULL OR id <> ${exceptId}::uuid)`,
    );
    return found !== null;
  }

  async hasContact(tx: Tx, partnerOrgId: string, email: string): Promise<boolean> {
    const found = await maybeOne(
      tx,
      sql`SELECT 1 FROM partner_contacts WHERE partner_org_id = ${partnerOrgId} AND email = ${email}`,
    );
    return found !== null;
  }

  async update(tx: Tx, id: string, patch: UpdatePartnerBody): Promise<void> {
    const has = (key: keyof UpdatePartnerBody) => sql`${key in patch}::boolean`;
    await tx.execute(sql`
      UPDATE partner_orgs SET
        name = CASE WHEN ${has('name')} THEN ${patch.name ?? null} ELSE name END,
        type = CASE WHEN ${has('type')} THEN ${patch.type ?? null}::org_type ELSE type END
      WHERE id = ${id}`);
  }

  async setStatus(tx: Tx, id: string, status: Partner['status']): Promise<void> {
    await tx.execute(sql`UPDATE partner_orgs SET status = ${status}::org_status WHERE id = ${id}`);
  }

  /** Requests still to be decided or collected, plus units not yet back. */
  async openWork(tx: Tx, id: string): Promise<{ openRequests: number; unitsOut: number }> {
    return one(
      tx,
      sql`SELECT (SELECT count(*)::int FROM loan_requests
                   WHERE partner_org_id = ${id} AND status IN ('submitted', 'approved')) AS "openRequests",
                 (SELECT count(*)::int FROM loan_items
                   WHERE partner_org_id = ${id} AND returned_at IS NULL) AS "unitsOut"`,
    );
  }

  /** Portal accounts of the company; archiving signs every one of them out. */
  async userIds(tx: Tx, id: string): Promise<string[]> {
    const found = await rows<{ id: string }>(
      tx,
      sql`SELECT id FROM users WHERE partner_org_id = ${id} ORDER BY id`,
    );
    return found.map((row) => row.id);
  }

  addContact(tx: Tx, partnerOrgId: string, contact: ContactInput): Promise<{ id: string }> {
    return one(
      tx,
      sql`INSERT INTO partner_contacts (partner_org_id, full_name, email, phone)
          VALUES (${partnerOrgId}, ${contact.name}, ${contact.email}, ${contact.phone})
          RETURNING id`,
    );
  }

  /**
   * Remembers the contact a request was filed with. The newest details win, so a changed phone
   * number typed on a request updates the directory without a separate edit.
   */
  async rememberContact(tx: Tx, partnerOrgId: string, contact: ContactInput): Promise<void> {
    await tx.execute(sql`
      INSERT INTO partner_contacts (partner_org_id, full_name, email, phone, last_used_at)
      VALUES (${partnerOrgId}, ${contact.name}, ${contact.email}, ${contact.phone}, now())
      ON CONFLICT (partner_org_id, email) DO UPDATE
        SET full_name = EXCLUDED.full_name, phone = EXCLUDED.phone, last_used_at = now()`);
  }

  /** Erases a contact. Past requests keep their own copy, so no history changes. */
  removeContact(tx: Tx, partnerOrgId: string, contactId: string): Promise<number> {
    return rowCount(
      tx,
      sql`DELETE FROM partner_contacts WHERE id = ${contactId} AND partner_org_id = ${partnerOrgId}`,
    );
  }
}
