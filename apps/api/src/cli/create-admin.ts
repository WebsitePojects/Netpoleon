import { parseArgs } from 'node:util';
import { ConfigError, loadConfig } from '@wms/config';
import { Database, schema } from '@wms/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { createLogger } from '../logging.js';
import { AuthTokens } from '../modules/auth/auth-tokens.js';
import { AuthRepository } from '../modules/auth/auth.repository.js';
import { AuditWriter, SYSTEM_CONTEXT } from '../platform/audit.js';
import { Outbox } from '../platform/outbox.js';

const argsSchema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
  name: z.string().trim().min(2).max(120),
});

/**
 * Creates the first administrator as an invited account and prints the invitation link once
 * (foundation spec section 15: no default credentials exist anywhere). Refuses to run when an
 * administrator already exists, so it cannot be used to add a second admin behind the
 * application's back.
 *
 *   node apps/api/dist/cli/create-admin.js --email ops@example.com --name "Ops Lead"
 */
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { email: { type: 'string' }, name: { type: 'string' } },
  });
  const args = argsSchema.safeParse(values);
  if (!args.success) {
    process.stderr.write('Usage: create-admin --email <address> --name "<full name>"\n');
    process.exit(2);
  }

  let config;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`Invalid configuration. Fix: ${error.invalidKeys.join(', ')}\n`);
      process.exit(1);
    }
    throw error;
  }
  const logger = createLogger('warn');
  const db = new Database(config.db, (err) => logger.error({ err }, 'database pool error'));
  const tokens = new AuthTokens(
    new AuthRepository(),
    new Outbox(),
    new AuditWriter(),
    config.appOrigin,
  );

  try {
    const link = await db.transaction({ kind: 'system' }, async (tx) => {
      // Serialises two runs at once, so they cannot both see "no admin yet".
      await tx.execute(`SELECT pg_advisory_xact_lock(hashtextextended('wms.create-admin', 0))`);
      const existing = await tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.role, 'admin'))
        .limit(1);
      if (existing.length > 0) return null;
      const [admin] = await tx
        .insert(schema.users)
        .values({
          email: args.data.email,
          fullName: args.data.name,
          kind: 'staff',
          role: 'admin',
          status: 'invited',
        })
        .returning({
          id: schema.users.id,
          email: schema.users.email,
          fullName: schema.users.fullName,
        });
      if (!admin) throw new Error('Admin insert returned no row.');
      return tokens.issue(tx, SYSTEM_CONTEXT, admin, 'invite');
    });
    if (!link) {
      process.stderr.write('An administrator already exists. Invite more people from the app.\n');
      process.exitCode = 1;
      return;
    }
    process.stdout.write(
      `Administrator invited. Open this link within 72 hours to set the password:\n${link}\n`,
    );
  } finally {
    await db.close();
  }
}

await main();
