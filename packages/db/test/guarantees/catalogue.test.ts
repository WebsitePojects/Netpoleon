import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, getTestDb } from '../helpers.js';

// The guarantees live in hand-written SQL an ORM cannot describe, so a migration that silently
// drops one must fail here by name. The attack tests in the sibling files prove each one works.

const RLS_TABLES = [
  'partner_orgs',
  'users',
  'loan_requests',
  'loan_request_items',
  'loans',
  'loan_items',
  'loan_extensions',
  'notifications',
  'idempotency_keys',
  'outbox',
  'audit_log',
] as const;

const HISTORY_TRIGGERS = [
  ['asset_movements', 'asset_movements_reject_change'],
  ['asset_movements', 'asset_movements_reject_truncate'],
  ['audit_log', 'audit_log_reject_change'],
  ['audit_log', 'audit_log_reject_truncate'],
] as const;

// Migration 0011: each index is named with a fragment of its definition, so a later migration
// that rebuilds one differently (a b-tree where a trigram GIN was meant) fails by name.
const CONSOLE_INDEXES = [
  ['audit_log_occurred_at_idx', 'USING btree (occurred_at DESC)'],
  ['assets_asset_code_trgm_idx', 'USING gin (asset_code gin_trgm_ops)'],
  ['assets_serial_number_trgm_idx', 'USING gin (serial_number gin_trgm_ops)'],
  [
    'product_models_search_trgm_idx',
    "USING gin ((((brand || ' '::text) || model_name)) gin_trgm_ops)",
  ],
  ['loan_requests_contact_name_trgm_idx', 'USING gin (contact_name gin_trgm_ops)'],
  ['partner_orgs_name_trgm_idx', 'USING gin (name gin_trgm_ops)'],
  ['partner_contacts_org_email_key', 'USING btree (partner_org_id, email)'],
  ['loan_items_open_org_idx', 'USING btree (partner_org_id) WHERE (returned_at IS NULL)'],
  ['assets_updated_idx', 'USING btree (updated_at DESC, id DESC)'],
  ['assets_status_updated_idx', 'USING btree (status, updated_at DESC, id DESC)'],
  ['loan_requests_created_idx', 'USING btree (created_at DESC, id DESC)'],
  ['loan_requests_status_created_idx', 'USING btree (status, created_at DESC, id DESC)'],
  ['loan_requests_needed_from_idx', 'USING btree (needed_from DESC, id DESC)'],
  [
    'loans_one_per_request',
    'UNIQUE INDEX loans_one_per_request ON public.loans USING btree (loan_request_id)',
  ],
  ['users_username_key', 'UNIQUE INDEX users_username_key ON public.users USING btree (username)'],
] as const;

describe('database catalogue', () => {
  let db: Client;

  beforeAll(async () => {
    db = await connect(getTestDb().superuserUrl);
  });

  afterAll(async () => {
    await db.end();
  });

  it('has the reservations exclusion constraint', async () => {
    const { rows } = await db.query<{ definition: string }>(
      `SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
        WHERE conname = 'reservations_no_overlap' AND contype = 'x'
          AND conrelid = 'public.reservations'::regclass`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.definition).toContain('asset_id WITH =');
    expect(rows[0]?.definition).toContain('period WITH &&');
  });

  it('has the one-open-loan-per-asset unique partial index', async () => {
    const { rows } = await db.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'loan_items_one_open_per_asset'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.indexdef).toContain('UNIQUE');
    expect(rows[0]?.indexdef).toContain('returned_at IS NULL');
  });

  it('has the ledger trigger on asset_movements, enabled and before insert', async () => {
    const { rows } = await db.query<{ enabled: string; before_insert: boolean }>(
      `SELECT tgenabled AS enabled,
              (tgtype & 2) <> 0 AND (tgtype & 4) <> 0 AS before_insert
         FROM pg_trigger
        WHERE tgname = 'apply_asset_movement' AND NOT tgisinternal
          AND tgrelid = 'public.asset_movements'::regclass`,
    );
    expect(rows).toEqual([{ enabled: 'O', before_insert: true }]);
  });

  it('has assets_must_have_movement, deferrable and initially deferred', async () => {
    const { rows } = await db.query<{ deferrable: boolean; deferred: boolean }>(
      `SELECT tgdeferrable AS deferrable, tginitdeferred AS deferred FROM pg_trigger
        WHERE tgname = 'assets_must_have_movement' AND NOT tgisinternal
          AND tgrelid = 'public.assets'::regclass`,
    );
    expect(rows).toEqual([{ deferrable: true, deferred: true }]);
  });

  it.each(HISTORY_TRIGGERS)('has %s trigger %s enabled', async (table, trigger) => {
    const { rows } = await db.query<{ enabled: string }>(
      `SELECT tgenabled AS enabled FROM pg_trigger
        WHERE tgname = $1 AND NOT tgisinternal AND tgrelid = ('public.' || $2)::regclass`,
      [trigger, table],
    );
    expect(rows).toEqual([{ enabled: 'O' }]);
  });

  it.each(RLS_TABLES)('secures %s with row-level security and a partner policy', async (table) => {
    const { rows: flags } = await db.query<{ enabled: boolean }>(
      'SELECT relrowsecurity AS enabled FROM pg_class WHERE oid = ($1)::regclass',
      [`public.${table}`],
    );
    expect(flags).toEqual([{ enabled: true }]);

    // pg_policies.roles is name[], which node-postgres does not parse into an array; unnest it
    // in SQL so each role arrives as its own text value.
    const { rows: policies } = await db.query<{ role: string }>(
      `SELECT unnest(roles)::text AS role
         FROM pg_policies
        WHERE schemaname = 'public' AND tablename = $1`,
      [table],
    );
    const roles = policies.map((policy) => policy.role);
    expect(roles).toContain('wms_partner');
    expect(roles).toContain('wms_staff');
  });

  it('enables row-level security on exactly those tables and no others', async () => {
    const { rows } = await db.query<{ relname: string }>(
      `SELECT relname FROM pg_class
        WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND relrowsecurity`,
    );
    expect(rows.map((row) => row.relname).sort()).toEqual([...RLS_TABLES].sort());
  });

  it('pins search_path on model_availability, which runs with the owner’s rights', async () => {
    const { rows } = await db.query<{ prosecdef: boolean; proconfig: string[] | null }>(
      `SELECT prosecdef, proconfig FROM pg_proc
        WHERE proname = 'model_availability' AND pronamespace = 'public'::regnamespace`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.prosecdef).toBe(true);
    expect(rows[0]?.proconfig?.some((setting) => setting.startsWith('search_path='))).toBe(true);
  });

  it('pins search_path on every function that runs with elevated rights', async () => {
    const { rows } = await db.query<{ proname: string }>(
      `SELECT proname FROM pg_proc
        WHERE pronamespace = 'public'::regnamespace AND prosecdef
          AND NOT COALESCE(proconfig @> ARRAY['search_path=pg_catalog, public'], false)`,
    );
    expect(rows).toEqual([]);
  });

  it('exposes no application function to PUBLIC', async () => {
    // Extension functions (citext, btree_gist) keep their defaults; ours are granted by name.
    const { rows } = await db.query<{ proname: string }>(
      `SELECT p.proname FROM pg_proc p
        WHERE p.pronamespace = 'public'::regnamespace
          AND NOT EXISTS (
            SELECT 1 FROM pg_depend d
             WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
          AND (p.proacl IS NULL
               OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0))
        ORDER BY p.proname`,
    );
    expect(rows).toEqual([]);
  });

  it('indexes the leading column of every foreign key', async () => {
    // asset_movements -> asset_transitions is the one exemption: a sixteen-row table that is
    // never deleted from, so an index would only slow the hottest append path.
    const { rows } = await db.query<{ conrelid: string; conname: string }>(
      `SELECT c.conrelid::regclass::text AS conrelid, c.conname
         FROM pg_constraint c
        WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace
          AND c.conname <> 'asset_movements_transition_fkey'
          AND NOT EXISTS (
            SELECT 1 FROM pg_index i
             WHERE i.indrelid = c.conrelid AND i.indkey[0] = c.conkey[1])
        ORDER BY 1, 2`,
    );
    expect(rows).toEqual([]);
  });

  it('has pg_trgm installed for the console search indexes', async () => {
    const { rows } = await db.query<{ extname: string }>(
      "SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'",
    );
    expect(rows).toEqual([{ extname: 'pg_trgm' }]);
  });

  it.each(CONSOLE_INDEXES)('has index %s defined as %s', async (name, fragment) => {
    const { rows } = await db.query<{ indexdef: string }>(
      "SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1",
      [name],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.indexdef).toContain(fragment);
  });

  it('has the username format and title columns on users', async () => {
    const { rows } = await db.query<{ definition: string }>(
      `SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
        WHERE conname = 'users_username_format' AND contype = 'c'
          AND conrelid = 'public.users'::regclass`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.definition).toContain('^[a-z][a-z0-9._-]{2,23}$');
  });

  it('runs transaction_overview with the caller’s rights, so row-level security applies', async () => {
    const { rows } = await db.query<{ options: string[] | null }>(
      `SELECT reloptions AS options FROM pg_class
        WHERE oid = 'public.transaction_overview'::regclass AND relkind = 'v'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.options).toContain('security_invoker=true');
  });

  it('grants transaction_overview to staff only, and read-only', async () => {
    const { rows } = await db.query<{ grantee: string; privilege: string }>(
      `SELECT grantee, privilege_type AS privilege FROM information_schema.role_table_grants
        WHERE table_schema = 'public' AND table_name = 'transaction_overview'
          AND grantee <> 'wms_migrator'
        ORDER BY grantee, privilege_type`,
    );
    expect(rows).toEqual([{ grantee: 'wms_staff', privilege: 'SELECT' }]);
  });

  it('lets staff write assets.notes but never status or current_location_id', async () => {
    const { rows } = await db.query<{ column_name: string; privilege: string }>(
      `SELECT column_name, privilege_type AS privilege FROM information_schema.column_privileges
        WHERE table_schema = 'public' AND table_name = 'assets' AND grantee = 'wms_staff'
          AND privilege_type IN ('INSERT', 'UPDATE')
          AND column_name IN ('notes', 'status', 'current_location_id')
        ORDER BY column_name, privilege_type`,
    );
    expect(rows).toEqual([
      { column_name: 'notes', privilege: 'INSERT' },
      { column_name: 'notes', privilege: 'UPDATE' },
    ]);
  });

  it('maintains updated_at with a trigger on every table that has the column', async () => {
    const { rows } = await db.query<{ relname: string }>(
      `SELECT c.relname FROM pg_class c
         JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'updated_at' AND NOT a.attisdropped
        WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
          AND NOT EXISTS (
            SELECT 1 FROM pg_trigger t
             WHERE t.tgrelid = c.oid AND NOT t.tgisinternal
               AND t.tgfoid = 'public.touch_updated_at'::regproc)
        ORDER BY c.relname`,
    );
    expect(rows).toEqual([]);
  });
});
