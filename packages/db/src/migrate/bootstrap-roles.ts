import { Client, escapeIdentifier } from 'pg';

const MIGRATOR = 'wms_migrator';
const APP_ROLES = ['wms_staff', 'wms_partner'] as const;

type RoleName = typeof MIGRATOR | (typeof APP_ROLES)[number];

// A runaway query, a lock queue or a forgotten open transaction must not be able to freeze the
// system, so the limits live on the role itself rather than in each pool's configuration.
const APP_ROLE_LIMITS = {
  statement_timeout: '5s',
  lock_timeout: '3s',
  idle_in_transaction_session_timeout: '15s',
} as const;

// Generated secrets are far longer; this only stops an empty or placeholder value from
// becoming a working login.
const MIN_PASSWORD_LENGTH = 16;

export interface RolePasswords {
  migrator: string;
  staff: string;
  partner: string;
}

/**
 * Creates or refreshes the three database roles and fences the database around them:
 * wms_migrator owns the schema, the app roles may only connect and use it. Safe to run on
 * every deploy.
 */
export class RoleBootstrapper {
  private readonly superuserUrl: string;
  private readonly passwords: RolePasswords;
  private readonly database: string;

  constructor(opts: { superuserUrl: string; passwords: RolePasswords; database: string }) {
    this.superuserUrl = opts.superuserUrl;
    this.passwords = opts.passwords;
    this.database = opts.database;
  }

  async run(): Promise<void> {
    this.assertPasswordsUsable();
    const client = new Client({ connectionString: this.superuserUrl });
    await client.connect();
    try {
      await client.query('BEGIN');
      await this.configureRole(client, MIGRATOR, this.passwords.migrator);
      await this.configureRole(client, 'wms_staff', this.passwords.staff);
      await this.configureRole(client, 'wms_partner', this.passwords.partner);
      await this.applyAppRoleLimits(client);
      await this.fenceDatabase(client);
      await client.query('COMMIT');
    } catch (error) {
      // If the connection died the rollback fails too; the original error is the one to report.
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      await client.end();
    }
  }

  private assertPasswordsUsable(): void {
    const named: Array<[keyof RolePasswords, string]> = [
      ['migrator', this.passwords.migrator],
      ['staff', this.passwords.staff],
      ['partner', this.passwords.partner],
    ];
    for (const [role, password] of named) {
      if (password.length < MIN_PASSWORD_LENGTH) {
        // Names the role, never the value.
        throw new Error(
          `Password for the ${role} role must be at least ${MIN_PASSWORD_LENGTH} characters.`,
        );
      }
    }
  }

  private async configureRole(client: Client, role: RoleName, password: string): Promise<void> {
    await client.query(
      `DO $$
       BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN
           CREATE ROLE ${role} LOGIN;
         END IF;
       END
       $$`,
    );
    // ALTER ROLE cannot take a bound parameter, so the server builds the statement: %L quotes the
    // password as a literal and TypeScript never concatenates it into SQL. Attributes are
    // restated on every run so a role loosened by hand is tightened again.
    const { rows } = await client.query<{ statement: string }>(
      `SELECT format(
         'ALTER ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
         $1::text,
         $2::text
       ) AS statement`,
      [role, password],
    );
    const statement = rows[0]?.statement;
    if (!statement) {
      throw new Error(`Could not build the ALTER ROLE statement for ${role}.`);
    }
    await client.query(statement);
  }

  private async applyAppRoleLimits(client: Client): Promise<void> {
    for (const role of APP_ROLES) {
      for (const [setting, value] of Object.entries(APP_ROLE_LIMITS)) {
        await client.query(`ALTER ROLE ${role} SET ${setting} = '${value}'`);
      }
    }
  }

  private async fenceDatabase(client: Client): Promise<void> {
    const database = escapeIdentifier(this.database);
    // PUBLIC would otherwise let any role connect, create temporary tables and use the schema.
    await client.query(`REVOKE ALL ON DATABASE ${database} FROM PUBLIC`);
    await client.query(
      `GRANT CONNECT ON DATABASE ${database} TO ${MIGRATOR}, ${APP_ROLES.join(', ')}`,
    );
    // CREATE lets the migrator install the trusted extensions (btree_gist, citext) itself.
    await client.query(`GRANT CREATE ON DATABASE ${database} TO ${MIGRATOR}`);

    await client.query(`ALTER SCHEMA public OWNER TO ${MIGRATOR}`);
    await client.query('REVOKE ALL ON SCHEMA public FROM PUBLIC');
    await client.query(`GRANT USAGE ON SCHEMA public TO ${APP_ROLES.join(', ')}`);
  }
}
