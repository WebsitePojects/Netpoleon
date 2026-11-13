import { fileURLToPath } from 'node:url';
import { RoleBootstrapper } from './bootstrap-roles.js';
import { MigrationRunner } from './runner.js';

// Resolves to packages/db/migrations from both src/migrate (tsx) and dist/migrate (built image).
const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations', import.meta.url));

/** Names only: a value here could be a password or a connection string. */
class MissingEnvError extends Error {
  constructor(names: readonly string[]) {
    super(`Missing environment variables: ${names.join(', ')}`);
    this.name = 'MissingEnvError';
  }
}

function requireEnv(...names: string[]): Record<string, string> {
  const values: Record<string, string> = {};
  const missing: string[] = [];
  for (const name of names) {
    const value = process.env[name];
    if (value) {
      values[name] = value;
    } else {
      missing.push(name);
    }
  }
  if (missing.length > 0) {
    throw new MissingEnvError(missing);
  }
  return values;
}

async function bootstrap(): Promise<void> {
  const env = requireEnv(
    'DATABASE_URL_SUPERUSER',
    'WMS_MIGRATOR_PASSWORD',
    'WMS_STAFF_PASSWORD',
    'WMS_PARTNER_PASSWORD',
  );
  const superuserUrl = env['DATABASE_URL_SUPERUSER'] ?? '';
  // The database to fence is the one the superuser URL points at.
  const database = decodeURIComponent(new URL(superuserUrl).pathname.replace(/^\//, ''));
  if (!database) {
    throw new Error('DATABASE_URL_SUPERUSER must name a database.');
  }
  await new RoleBootstrapper({
    superuserUrl,
    database,
    passwords: {
      migrator: env['WMS_MIGRATOR_PASSWORD'] ?? '',
      staff: env['WMS_STAFF_PASSWORD'] ?? '',
      partner: env['WMS_PARTNER_PASSWORD'] ?? '',
    },
  }).run();
  console.log(`Roles ready for database ${database}: wms_migrator, wms_staff, wms_partner.`);
}

async function migrate(): Promise<void> {
  const env = requireEnv('DATABASE_URL_MIGRATOR');
  const result = await new MigrationRunner({
    connectionString: env['DATABASE_URL_MIGRATOR'] ?? '',
    dir: MIGRATIONS_DIR,
  }).run();
  for (const file of result.applied) {
    console.log(`applied  ${file}`);
  }
  console.log(`${result.applied.length} applied, ${result.skipped.length} already applied.`);
}

const COMMANDS: Record<string, () => Promise<void>> = { bootstrap, migrate };

async function main(): Promise<void> {
  const command = COMMANDS[process.argv[2] ?? ''];
  if (!command) {
    throw new Error(`Usage: cli.js <${Object.keys(COMMANDS).join('|')}>`);
  }
  await command();
}

main().catch((error: unknown) => {
  // Only the error's name and message are shown: a driver error object can carry connection
  // details, and a checksum error already names just the offending file.
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : 'Unexpected failure.');
  process.exitCode = 1;
});
