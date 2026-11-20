import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, getTestDb, inRolledBackTransaction, sqlState } from '../helpers.js';
import { Fixtures } from './fixtures.js';

// Migration 0012: the partner directory's contacts are staff-only and unique per company.

const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';
const INSUFFICIENT_PRIVILEGE = '42501';

describe('partner_contacts (staff role)', () => {
  let fixtures: Fixtures;
  let staff: Client;

  beforeAll(async () => {
    fixtures = await Fixtures.open();
    staff = await connect(getTestDb().staffUrl);
  });

  afterAll(async () => {
    await staff.end();
    await fixtures.close();
  });

  const insertContact = (
    orgId: string,
    email: string,
    name = 'Ana Cruz',
    phone = '+63 917 555 0101',
  ) =>
    staff.query(
      `INSERT INTO partner_contacts (partner_org_id, full_name, email, phone) VALUES ($1, $2, $3, $4)`,
      [orgId, name, email, phone],
    );

  it('lets staff add, edit and erase a contact', async () => {
    const orgId = await fixtures.partnerOrg();
    const email = `contact-${await fixtures.next()}@example.test`;

    expect(await sqlState(() => insertContact(orgId, email))).toBeNull();
    const updated = await staff.query(
      `UPDATE partner_contacts SET phone = '+63 2 8555 0101' WHERE partner_org_id = $1 AND email = $2`,
      [orgId, email],
    );
    expect(updated.rowCount).toBe(1);
    const erased = await staff.query(
      'DELETE FROM partner_contacts WHERE partner_org_id = $1 AND email = $2',
      [orgId, email],
    );
    expect(erased.rowCount).toBe(1);
  });

  it('refuses the same email twice at one company, whatever its case (23505)', async () => {
    const orgId = await fixtures.partnerOrg();
    const email = `twice-${await fixtures.next()}@example.test`;
    await insertContact(orgId, email);

    expect(await sqlState(() => insertContact(orgId, email.toUpperCase()))).toBe(UNIQUE_VIOLATION);
  });

  it('allows the same person at two companies', async () => {
    const email = `shared-${await fixtures.next()}@example.test`;
    await insertContact(await fixtures.partnerOrg(), email);
    const otherOrg = await fixtures.partnerOrg();

    expect(await sqlState(() => insertContact(otherOrg, email))).toBeNull();
  });

  it.each([
    ['an empty name', '', '+63 917 555 0101'],
    ['a phone too short', 'Ana Cruz', '12345'],
  ])('rejects %s with 23514', async (_label, name, phone) => {
    const orgId = await fixtures.partnerOrg();
    const email = `bad-${await fixtures.next()}@example.test`;

    expect(await sqlState(() => insertContact(orgId, email, name, phone))).toBe(CHECK_VIOLATION);
  });

  it('is invisible to a partner session (42501)', async () => {
    const orgId = await fixtures.partnerOrg();
    const userId = await fixtures.partnerUser(orgId);

    const state = await inRolledBackTransaction(
      getTestDb().partnerUrl,
      { 'app.partner_org_id': orgId, 'app.user_id': userId },
      (client) => sqlState(() => client.query('SELECT id FROM partner_contacts')),
    );

    expect(state).toBe(INSUFFICIENT_PRIVILEGE);
  });
});
