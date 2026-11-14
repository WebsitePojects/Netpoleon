/**
 * Development seed (plan D12, R17, R20): loads the demo dataset into an empty, migrated
 * database. Refuses unless NODE_ENV is 'development' or 'test'.
 *
 *   NODE_ENV=development DATABASE_URL_MIGRATOR=... node apps/api/dist/cli/seed/main.js
 *
 * Connects as the migrator, which owns the tables; the asset status rules still hold because
 * they are triggers, and every status is reached through asset_movements rows.
 */
import { Client } from 'pg';
import { hashPassword } from '../../platform/password.js';
import { assertSeedAllowed, requireEnv } from './environment.js';
import { DevSeeder, summarise } from './seeder.js';

async function main(): Promise<void> {
  assertSeedAllowed(process.env['NODE_ENV']);
  const client = new Client({
    connectionString: requireEnv('DATABASE_URL_MIGRATOR'),
    application_name: 'wms-dev-seed',
  });
  await client.connect();
  try {
    const outcome = await new DevSeeder(client, hashPassword).run(new Date());
    console.log(
      outcome.kind === 'seeded'
        ? 'Development seed loaded.'
        : 'Development seed already present; nothing changed.',
    );
    console.log(JSON.stringify(await summarise(client), null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  // Only the name and message: a driver error object can carry connection details.
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : 'Unexpected failure.');
  process.exitCode = 1;
});
