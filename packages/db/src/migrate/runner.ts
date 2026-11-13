import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from 'pg';

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

/** Names the offending file so the operator knows which migration was edited. */
export class MigrationChecksumError extends Error {
  readonly file: string;

  constructor(file: string) {
    super(`Migration ${file} was edited after it was applied. Write a new migration instead.`);
    this.name = 'MigrationChecksumError';
    this.file = file;
  }
}

interface MigrationFile {
  name: string;
  sql: string;
  checksum: string;
}

// One fixed key for every runner, so two deploys starting together queue up instead of
// interleaving. hashtextextended turns the readable name into the bigint the lock needs.
const LOCK_NAME = 'wms.migrations';

/**
 * Applies the SQL files of one directory, in name order, each in its own transaction. A file
 * that was applied earlier is skipped, but only if its bytes are unchanged: editing history
 * would leave a database that no fresh install can reproduce.
 */
export class MigrationRunner {
  private readonly connectionString: string;
  private readonly dir: string;

  constructor(opts: { connectionString: string; dir: string }) {
    this.connectionString = opts.connectionString;
    this.dir = opts.dir;
  }

  async run(): Promise<MigrationResult> {
    const files = await this.readFiles();
    const client = new Client({ connectionString: this.connectionString });
    await client.connect();
    try {
      await this.ensureLedger(client);
      const result: MigrationResult = { applied: [], skipped: [] };
      for (const file of files) {
        const wasApplied = await this.applyIfNew(client, file);
        (wasApplied ? result.applied : result.skipped).push(file.name);
      }
      return result;
    } finally {
      await client.end();
    }
  }

  private async readFiles(): Promise<MigrationFile[]> {
    const names = (await readdir(this.dir)).filter((name) => name.endsWith('.sql')).sort();
    return Promise.all(
      names.map(async (name) => {
        const sql = await readFile(join(this.dir, name), 'utf8');
        return { name, sql, checksum: checksumOf(sql) };
      }),
    );
  }

  private async ensureLedger(client: Client): Promise<void> {
    await this.inTransaction(client, async () => {
      await client.query(
        `CREATE TABLE IF NOT EXISTS schema_migrations (
           filename text PRIMARY KEY,
           checksum text NOT NULL,
           applied_at timestamptz NOT NULL DEFAULT now()
         )`,
      );
    });
  }

  /** Returns true when the file was applied now, false when it had been applied before. */
  private async applyIfNew(client: Client, file: MigrationFile): Promise<boolean> {
    return this.inTransaction(client, async () => {
      // Checked under the lock: a deploy that finished this file while we waited is seen here.
      const { rows } = await client.query<{ checksum: string }>(
        'SELECT checksum FROM schema_migrations WHERE filename = $1',
        [file.name],
      );
      const recorded = rows[0];
      if (recorded) {
        if (recorded.checksum !== file.checksum) {
          throw new MigrationChecksumError(file.name);
        }
        return false;
      }
      await client.query(file.sql);
      await client.query('INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)', [
        file.name,
        file.checksum,
      ]);
      return true;
    });
  }

  private async inTransaction<T>(client: Client, work: () => Promise<T>): Promise<T> {
    await client.query('BEGIN');
    try {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [LOCK_NAME]);
      const value = await work();
      await client.query('COMMIT');
      return value;
    } catch (error) {
      // If the connection died the rollback fails too; the original error is the one to report.
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    }
  }
}

/**
 * SHA-256 of the file text with line endings normalised to LF, so a Windows checkout that
 * turned LF into CRLF does not look like an edited migration.
 */
function checksumOf(sql: string): string {
  return createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
}
