import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, getTestDb, sqlState } from '../helpers.js';
import { Fixtures } from './fixtures.js';

const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';

describe('identity rules (staff role)', () => {
  let fixtures: Fixtures;
  let staff: Client;
  let orgId: string;
  let staffUserId: string;

  const insertUser = (
    email: string,
    kind: string,
    role: string,
    partnerOrgId: string | null,
    status = 'invited',
    passwordHash: string | null = null,
  ) =>
    staff.query(
      `INSERT INTO users (email, full_name, kind, role, partner_org_id, status, password_hash)
       VALUES ($1, 'Test User', $2, $3, $4, $5, $6)`,
      [email, kind, role, partnerOrgId, status, passwordHash],
    );

  beforeAll(async () => {
    fixtures = await Fixtures.open();
    staff = await connect(getTestDb().staffUrl);
    orgId = await fixtures.partnerOrg();
    staffUserId = await fixtures.staffUser();
  });

  afterAll(async () => {
    await staff.end();
    await fixtures.close();
  });

  const email = async () => `user-${await fixtures.next()}@example.test`;

  it('rejects a staff role attached to a company with 23514', async () => {
    expect(await sqlState(async () => insertUser(await email(), 'staff', 'admin', orgId))).toBe(
      CHECK_VIOLATION,
    );
  });

  it('rejects a staff kind carrying a partner role with 23514', async () => {
    expect(
      await sqlState(async () => insertUser(await email(), 'staff', 'partner_admin', null)),
    ).toBe(CHECK_VIOLATION);
  });

  it('rejects a partner role without a company with 23514', async () => {
    expect(
      await sqlState(async () => insertUser(await email(), 'partner', 'partner_member', null)),
    ).toBe(CHECK_VIOLATION);
  });

  it('rejects a partner kind carrying a staff role with 23514', async () => {
    expect(await sqlState(async () => insertUser(await email(), 'partner', 'admin', orgId))).toBe(
      CHECK_VIOLATION,
    );
  });

  it('accepts a partner with a company and a staff member without one', async () => {
    expect(
      await sqlState(async () => insertUser(await email(), 'partner', 'partner_admin', orgId)),
    ).toBeNull();
    expect(
      await sqlState(async () => insertUser(await email(), 'staff', 'manager', null)),
    ).toBeNull();
  });

  it('rejects an active user without a password hash with 23514', async () => {
    expect(
      await sqlState(async () => insertUser(await email(), 'staff', 'admin', null, 'active')),
    ).toBe(CHECK_VIOLATION);
  });

  it('accepts an active user once a password hash exists', async () => {
    expect(
      await sqlState(async () =>
        insertUser(await email(), 'staff', 'admin', null, 'active', 'argon2-placeholder'),
      ),
    ).toBeNull();
  });

  it('rejects emails that differ only by case with 23505', async () => {
    const address = await email();
    await insertUser(address, 'staff', 'auditor', null);

    expect(await sqlState(() => insertUser(address.toUpperCase(), 'staff', 'auditor', null))).toBe(
      UNIQUE_VIOLATION,
    );
  });

  it('rejects a request decided by its own filer with 23514', async () => {
    const filerId = await fixtures.partnerUser(orgId);
    const requestId = await fixtures.loanRequest(orgId, filerId);

    const selfApproval = await sqlState(() =>
      staff.query(
        "UPDATE loan_requests SET status = 'approved', decided_by_user_id = $2 WHERE id = $1",
        [requestId, filerId],
      ),
    );
    const staffApproval = await sqlState(() =>
      staff.query(
        "UPDATE loan_requests SET status = 'approved', decided_by_user_id = $2 WHERE id = $1",
        [requestId, staffUserId],
      ),
    );

    expect(selfApproval).toBe(CHECK_VIOLATION);
    expect(staffApproval).toBeNull();
  });

  it('rejects a request that ends before it starts with 23514', async () => {
    const filerId = await fixtures.partnerUser(orgId);
    const requestId = await fixtures.loanRequest(orgId, filerId);

    expect(
      await sqlState(() =>
        staff.query("UPDATE loan_requests SET needed_until = '2030-02-01' WHERE id = $1", [
          requestId,
        ]),
      ),
    ).toBe(CHECK_VIOLATION);
  });
});
