import { parseArgs } from 'node:util';
import { createUserBody } from '@wms/contracts';
import { ConfigError, loadConfig } from '@wms/config';
import { Database } from '@wms/db';
import { sql } from 'drizzle-orm';
import { maybeOne, one } from '../platform/sql.js';
import { issueToken } from '../platform/tokens.js';

/**
 * Creates the first administrator on a new server (spec section 15): no default credential
 * exists anywhere, so this is the only way in. It refuses when an active or invited admin
 * already exists, and prints a one-time invitation link exactly once. Run it with
 * `docker compose run --rm`, so the printed link does not linger in a container's log.
 *
 *   node apps/api/dist/cli/admin-create.js --username lara --email lara@example.com --name "Lara Cruz"
 */
async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      username: { type: 'string' },
      email: { type: 'string' },
      name: { type: 'string' },
      title: { type: 'string' },
    },
  });
  const body = createUserBody.safeParse({
    username: values.username,
    email: values.email,
    name: values.name,
    title: values.title ?? 'System Administrator',
    role: 'admin',
  });
  if (!body.success) {
    process.stderr.write(
      `Usage: admin-create --username <name> --email <address> --name "<full name>"\n`,
    );
    process.stderr.write(
      `Invalid: ${body.error.issues.map((issue) => issue.path.join('.')).join(', ')}\n`,
    );
    return 2;
  }

  let config;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`Invalid configuration. Fix: ${error.invalidKeys.join(', ')}\n`);
      return 1;
    }
    throw error;
  }

  const db = new Database(config.db, () => undefined);
  try {
    const link = await db.transaction({ kind: 'system' }, async (tx) => {
      // Serialises two runs started at once, so the "no admin yet" check cannot pass twice.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('wms.admin-create', 0))`);
      const existing = await maybeOne<{ id: string }>(
        tx,
        sql`SELECT id FROM users WHERE role = 'admin' AND status IN ('active', 'invited') LIMIT 1`,
      );
      if (existing) return null;
      const user = await one<{ id: string }>(
        tx,
        sql`INSERT INTO users (username, email, full_name, title, kind, role, status)
            VALUES (${body.data.username}, ${body.data.email}, ${body.data.name}, ${body.data.title},
                    'staff', 'admin', 'invited')
            RETURNING id`,
      );
      const issued = await issueToken(tx, user.id, 'invite');
      await tx.execute(sql`
        INSERT INTO audit_log (actor_user_id, action, target_type, target_id, changed_fields)
        VALUES (NULL, 'user.create_first_admin', 'user', ${user.id},
                ${JSON.stringify({ label: body.data.username, role: 'admin' })}::jsonb)`);
      return {
        url: `${config.appOrigin}/accept-invite/${issued.token}`,
        expiresAt: issued.expiresAt,
      };
    });
    if (!link) {
      process.stderr.write(
        'An administrator already exists. Use the console to invite more people.\n',
      );
      return 3;
    }
    process.stdout.write(
      `Administrator ${body.data.username} created.\nOpen this link once to set the password (expires ${link.expiresAt.toISOString()}):\n${link.url}\n`,
    );
    return 0;
  } finally {
    await db.close();
  }
}

process.exitCode = await main();
