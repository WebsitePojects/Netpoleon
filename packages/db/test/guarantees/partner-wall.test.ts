import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, getTestDb, inRolledBackTransaction, sqlState } from '../helpers.js';
import { Fixtures } from './fixtures.js';

const INSUFFICIENT_PRIVILEGE = '42501';
const INVALID_TEXT_REPRESENTATION = '22P02';
const FOREIGN_KEY_VIOLATION = '23503';

const INSERT_REQUEST = `
  INSERT INTO loan_requests
    (request_no, partner_org_id, filed_by_user_id, contact_name, contact_email, contact_phone,
     needed_from, needed_until, purpose)
  VALUES ($1, $2, $3, 'Contact', 'contact@example.test', '0000', '2030-03-01', '2030-03-05', 'demo')`;

describe('a partner sees only its own company', () => {
  let fixtures: Fixtures;
  let orgA: string;
  let orgB: string;
  let userA: string;
  let userB: string;
  let requestA: string;
  let requestB: string;
  let modelId: string;

  const scopeOf = (partnerOrgId: string, userId: string) => ({
    'app.partner_org_id': partnerOrgId,
    'app.user_id': userId,
  });

  beforeAll(async () => {
    fixtures = await Fixtures.open();
    orgA = await fixtures.partnerOrg();
    orgB = await fixtures.partnerOrg();
    userA = await fixtures.partnerUser(orgA);
    userB = await fixtures.partnerUser(orgB);
    requestA = await fixtures.loanRequest(orgA, userA);
    requestB = await fixtures.loanRequest(orgB, userB);
    modelId = await fixtures.productModel();
  });

  afterAll(async () => {
    await fixtures.close();
  });

  it('(a) scope A selects loan_requests and sees exactly A’s row', async () => {
    const { rows } = await inRolledBackTransaction(
      getTestDb().partnerUrl,
      scopeOf(orgA, userA),
      (client) => client.query<{ id: string }>('SELECT id FROM loan_requests'),
    );

    expect(rows.map((row) => row.id)).toEqual([requestA]);
  });

  it('(b) no scope set returns zero rows and no error', async () => {
    const { rows } = await inRolledBackTransaction(getTestDb().partnerUrl, {}, (client) =>
      client.query('SELECT id FROM loan_requests'),
    );

    expect(rows).toHaveLength(0);
  });

  it('(b2) a connection that carried a scope earlier does not keep it', async () => {
    const client = await connect(getTestDb().partnerUrl);
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true)', ['app.partner_org_id', orgA]);
      const scoped = await client.query('SELECT id FROM loan_requests');
      await client.query('COMMIT');
      // The setting now reads as an empty string on this same connection, not as unset.
      const afterwards = await client.query('SELECT id FROM loan_requests');

      expect(scoped.rows).toHaveLength(1);
      expect(afterwards.rows).toHaveLength(0);
    } finally {
      await client.end();
    }
  });

  it('(c) scope A cannot insert a request for company B (42501)', async () => {
    const state = await inRolledBackTransaction(
      getTestDb().partnerUrl,
      scopeOf(orgA, userA),
      (client) => sqlState(() => client.query(INSERT_REQUEST, ['REQ-X-1', orgB, userB])),
    );

    expect(state).toBe(INSUFFICIENT_PRIVILEGE);
  });

  it('(c2) scope A can file a submitted request for its own company', async () => {
    const n = await fixtures.next();

    const state = await inRolledBackTransaction(
      getTestDb().partnerUrl,
      scopeOf(orgA, userA),
      (client) => sqlState(() => client.query(INSERT_REQUEST, [`REQ-X-${n}`, orgA, userA])),
    );

    expect(state).toBeNull();
  });

  it('(c3) scope A cannot file a request that is already approved (42501)', async () => {
    const n = await fixtures.next();

    const state = await inRolledBackTransaction(
      getTestDb().partnerUrl,
      scopeOf(orgA, userA),
      (client) =>
        sqlState(() =>
          client.query(
            `INSERT INTO loan_requests
               (request_no, partner_org_id, filed_by_user_id, contact_name, contact_email,
                contact_phone, needed_from, needed_until, purpose, status)
             VALUES ($1, $2, $3, 'Contact', 'contact@example.test', '0000',
                     '2030-03-01', '2030-03-05', 'demo', 'approved')`,
            [`REQ-X-${n}`, orgA, userA],
          ),
        ),
    );

    expect(state).toBe(INSUFFICIENT_PRIVILEGE);
  });

  it('(d) scope A updating company B’s request affects zero rows', async () => {
    const result = await inRolledBackTransaction(
      getTestDb().partnerUrl,
      scopeOf(orgA, userA),
      (client) =>
        client.query("UPDATE loan_requests SET status = 'cancelled' WHERE id = $1", [requestB]),
    );

    expect(result.rowCount).toBe(0);
  });

  it('(e) a partner can cancel its own request but not approve it', async () => {
    const approve = await inRolledBackTransaction(
      getTestDb().partnerUrl,
      scopeOf(orgA, userA),
      (client) =>
        sqlState(() =>
          client.query("UPDATE loan_requests SET status = 'approved' WHERE id = $1", [requestA]),
        ),
    );
    const cancel = await inRolledBackTransaction(
      getTestDb().partnerUrl,
      scopeOf(orgA, userA),
      (client) =>
        client.query("UPDATE loan_requests SET status = 'cancelled' WHERE id = $1", [requestA]),
    );

    expect(approve).toBe(INSUFFICIENT_PRIVILEGE);
    expect(cancel.rowCount).toBe(1);
  });

  it.each(['audit_log', 'locations', 'assets', 'sessions', 'settings', 'reservations'])(
    '(f) a partner cannot read %s (42501)',
    async (table) => {
      const state = await inRolledBackTransaction(
        getTestDb().partnerUrl,
        scopeOf(orgA, userA),
        (client) => sqlState(() => client.query(`SELECT * FROM ${table}`)),
      );

      expect(state).toBe(INSUFFICIENT_PRIVILEGE);
    },
  );

  it('(g) a partner cannot read password_hash and sees only its own company’s users', async () => {
    const hash = await inRolledBackTransaction(
      getTestDb().partnerUrl,
      scopeOf(orgA, userA),
      (client) => sqlState(() => client.query('SELECT password_hash FROM users')),
    );
    const { rows } = await inRolledBackTransaction(
      getTestDb().partnerUrl,
      scopeOf(orgA, userA),
      (client) => client.query<{ id: string }>('SELECT id FROM users'),
    );

    expect(hash).toBe(INSUFFICIENT_PRIVILEGE);
    expect(rows.map((row) => row.id)).toEqual([userA]);
  });

  it('(h) a malformed scope raises 22P02 and leaks no rows', async () => {
    const result = await inRolledBackTransaction(
      getTestDb().partnerUrl,
      { 'app.partner_org_id': 'not-a-uuid' },
      async (client) => {
        let rows: unknown[] = [];
        const state = await sqlState(async () => {
          rows = (await client.query('SELECT id FROM loan_requests')).rows;
        });
        return { state, rows };
      },
    );

    expect(result.state).toBe(INVALID_TEXT_REPRESENTATION);
    expect(result.rows).toHaveLength(0);
  });

  it('(i) a child row naming a different company than its parent is refused (23503)', async () => {
    const staff = await connect(getTestDb().staffUrl);
    try {
      const state = await sqlState(() =>
        staff.query(
          `INSERT INTO loan_request_items
             (loan_request_id, partner_org_id, product_model_id, quantity_requested)
           VALUES ($1, $2, $3, 1)`,
          [requestA, orgB, modelId],
        ),
      );

      expect(state).toBe(FOREIGN_KEY_VIOLATION);
    } finally {
      await staff.end();
    }
  });

  it('(i2) a partner cannot pre-assign units on an item it files', async () => {
    const state = await inRolledBackTransaction(
      getTestDb().partnerUrl,
      scopeOf(orgA, userA),
      (client) =>
        sqlState(() =>
          client.query(
            `INSERT INTO loan_request_items
               (loan_request_id, partner_org_id, product_model_id, quantity_requested, quantity_assigned)
             VALUES ($1, $2, $3, 2, 1)`,
            [requestA, orgA, modelId],
          ),
        ),
    );

    expect(state).toBe(INSUFFICIENT_PRIVILEGE);
  });

  it('(j) a partner can leave an audit row and an outbox job but never read them back', async () => {
    const result = await inRolledBackTransaction(
      getTestDb().partnerUrl,
      scopeOf(orgA, userA),
      async (client) => ({
        audit: await sqlState(() =>
          client.query(
            "INSERT INTO audit_log (actor_user_id, action, target_type) VALUES ($1, 'test', 'test')",
            [userA],
          ),
        ),
        outbox: await sqlState(() =>
          client.query("INSERT INTO outbox (topic, payload) VALUES ('test', '{}')"),
        ),
      }),
    );

    expect(result).toEqual({ audit: null, outbox: null });
  });

  it('(k) a partner cannot write an audit row naming someone else as the actor', async () => {
    const state = await inRolledBackTransaction(
      getTestDb().partnerUrl,
      scopeOf(orgA, userA),
      (client) =>
        sqlState(() =>
          client.query(
            "INSERT INTO audit_log (actor_user_id, action, target_type) VALUES ($1, 'test', 'test')",
            [userB],
          ),
        ),
    );

    expect(state).toBe(INSUFFICIENT_PRIVILEGE);
  });

  it('(l) a partner cannot cancel a request that is already rejected', async () => {
    // Its own company, so the exact-row assertions above stay independent of test order.
    const orgC = await fixtures.partnerOrg();
    const userC = await fixtures.partnerUser(orgC);
    const rejected = await fixtures.loanRequest(orgC, userC);
    const staff = await connect(getTestDb().staffUrl);
    try {
      await staff.query("UPDATE loan_requests SET status = 'rejected' WHERE id = $1", [rejected]);
    } finally {
      await staff.end();
    }

    const result = await inRolledBackTransaction(
      getTestDb().partnerUrl,
      scopeOf(orgC, userC),
      (client) =>
        client.query("UPDATE loan_requests SET status = 'cancelled' WHERE id = $1", [rejected]),
    );

    expect(result.rowCount).toBe(0);
  });
});
