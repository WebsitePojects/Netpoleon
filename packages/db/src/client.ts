import type { DbConfig } from '@wms/config';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, type PoolClient } from 'pg';
import { assertValidScope, scopeSettings, type ActorScope } from './scope.js';
import * as schema from './schema/index.js';

export type Tx = NodePgDatabase<typeof schema>;

export const EXPECTED_MIGRATION_COUNT = 11;

// Bounds how long a request can wait for a connection when the database is down.
const CONNECT_TIMEOUT_MS = 5_000;

export interface DatabaseOptions {
  /**
   * Called with the text of every statement run inside `transaction()`, before it is sent.
   * Tests use it to count queries per request, which is how an N+1 is caught.
   */
  onQuery?: (text: string) => void;
}

/** The same client, with `query` reporting each statement to `onQuery` first. */
function observed(client: PoolClient, onQuery: (text: string) => void): PoolClient {
  return new Proxy(client, {
    get(target, property) {
      if (property === 'query') {
        return (...args: unknown[]) => {
          const first = args[0];
          onQuery(
            typeof first === 'string'
              ? first
              : typeof first === 'object' && first !== null && 'text' in first
                ? String(first.text)
                : '',
          );
          return (target.query as (...rest: unknown[]) => unknown)(...args);
        };
      }
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === 'function'
        ? (value as (...rest: unknown[]) => unknown).bind(target)
        : value;
    },
  });
}

/**
 * The only way to reach the database. Every call runs inside one transaction whose
 * settings (`set_config(..., is_local = true)`) vanish at COMMIT or ROLLBACK, so a pooled
 * connection can never carry one request's scope into the next.
 */
export class Database {
  private readonly staffPool: Pool;
  private readonly partnerPool: Pool;
  private readonly onQuery: ((text: string) => void) | undefined;

  constructor(config: DbConfig, onPoolError: (err: Error) => void, options: DatabaseOptions = {}) {
    this.onQuery = options.onQuery;
    const pool = (url: string, applicationName: string, max: number): Pool =>
      this.createPool(url, applicationName, max, config.statementTimeoutMs, onPoolError);
    this.staffPool = pool(config.staffUrl, 'wms-staff', config.staffPoolMax);
    this.partnerPool = pool(config.partnerUrl, 'wms-partner', config.partnerPoolMax);
  }

  async transaction<T>(scope: ActorScope, fn: (tx: Tx) => Promise<T>): Promise<T> {
    assertValidScope(scope);
    const pool = scope.kind === 'partner' ? this.partnerPool : this.staffPool;
    const client = await pool.connect();
    let discardConnection = false;
    try {
      await client.query('BEGIN');
      await this.applyScope(client, scope);
      const runner = this.onQuery ? observed(client, this.onQuery) : client;
      const result = await fn(drizzle(runner, { schema }));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // A connection that cannot roll back may still hold the transaction and its
        // settings, so it is destroyed instead of being handed to the next request.
        discardConnection = true;
      }
      throw error;
    } finally {
      client.release(discardConnection);
    }
  }

  /** Resolves false, never throws, and answers within roughly `timeoutMs`. */
  async ping(timeoutMs: number): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    const timedOut = new Promise<false>((resolve) => {
      timer = setTimeout(resolve, timeoutMs, false);
    });
    const reachable = Promise.all([
      this.staffPool.query('SELECT 1'),
      this.partnerPool.query('SELECT 1'),
    ]).then(() => true);
    try {
      return await Promise.race([reachable, timedOut]);
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Exact match, not "at least": a schema ahead of the code is as unsafe as one behind it. */
  async migrationsCurrent(expectedCount: number): Promise<boolean> {
    try {
      const { rows } = await this.staffPool.query<{ applied: number }>(
        'SELECT count(*)::int AS applied FROM schema_migrations',
      );
      return rows[0]?.applied === expectedCount;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await Promise.all([this.staffPool.end(), this.partnerPool.end()]);
  }

  private createPool(
    connectionString: string,
    applicationName: string,
    max: number,
    statementTimeoutMs: number,
    onPoolError: (err: Error) => void,
  ): Pool {
    const pool = new Pool({
      connectionString,
      application_name: applicationName,
      max,
      statement_timeout: statementTimeoutMs,
      connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    });
    // An idle connection dropped by the server emits 'error'; unhandled, it would crash the process.
    pool.on('error', onPoolError);
    return pool;
  }

  private async applyScope(client: PoolClient, scope: ActorScope): Promise<void> {
    const settings = scopeSettings(scope);
    if (settings.length === 0) {
      return;
    }
    const calls = settings.map((_, i) => `set_config($${2 * i + 1}, $${2 * i + 2}, true)`);
    await client.query(`SELECT ${calls.join(', ')}`, settings.flat());
  }
}
