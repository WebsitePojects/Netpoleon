import type { Contact, Partner } from '@wms/contracts';
import { schema, type Tx } from '@wms/db';
import { and, eq, sql, type SQL } from 'drizzle-orm';

const { partnerOrgs, partnerContacts, users } = schema;

type PartnerType = Partner['type'];

/** SQL for partner companies and their contacts. */
export class PartnersRepository {
  /**
   * One statement for the whole list: contacts are aggregated and loan counts are counted per
   * company inside it, so the number of queries does not grow with the number of companies.
   * The subqueries name `partner_orgs.id` literally: in a one-table select Drizzle renders a
   * column as a bare "id", which inside a subquery would bind to the subquery's own table.
   */
  async list(tx: Tx, where?: SQL): Promise<Partner[]> {
    const rows = await tx
      .select({
        id: partnerOrgs.id,
        name: partnerOrgs.name,
        type: partnerOrgs.type,
        status: partnerOrgs.status,
        createdAt: partnerOrgs.createdAt,
        contacts: sql<Contact[]>`coalesce((
          SELECT json_agg(json_build_object(
                   'id', c.id, 'fullName', c.full_name, 'email', c.email, 'phone', c.phone)
                 ORDER BY c.full_name)
            FROM partner_contacts c
           WHERE c.partner_org_id = partner_orgs.id), '[]'::json)`,
        loans: sql<number>`(SELECT count(*) FROM loan_requests r WHERE r.partner_org_id = partner_orgs.id)::int`,
        openLoans: sql<number>`(
          (SELECT count(*) FROM loan_requests r
            WHERE r.partner_org_id = partner_orgs.id AND r.status IN ('submitted', 'approved'))
          + (SELECT count(*) FROM loans l
              WHERE l.partner_org_id = partner_orgs.id AND l.closed_at IS NULL))::int`,
      })
      .from(partnerOrgs)
      .where(where)
      .orderBy(sql`lower(${partnerOrgs.name})`);
    return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  }

  async byId(tx: Tx, id: string): Promise<Partner | null> {
    const [row] = await this.list(tx, eq(partnerOrgs.id, id));
    return row ?? null;
  }

  async lock(tx: Tx, id: string): Promise<{ id: string; name: string; status: string } | null> {
    const [row] = await tx
      .select({ id: partnerOrgs.id, name: partnerOrgs.name, status: partnerOrgs.status })
      .from(partnerOrgs)
      .where(eq(partnerOrgs.id, id))
      .for('update');
    return row ?? null;
  }

  async insert(tx: Tx, values: { name: string; type: PartnerType }): Promise<string> {
    const [row] = await tx.insert(partnerOrgs).values(values).returning({ id: partnerOrgs.id });
    if (!row) throw new Error('Partner insert returned no row.');
    return row.id;
  }

  async update(
    tx: Tx,
    id: string,
    patch: {
      name?: string | undefined;
      type?: PartnerType | undefined;
      status?: 'active' | 'archived';
    },
  ) {
    const changes = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(changes).length > 0) {
      await tx.update(partnerOrgs).set(changes).where(eq(partnerOrgs.id, id));
    }
  }

  async openWork(tx: Tx, id: string): Promise<number> {
    const result = await tx.execute<{ open: number }>(sql`
      SELECT (
        (SELECT count(*) FROM loan_requests WHERE partner_org_id = ${id} AND status IN ('submitted', 'approved'))
        + (SELECT count(*) FROM loans WHERE partner_org_id = ${id} AND closed_at IS NULL)
      )::int AS open`);
    return result.rows[0]?.open ?? 0;
  }

  async userIds(tx: Tx, partnerOrgId: string): Promise<string[]> {
    const rows = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.partnerOrgId, partnerOrgId));
    return rows.map((row) => row.id);
  }

  async insertContact(
    tx: Tx,
    values: { partnerOrgId: string; fullName: string; email: string; phone: string },
  ): Promise<string> {
    const [row] = await tx
      .insert(partnerContacts)
      .values(values)
      .returning({ id: partnerContacts.id });
    if (!row) throw new Error('Contact insert returned no row.');
    return row.id;
  }

  /** Removing a contact is how their personal data is erased; loans keep their own copy. */
  async deleteContact(tx: Tx, partnerOrgId: string, contactId: string): Promise<boolean> {
    const rows = await tx
      .delete(partnerContacts)
      .where(and(eq(partnerContacts.id, contactId), eq(partnerContacts.partnerOrgId, partnerOrgId)))
      .returning({ id: partnerContacts.id });
    return rows.length > 0;
  }
}
