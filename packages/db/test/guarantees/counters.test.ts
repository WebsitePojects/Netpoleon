import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import { connect, getTestDb, inRolledBackTransaction, sqlState } from '../helpers.js';

const INSUFFICIENT_PRIVILEGE = '42501';

// A fresh prefix per test: the counter is shared state in a database every test file uses.
const freshPrefix = () => `BRR-${randomUUID()}`;

describe('running numbers', () => {
  it('hands 50 concurrent callers exactly the numbers 1..50', async () => {
    const prefix = freshPrefix();
    const clients = await Promise.all(
      Array.from({ length: 50 }, () => connect(getTestDb().staffUrl)),
    );
    try {
      const results = await Promise.all(
        clients.map((client) =>
          client.query<{ n: string }>('SELECT next_counter($1) AS n', [prefix]),
        ),
      );

      const numbers = results.map((result) => Number(result.rows[0]?.n)).sort((a, b) => a - b);
      expect(numbers).toEqual(Array.from({ length: 50 }, (_, index) => index + 1));
    } finally {
      await Promise.all(clients.map((client) => client.end()));
    }
  });

  it('returns a number to the pool when its transaction rolls back', async () => {
    const prefix = freshPrefix();
    const take = (client: Client) =>
      client.query<{ n: string }>('SELECT next_counter($1) AS n', [prefix]);

    const rolledBack = await inRolledBackTransaction(getTestDb().staffUrl, {}, async (client) =>
      Number((await take(client)).rows[0]?.n),
    );
    const next = await inRolledBackTransaction(getTestDb().staffUrl, {}, async (client) =>
      Number((await take(client)).rows[0]?.n),
    );

    expect([rolledBack, next]).toEqual([1, 1]);
  });

  it('is callable by the partner role too', async () => {
    const { rows } = await inRolledBackTransaction(getTestDb().partnerUrl, {}, (client) =>
      client.query<{ n: string }>('SELECT next_counter($1) AS n', [freshPrefix()]),
    );

    expect(Number(rows[0]?.n)).toBe(1);
  });

  it.each([
    ['SELECT', 'SELECT * FROM counters'],
    ['INSERT', "INSERT INTO counters (prefix, value) VALUES ('x', 99)"],
    ['UPDATE', 'UPDATE counters SET value = 0'],
  ])('refuses a direct %s on the table for staff with 42501', async (_operation, statement) => {
    const state = await inRolledBackTransaction(getTestDb().staffUrl, {}, (client) =>
      sqlState(() => client.query(statement)),
    );

    expect(state).toBe(INSUFFICIENT_PRIVILEGE);
  });

  it('refuses a direct SELECT on the table for partners with 42501', async () => {
    const state = await inRolledBackTransaction(getTestDb().partnerUrl, {}, (client) =>
      sqlState(() => client.query('SELECT * FROM counters')),
    );

    expect(state).toBe(INSUFFICIENT_PRIVILEGE);
  });
});
