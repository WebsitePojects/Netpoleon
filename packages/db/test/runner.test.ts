import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { MigrationChecksumError, MigrationRunner } from '../src/migrate/runner.js';
import { createScratchDatabase, withClient } from './helpers.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

describe('migration runner', () => {
  const tempDirs: string[] = [];

  afterAll(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  });

  const copyOfMigrations = async (): Promise<string> => {
    const dir = await mkdtemp(join(tmpdir(), 'wms-migrations-'));
    tempDirs.push(dir);
    await cp(MIGRATIONS_DIR, dir, { recursive: true });
    return dir;
  };

  const migrationNames = async (): Promise<string[]> =>
    (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith('.sql')).sort();

  it('applies every file in name order, then skips them all on the second run', async () => {
    const { migratorUrl } = await createScratchDatabase();
    const runner = new MigrationRunner({ connectionString: migratorUrl, dir: MIGRATIONS_DIR });
    const expected = await migrationNames();

    const first = await runner.run();
    const second = await runner.run();

    expect(expected).toHaveLength(11);
    expect(first).toEqual({ applied: expected, skipped: [] });
    expect(second.applied).toHaveLength(0);
    expect(second.skipped).toEqual(expected);
  });

  it('stops with MigrationChecksumError when an applied file’s bytes change', async () => {
    const { migratorUrl } = await createScratchDatabase();
    await new MigrationRunner({ connectionString: migratorUrl, dir: MIGRATIONS_DIR }).run();
    const tamperedDir = await copyOfMigrations();
    const target = '0003_catalogue_and_stock.sql';
    const original = await readFile(join(tamperedDir, target), 'utf8');
    await writeFile(join(tamperedDir, target), `${original}\n-- edited after it was applied\n`);

    const rerun = new MigrationRunner({ connectionString: migratorUrl, dir: tamperedDir }).run();

    await expect(rerun).rejects.toBeInstanceOf(MigrationChecksumError);
    await expect(rerun).rejects.toMatchObject({ file: target });
  });

  it('accepts a file whose only change is CRLF line endings', async () => {
    const { migratorUrl } = await createScratchDatabase();
    await new MigrationRunner({ connectionString: migratorUrl, dir: MIGRATIONS_DIR }).run();
    const crlfDir = await copyOfMigrations();
    const target = '0003_catalogue_and_stock.sql';
    const original = await readFile(join(crlfDir, target), 'utf8');
    await writeFile(join(crlfDir, target), original.replace(/\r?\n/g, '\r\n'));

    const result = await new MigrationRunner({ connectionString: migratorUrl, dir: crlfDir }).run();

    expect(result.applied).toHaveLength(0);
    expect(result.skipped).toContain(target);
  });

  it('rolls back a failing file completely and records nothing for it', async () => {
    const { migratorUrl } = await createScratchDatabase();
    const dir = await mkdtemp(join(tmpdir(), 'wms-failing-'));
    tempDirs.push(dir);
    await writeFile(join(dir, '0001_ok.sql'), 'CREATE TABLE kept (id int);\n');
    await writeFile(join(dir, '0002_bad.sql'), 'CREATE TABLE half_done (id int);\nSELECT 1 / 0;\n');

    await expect(new MigrationRunner({ connectionString: migratorUrl, dir }).run()).rejects.toThrow(
      /division by zero/,
    );

    const state = await withClient(migratorUrl, async (client) => {
      const { rows } = await client.query<{
        filename: string;
        kept: string | null;
        half: string | null;
      }>(
        `SELECT filename, to_regclass('kept')::text AS kept, to_regclass('half_done')::text AS half
           FROM schema_migrations`,
      );
      return rows;
    });
    expect(state).toEqual([{ filename: '0001_ok.sql', kept: 'kept', half: null }]);
  });

  it('lets two runners start together without applying anything twice', async () => {
    const { migratorUrl } = await createScratchDatabase();
    const expected = await migrationNames();
    const runner = () =>
      new MigrationRunner({ connectionString: migratorUrl, dir: MIGRATIONS_DIR });

    const [a, b] = await Promise.all([runner().run(), runner().run()]);

    expect([...a.applied, ...b.applied].sort()).toEqual(expected);
  });
});
