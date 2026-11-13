# Foundation Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the monorepo, the full database with its guarantees proven by attack tests, and an API process that boots, validates its config and reports health.

**Architecture:** pnpm workspace. `packages/db` owns hand-written SQL migrations (the source of truth), a small migration runner, typed Drizzle table definitions, and the one transaction wrapper every query goes through. `apps/api` is a Fastify app built by a factory so tests drive it without a network port. Tests run against a throwaway PostgreSQL started by Testcontainers, so no test needs a secret or an env file.

**Tech Stack:** Node 24, pnpm 12.18.0 (via corepack), TypeScript 6.0.x, Fastify 5.12, Zod 4.6, Drizzle ORM 0.45, node-postgres 8.23, Pino 10, Vitest 5.1, Testcontainers 12.2, ESLint 10 + typescript-eslint 8.72, PostgreSQL 18.

**Spec:** `docs/superpowers/specs/2026-11-13-netpoleon-wms-foundation-design.md`

This plan covers build-order steps 1 and 2 of the spec and the boot half of step 3. Idempotency
middleware, outbox worker, auth and every business endpoint are later plans; their tables are
created here so the schema is reviewed once, whole.

## Global Constraints

- No file whose name starts with `.env` is ever committed, including examples. Variable names
  are documented in prose in `docs/DEPLOY-vps.md`.
- No secret, password or connection string appears in a log line, an error message or a test
  fixture file. Test passwords are generated at run time.
- TypeScript stays on 6.0.x: `typescript-eslint` 8.72 requires `<6.1.0`.
- `"strict": true`, `"noUncheckedIndexedAccess": true`, `"exactOptionalPropertyTypes": true`.
  ES modules only (`"type": "module"`, `"module": "NodeNext"`).
- Dependencies are installed with exact versions (`save-exact=true`). Use the versions in Tech
  Stack; for anything not listed run `npm view <pkg> version` and pin what it prints.
- Primary keys `uuid DEFAULT uuidv7()`. All times `timestamptz`. Table and column names
  `snake_case`; TypeScript properties `camelCase`.
- Every foreign key column is indexed. Every enumeration is a Postgres enum or a `CHECK`.
- Database role names are fixed: `wms_migrator`, `wms_staff`, `wms_partner`.
- Scope settings are `app.user_id` and `app.partner_org_id`, set with `set_config(name, value, true)`.
- Comments explain why, never what. No dead code, no TODO left behind.
- A builder touches only the paths listed in its task. Nobody but Task 1 edits a `package.json`,
  and nobody but the coordinator runs `pnpm install`.
- **Object-oriented, small, no spaghetti (project owner's instruction).** Anything that holds
  state or a dependency is a class with constructor injection and `private readonly` fields:
  one class, one responsibility, one file. Pure stateless helpers stay plain functions — a
  class with no state is noise. No inheritance deeper than one level; compose instead. No
  module-level mutable state, no singletons reached by import. Dependencies point one way:
  routes → services → repositories → `Database`. Fewer lines is better **only** when the result
  is still obvious to a stranger; never compress by cleverness. Where this section and a
  function signature in a task disagree, the class shape given in this plan wins.

## Review Focus

1. **Scope never set.** A query on the partner pool with no `app.partner_org_id` must return
   zero rows, not all rows and not an error that leaks a table name. Pinned in Task 2, test 6b.
2. **Two approvals in the same millisecond.** Two concurrent inserts of overlapping reservations
   for one unit: exactly one commits. Pinned in Task 2, test 2c.
3. **A migration file edited after it was applied.** The runner must stop with a checksum error
   instead of silently skipping it. Pinned in Task 2, test 11b.
4. **Database down at request time.** `/readyz` answers 503 within its timeout and the process
   stays up; `/healthz` still answers 200. Pinned in Task 4, test 3.
5. **Config missing or malformed.** Start-up fails with the *names* of the bad variables and
   never echoes a value. Pinned in Task 1, test 2.

---

## File map

```
package.json  pnpm-workspace.yaml  .npmrc  .nvmrc  .editorconfig  .gitattributes
.dockerignore  .prettierrc.json  eslint.config.js  tsconfig.base.json  vitest.workspace.ts
.gitleaks.toml  README.md
packages/config/      src/index.ts  src/schema.ts  test/config.test.ts
packages/contracts/   src/index.ts  src/problem.ts  src/pagination.ts  test/contracts.test.ts
packages/db/
  migrations/         0001..0010 *.sql
  src/migrate/        runner.ts  bootstrap-roles.ts  cli.ts
  src/schema/         one file per table group  index.ts
  src/client.ts  src/scope.ts  src/index.ts
  test/               global-setup.ts  helpers.ts  guarantees/*.test.ts  runner.test.ts
                      drift.test.ts  client.test.ts
apps/api/             src/app.ts  src/server.ts  src/plugins/*.ts  src/routes/health.ts
                      test/*.test.ts
infra/docker/         Dockerfile  compose.dev.yml  compose.prod.yml  Caddyfile
.github/workflows/ci.yml
docs/DEPLOY-vps.md  docs/RUNBOOK.md
```

---

### Task 1: Workspace skeleton, config and contracts packages, infra, CI

**Files:** every root file in the file map; `packages/config/**`; `packages/contracts/**`;
`infra/docker/**`; `.github/workflows/ci.yml`; `docs/DEPLOY-vps.md`; `docs/RUNBOOK.md`;
`README.md`; and the `package.json` + `tsconfig.json` of `packages/db` and `apps/api`
(manifests only — their source belongs to Tasks 2–4).

**Interfaces — Produces:**

```ts
// @wms/config
export class ConfigError extends Error { readonly invalidKeys: readonly string[] }
export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  apiHost: string;            // API_HOST, default '127.0.0.1'
  apiPort: number;            // API_PORT, default 3000
  appOrigin: string;          // APP_ORIGIN, required, must be a URL
  logLevel: 'fatal'|'error'|'warn'|'info'|'debug'|'trace'; // LOG_LEVEL, default 'info'
  trustProxy: string;         // TRUST_PROXY, default 'loopback'
  db: DbConfig;
}
export interface DbConfig {
  staffUrl: string;           // DATABASE_URL_STAFF, required
  partnerUrl: string;         // DATABASE_URL_PARTNER, required
  staffPoolMax: number;       // DB_POOL_STAFF_MAX, default 10
  partnerPoolMax: number;     // DB_POOL_PARTNER_MAX, default 5
  statementTimeoutMs: number; // DB_STATEMENT_TIMEOUT_MS, default 5000
}
export function loadConfig(env?: NodeJS.ProcessEnv): AppConfig;

// @wms/contracts
export const problemSchema;           // RFC 9457: type, title, status, code, detail?, requestId
export type Problem = z.infer<typeof problemSchema>;
export const pageQuerySchema;         // { cursor?: string, limit: int 1..100 default 25 }
export function pageOf<T>(items: T[], nextCursor: string | null): { items: T[]; nextCursor: string | null };
```

Package manifests Task 1 must create for the other tasks (exact versions from Tech Stack):
- `packages/db` (`@wms/db`): deps `drizzle-orm`, `pg`, `@wms/config`; dev `@types/pg`,
  `@testcontainers/postgresql`, `testcontainers`, `tsx`. Scripts: `migrate` →
  `tsx src/migrate/cli.ts migrate`, `bootstrap` → `tsx src/migrate/cli.ts bootstrap`, `test`.
- `apps/api` (`@wms/api`): deps `fastify`, `fastify-plugin`, `@fastify/helmet`,
  `fastify-type-provider-zod`, `@fastify/swagger`, `zod`, `pino`, `@wms/config`,
  `@wms/contracts`, `@wms/db`; dev `tsx`, `@testcontainers/postgresql`, `testcontainers`.
  Scripts: `dev`, `build`, `start` → `node dist/server.js`, `test`.
- Root scripts: `lint`, `typecheck`, `test`, `build`, `format:check`.

- [x] **Step 1: Write failing tests** in `packages/config/test/config.test.ts`:
  1. `loads defaults` — given only `APP_ORIGIN`, `DATABASE_URL_STAFF`, `DATABASE_URL_PARTNER`,
     `NODE_ENV=test`: `apiHost === '127.0.0.1'`, `apiPort === 3000`, `db.staffPoolMax === 10`,
     `db.partnerPoolMax === 5`, `db.statementTimeoutMs === 5000`.
  2. `names bad variables without echoing values` — env with `API_PORT='abc'` and
     `DATABASE_URL_STAFF='postgres://u:s3cret@h/db'` but no `DATABASE_URL_PARTNER`: throws
     `ConfigError` whose `invalidKeys` equals `['API_PORT','DATABASE_URL_PARTNER']` (sorted) and
     whose `message` contains neither `'abc'` nor `'s3cret'`.
  3. `rejects a non-URL APP_ORIGIN`.
  4. `refuses API_HOST 0.0.0.0 in production` — `invalidKeys` contains `'API_HOST'`. (The spec's
     loopback-only rule; Docker bypasses the host firewall.) Inside a container the bind address
     is set by the compose file's port mapping `127.0.0.1:PORT:PORT`, and `API_HOST` is the
     container-internal address, so production compose sets `API_HOST=0.0.0.0` **only together
     with** `API_IN_CONTAINER=true`; the check passes when that flag is `true`.
  And `packages/contracts/test/contracts.test.ts`: `pageQuerySchema` rejects `limit=101` and
  `limit=0`, defaults to 25; `problemSchema` rejects an object carrying a `stack` key
  (`.strict()`).
- [x] **Step 2:** Coordinator runs `corepack pnpm install` then `corepack pnpm test`; expected FAIL (modules missing).
- [x] **Step 3: Implement** `@wms/config` and `@wms/contracts` to the interfaces above.
- [x] **Step 4: Infra files.**
  - `infra/docker/Dockerfile` — multi-stage, `node:24-slim`, `corepack enable`, build with
    `pnpm install --frozen-lockfile`, runtime stage holds production deps only, `USER node`,
    `ENV NODE_ENV=production`, no secrets as `ARG`/`ENV`. One image; command chosen by compose.
  - `infra/docker/compose.dev.yml` — `postgres:18` only, port `127.0.0.1:5432:5432`, named
    volume, healthcheck `pg_isready`, password from `${POSTGRES_PASSWORD:?}` (fails loudly if unset).
  - `infra/docker/compose.prod.yml` — services `postgres` (no `ports`), `migrate`
    (`restart: "no"`, runs bootstrap then migrate), `api` (`depends_on: migrate:
    service_completed_successfully`, `ports: ["127.0.0.1:${API_PORT:-3000}:3000"]`), and
    `proxy` (Caddy) under `profiles: ["proxy"]`. Every app service: `read_only: true`,
    `cap_drop: [ALL]`, `security_opt: ["no-new-privileges:true"]`, `mem_limit`, `tmpfs: [/tmp]`,
    healthcheck, logging `max-size: 10m`, `max-file: "5"`. Image referenced as
    `${WMS_IMAGE:?}` so deploys pin a digest.
  - `.github/workflows/ci.yml` — on push and PR: checkout, setup-node 24, corepack, install
    frozen, `format:check`, `lint`, `typecheck`, `test`, gitleaks scan, `pnpm audit --prod`,
    docker build (no push). `permissions: contents: read`. Actions pinned to a full commit SHA.
  - `.gitleaks.toml` — extend the default rules.
  - `docs/DEPLOY-vps.md` — a table of every environment variable name, what it is for and
    whether it is secret, with **no values**; the read-only server inspection block required by
    `.claude/rules/vps-safety.md` comes first. `docs/RUNBOOK.md` — headings for restore, rotate a
    secret, create first admin, each marked "written when the feature lands" except local dev
    start-up, which is complete.
- [x] **Step 5:** Run `corepack pnpm format:check && corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`. Expected: all pass (db and api packages have no tests yet; Vitest is configured with `passWithNoTests` for those two only until Tasks 2–4 land).
- [x] **Step 6: Commit** `chore: workspace skeleton, config and contracts packages, infra, CI`.

---

### Task 2: Migrations, runner, role bootstrap, guarantee tests

**Files:** `packages/db/migrations/*.sql`, `packages/db/src/migrate/**`,
`packages/db/test/global-setup.ts`, `packages/db/test/helpers.ts`,
`packages/db/test/guarantees/**`, `packages/db/test/runner.test.ts`.

**Interfaces — Produces:**

```ts
// packages/db/src/migrate/runner.ts
export interface MigrationResult { applied: string[]; skipped: string[] }
export class MigrationChecksumError extends Error { readonly file: string }
export class MigrationRunner {
  constructor(opts: { connectionString: string; dir: string });
  run(): Promise<MigrationResult>;
}
// packages/db/src/migrate/bootstrap-roles.ts
export class RoleBootstrapper {
  constructor(opts: {
    superuserUrl: string;
    passwords: { migrator: string; staff: string; partner: string };
    database: string;
  });
  run(): Promise<void>; // idempotent: CREATE ROLE if absent, ALTER ROLE ... PASSWORD always
}

// packages/db/test/helpers.ts  (also consumed by Tasks 3 and 4)
export interface TestDb { superuserUrl: string; migratorUrl: string; staffUrl: string; partnerUrl: string }
export function getTestDb(): TestDb;                       // reads what global-setup provided
export function sqlState(fn: () => Promise<unknown>): Promise<string | null>; // SQLSTATE or null
```

**Runner rules:** table `schema_migrations(filename text primary key, checksum text not null,
applied_at timestamptz not null default now())`. Take `pg_advisory_xact_lock` inside the
transaction that applies each file, so two deploys cannot interleave. One transaction per file.
Files sorted by name. Checksum is SHA-256 of the file bytes with line endings normalised to LF
(Windows checkouts must not change a checksum). An applied file whose checksum differs throws
`MigrationChecksumError`.

**Bootstrap rules:** `wms_migrator` owns the database's `public` schema objects; `REVOKE ALL ON
SCHEMA public FROM PUBLIC`; `wms_staff` and `wms_partner` get `USAGE` on the schema and
`CONNECT` on the database only. Both app roles get `ALTER ROLE ... SET statement_timeout =
'5s'`, `lock_timeout = '3s'`, `idle_in_transaction_session_timeout = '15s'`. Passwords are passed
as bound parameters through `format('%L')`, never concatenated in TypeScript.

**Schema (decisions; the builder writes the SQL).** `id uuid pk default uuidv7()`,
`created_at`/`updated_at timestamptz not null default now()` on every table unless noted.

*0001 extensions and types* — `btree_gist`, `citext`. Enums: `user_kind(staff, partner)`;
`user_role(admin, manager, warehouse, auditor, partner_admin, partner_member)`;
`user_status(invited, active, deactivated)`; `org_type(partner, reseller, internal_team,
branch)`; `org_status(active, archived)`; `asset_status(registered, in_stock, on_demo, returned,
under_inspection, for_repair, retired, lost)`; `ownership_type(owned, vendor_consigned)`;
`request_status(submitted, approved, rejected, cancelled, expired, fulfilled)`;
`reservation_status(active, needs_reassignment, released, completed, cancelled, expired)`;
`movement_type(registered, stocked, relocated, released, returned, inspection_started,
restocked, sent_to_repair, repaired, retired, marked_lost, found)`;
`inspection_outcome(restock, repair, reassign, retire)`; `condition_grade(a, b, c, d)`;
`outbox_status(pending, processing, done, failed)`; `auth_token_purpose(invite, password_reset)`;
`location_kind(site, room, shelf)`; `extension_status(requested, approved, rejected)`.

`registered` is added to the spec's status list: a unit that is encoded but not yet shelved
(workflow step 1 before step 2) needs a state, and it must not count as available.

*0002 identity*
- `partner_orgs`: `name text not null`, `type org_type not null`, `status org_status not null
  default 'active'`; unique `lower(name)`.
- `users`: `email citext not null unique`, `full_name text not null`, `phone text`,
  `password_hash text`, `kind user_kind not null`, `role user_role not null`, `partner_org_id
  uuid references partner_orgs`, `status user_status not null default 'invited'`,
  `failed_login_count int not null default 0`, `locked_until timestamptz`, `last_login_at
  timestamptz`. `CHECK`: (`kind='partner'` AND `role IN (partner_admin, partner_member)` AND
  `partner_org_id IS NOT NULL`) OR (`kind='staff'` AND `role IN (admin, manager, warehouse,
  auditor)` AND `partner_org_id IS NULL`). `CHECK`: `status <> 'active' OR password_hash IS NOT NULL`.
- `sessions`: `token_hash bytea not null unique`, `user_id` fk, `idle_expires_at`,
  `absolute_expires_at`, `revoked_at`, `ip inet`, `user_agent text`. No `updated_at`.
- `auth_tokens`: `token_hash bytea not null unique`, `user_id` fk, `purpose`, `expires_at not
  null`, `used_at`. No `updated_at`.

*0003 catalogue and stock*
- `categories`: `name text not null unique`, `code text not null unique CHECK (code ~ '^[A-Z]{2,4}$')`.
- `product_models`: `category_id` fk, `brand text not null`, `model_name text not null`,
  `is_bookable boolean not null default true`; unique (`lower(brand)`, `lower(model_name)`).
- `model_accessories`: `product_model_id` fk, `name text not null`; unique (model, `lower(name)`).
- `locations`: `parent_id` self fk, `kind location_kind not null`, `code text not null unique`,
  `name text not null`.
- `assets`: `asset_code text not null unique CHECK (asset_code ~ '^NTP-[A-Z]{2,4}-[0-9]{5}$')`,
  `serial_number text not null`, `product_model_id` fk, `status asset_status not null default
  'registered'`, `condition condition_grade not null default 'a'`, `current_location_id` fk
  null, `ownership ownership_type not null default 'owned'`, `owner_name text`, `retired_at`.
  Unique (`product_model_id`, `serial_number`). `CHECK (ownership = 'owned' OR owner_name IS NOT
  NULL)`. Indexes: (`status`), (`product_model_id`, `status`), (`current_location_id`).

*0004 booking and lending* — child tables carry `partner_org_id` and a composite foreign key
`(parent_id, partner_org_id)` to the parent's unique `(id, partner_org_id)`, so row-level
security needs no subquery and a child can never belong to a different company than its parent.
- `loan_requests`: `request_no text not null unique`, `partner_org_id` fk, `filed_by_user_id`
  fk, `contact_name`, `contact_email citext`, `contact_phone` (all not null), `needed_from date
  not null`, `needed_until date not null`, `purpose text not null`, `end_customer text`,
  `status request_status not null default 'submitted'`, `decided_by_user_id` fk null,
  `decided_at`, `decision_note text`. `CHECK (needed_until >= needed_from)`. `CHECK
  (decided_by_user_id IS NULL OR decided_by_user_id <> filed_by_user_id)` — the filer cannot
  approve. Unique (`id`, `partner_org_id`). Indexes: (`partner_org_id`, `created_at desc`),
  (`status`, `needed_from`).
- `loan_request_items`: `loan_request_id`, `partner_org_id`, `product_model_id` fk,
  `quantity_requested int not null CHECK (> 0)`, `quantity_assigned int not null default 0 CHECK
  (quantity_assigned BETWEEN 0 AND quantity_requested)`; unique (request, model).
- `reservations`: `asset_id` fk, `loan_request_item_id` fk, `period daterange not null`,
  `status reservation_status not null default 'active'`. `CHECK (NOT isempty(period) AND
  lower_inc(period) AND NOT upper_inc(period))`. Constraint `reservations_no_overlap`:
  `EXCLUDE USING gist (asset_id WITH =, period WITH &&) WHERE (status IN ('active',
  'needs_reassignment', 'released'))`. Index (`loan_request_item_id`).
- `loans`: `loan_no text not null unique`, `loan_request_id`, `partner_org_id`,
  `contact_name`, `contact_email citext`, `contact_phone`, `released_by_user_id` fk,
  `released_at timestamptz not null`, `due_date date not null`, `closed_at`, `is_backdated
  boolean not null default false`. Unique (`id`, `partner_org_id`). Indexes: (`partner_org_id`,
  `released_at desc`), partial (`due_date`) `WHERE closed_at IS NULL` — the overdue sweep's index.
- `loan_items`: `loan_id`, `partner_org_id`, `asset_id` fk, `reservation_id` fk null,
  `released_at not null`, `returned_at`, `accessories_out jsonb not null default '[]'`,
  `accessories_back jsonb`. Unique index `loan_items_one_open_per_asset` on (`asset_id`) `WHERE
  returned_at IS NULL`. Index (`loan_id`).
- `loan_extensions`: `loan_id`, `partner_org_id`, `requested_by_user_id` fk,
  `requested_due_date date not null`, `reason text not null`, `status extension_status not null
  default 'requested'`, `decided_by_user_id` fk null, `decided_at`.

*0005 inspection and repair*
- `inspections`: `loan_item_id` fk null, `asset_id` fk, `inspector_user_id` fk, `condition
  condition_grade not null`, `checklist jsonb not null default '{}'`, `missing_accessories jsonb
  not null default '[]'`, `notes text`, `outcome inspection_outcome not null`.
- `repair_tickets`: `asset_id` fk, `opened_by_user_id` fk, `problem text not null`, `opened_at
  not null default now()`, `closed_at`, `resolution text`. Partial unique (`asset_id`) `WHERE
  closed_at IS NULL`.

*0006 accountability*
- `asset_transitions`: primary key (`movement_type`, `from_status`, `to_status`). No id, no
  timestamps. Rows (seeded in 0010): registered registered→registered; stocked
  registered→in_stock; relocated in_stock→in_stock; released in_stock→on_demo; returned
  on_demo→returned; inspection_started returned→under_inspection; restocked
  under_inspection→in_stock; sent_to_repair under_inspection→for_repair and
  in_stock→for_repair; repaired for_repair→under_inspection; retired from in_stock,
  under_inspection and for_repair →retired; marked_lost from on_demo and in_stock →lost; found
  lost→under_inspection.
- `asset_movements`: `asset_id` fk, `movement_type`, `from_status`, `to_status`,
  `from_location_id` fk null, `to_location_id` fk null, `actor_user_id` fk not null,
  `loan_item_id` fk null, `note text`, `occurred_at timestamptz not null default now()`. Foreign
  key (`movement_type`, `from_status`, `to_status`) → `asset_transitions`. No `updated_at`.
  Index (`asset_id`, `occurred_at desc`), (`occurred_at`).
- Function `apply_asset_movement()` — `BEFORE INSERT` trigger on `asset_movements`,
  `SECURITY DEFINER`, `SET search_path = pg_catalog, public`: `SELECT status,
  current_location_id ... FOR UPDATE`; if the asset's status differs from `NEW.from_status`
  raise with `ERRCODE = 'WM001'`; set `NEW.from_location_id` to the current location; update
  the asset's `status`, `current_location_id = COALESCE(NEW.to_location_id,
  current_location_id)` and `updated_at`.
- Constraint trigger `assets_must_have_movement` — `AFTER INSERT ON assets DEFERRABLE INITIALLY
  DEFERRED`: raise `ERRCODE = 'WM002'` if no `asset_movements` row exists for the new asset.
- `audit_log`: `actor_user_id` fk null (null = system), `action text not null`, `target_type
  text not null`, `target_id uuid`, `changed_fields jsonb not null default '{}'`, `ip inet`,
  `request_id text`, `occurred_at not null default now()`. No `updated_at`. Index
  (`target_type`, `target_id`, `occurred_at desc`), (`actor_user_id`, `occurred_at desc`).
- Function `reject_history_change()` raising `ERRCODE = 'WM003'`; triggers `BEFORE UPDATE OR
  DELETE` (row) and `BEFORE TRUNCATE` (statement) on `asset_movements` and `audit_log`.
- `notifications`: `user_id` fk, `kind text not null`, `payload jsonb not null default '{}'`,
  `dedupe_key text not null`, `read_at`. Unique (`user_id`, `dedupe_key`). Index (`user_id`,
  `created_at desc`) `WHERE read_at IS NULL`.

*0007 plumbing*
- `idempotency_keys`: `user_id` fk, `key text not null`, `route text not null`, `request_hash
  bytea not null`, `response_status int`, `response_body jsonb`, `expires_at not null`. Unique
  (`user_id`, `key`). Index (`expires_at`).
- `outbox`: `topic text not null`, `payload jsonb not null`, `status outbox_status not null
  default 'pending'`, `attempts int not null default 0`, `next_attempt_at not null default
  now()`, `locked_until`, `last_error text`. Partial index (`next_attempt_at`) `WHERE status IN
  ('pending','processing')`.
- `counters`: `prefix text primary key`, `value bigint not null default 0`. Function
  `next_counter(p_prefix text) returns bigint` — `INSERT ... ON CONFLICT (prefix) DO UPDATE SET
  value = counters.value + 1 RETURNING value`. `SECURITY DEFINER`, pinned `search_path`. App
  roles get `EXECUTE` and no direct privilege on the table.
- `settings`: `key text primary key`, `value jsonb not null`, `updated_by_user_id` fk null.
- `worker_heartbeats`: `worker_name text primary key`, `beat_at timestamptz not null`.

*0008 grants and row-level security*
- `wms_staff`: `SELECT, INSERT, UPDATE, DELETE` on all tables, then narrowed: `asset_movements`
  and `audit_log` — `SELECT, INSERT` only, plus `REVOKE TRUNCATE`; `asset_transitions` —
  `SELECT` only; `counters` — nothing; `assets` — `INSERT` and `UPDATE` granted per column on
  every column **except** `status` and `current_location_id`; no `DELETE` on `assets`, `users`,
  `partner_orgs`, `loans`, `loan_items`, `loan_requests`, `reservations`.
- `wms_partner`: `SELECT` on `categories`, `product_models`, `model_accessories`; `SELECT`
  on `partner_orgs`; column-limited `SELECT` on `users` (`id, email, full_name, phone, role,
  status, partner_org_id` — never `password_hash`); `SELECT, INSERT` on `loan_requests` and
  `loan_request_items` plus `UPDATE (status)` on `loan_requests` (to cancel); `SELECT` on `loans`
  and `loan_items`; `SELECT, INSERT` on `loan_extensions`; `SELECT, UPDATE (read_at)` on
  `notifications`; `SELECT, INSERT, UPDATE` on `idempotency_keys`; `INSERT` only on `outbox`
  and `audit_log`. Nothing on any other table.
- Enable row-level security on every table `wms_partner` can reach except the three catalogue
  tables. For each: a policy `TO wms_staff USING (true) WITH CHECK (true)`, and a policy `TO
  wms_partner` with both `USING` and `WITH CHECK` on `partner_org_id =
  NULLIF(current_setting('app.partner_org_id', true), '')::uuid` (`partner_orgs` compares `id`;
  `notifications` and `idempotency_keys` compare `user_id` with `app.user_id`). `outbox` and
  `audit_log` for the partner are `FOR INSERT WITH CHECK (true)` with no `SELECT` policy.
- Partner `loan_requests` update policy adds `WITH CHECK (status = 'cancelled')`.

*0009 functions* — `model_availability(p_from date, p_until date) RETURNS TABLE
(product_model_id uuid, units_free int)`: `STABLE SECURITY DEFINER`, pinned `search_path`. Per
bookable model, counts assets with status `in_stock` or `returned`, `under_inspection`,
`on_demo` (physically expected back) that have no reservation in an occupying status
overlapping `daterange(p_from, p_until, '[]')`. Raises if `p_until < p_from` or the span
exceeds 366 days. `EXECUTE` to both app roles; `REVOKE` from `PUBLIC`.

*0010 reference data* — `asset_transitions` rows above; `categories`: Firewall `FW`, Network
Switch `SW`, Router `RT`, Access Point `AP`, Server `SRV`, Laptop `LT`, Storage `ST`, Other
`OT`; `settings`: `booking.buffer_days` 2, `booking.max_days` 30, `booking.max_units` 10,
`booking.pickup_grace_days` 3, `session.idle_hours` 12, `session.remember_days_staff` 7,
`session.remember_days_partner` 30. **No users.**

- [x] **Step 1: `global-setup.ts`.** Start `postgres:18` with Testcontainers, generate three
  random passwords with `crypto.randomBytes`, call `bootstrapRoles`, call `runMigrations` as
  the migrator, `provide` the four URLs. Tear the container down on exit.
- [x] **Step 2: Write the failing guarantee tests** (`packages/db/test/guarantees/`). Each
  connects with the role named. Assertions are on SQLSTATE via `sqlState()`.
  1. `catalogue.test.ts` — queries `pg_constraint`, `pg_indexes`, `pg_trigger`, `pg_policies`,
     `pg_proc`: `reservations_no_overlap`, `loan_items_one_open_per_asset`, triggers
     `apply_asset_movement`, `assets_must_have_movement`, both history triggers on both tables,
     a policy for `wms_partner` on each row-secured table, `model_availability` with
     `prosecdef = true` and a `proconfig` containing `search_path=`.
  2. `double-booking.test.ts` (staff) — (a) overlapping `active` reservation on one asset →
     `23P01`; (b) adjacent ranges `[1st,5th)` and `[5th,9th)` both succeed; (c) two connections
     insert overlapping reservations inside open transactions and commit together: exactly one
     succeeds, the other gets `23P01`; (d) overlap with a `cancelled` reservation succeeds;
     (e) updating a `cancelled` row back to `active` when it now overlaps → `23P01`.
  3. `open-loan.test.ts` (staff) — second `loan_items` row for an asset with `returned_at IS
     NULL` → `23505`; succeeds after the first is returned.
  4. `status-ledger.test.ts` — (a) staff `UPDATE assets SET status = 'in_stock'` → `42501`;
     (b) staff `UPDATE assets SET current_location_id = ...` → `42501`; (c) movement whose
     `from_status` is not the asset's status → `WM001`; (d) movement `released` from
     `registered` (unlisted) → `23503`; (e) valid `stocked` movement sets status `in_stock` and
     the location; (f) two connections insert `released` for one `in_stock` asset concurrently:
     one commits, the other gets `WM001`; (g) inserting an asset and committing with no
     movement → `WM002`; (h) staff `INSERT INTO assets (..., status)` naming the status column →
     `42501`.
  5. `append-only.test.ts` — staff `UPDATE`, `DELETE`, `TRUNCATE` on `asset_movements` and on
     `audit_log` → `42501` each (six assertions); the migrator's `UPDATE` and `DELETE` → `WM003`.
  6. `partner-wall.test.ts` — two orgs A and B with a request each. (a) partner with scope A
     selects `loan_requests`: sees exactly A's row; (b) partner with **no** scope set: zero
     rows, no error; (c) scope A inserts a request with `partner_org_id = B` → `42501`;
     (d) scope A updates B's request → 0 rows affected; (e) scope A sets its own request to
     `approved` → `42501`, to `cancelled` succeeds; (f) partner `SELECT` on `audit_log`,
     `locations`, `assets`, `sessions`, `settings`, `reservations` → `42501` each; (g) partner
     `SELECT password_hash FROM users` → `42501`, `SELECT email FROM users` returns only org A's
     users; (h) scope set to the string `'not-a-uuid'` → `22P02` and no rows leak; (i) a child
     `loan_request_items` row whose `partner_org_id` differs from its parent's → `23503`.
  7. `availability.test.ts` — model with 3 `in_stock` assets, one reserved by org B for the
     window: partner scope A calling `model_availability` gets `units_free = 2`; the result has
     exactly the two documented columns; `p_until < p_from` raises; a `retired` asset is not counted.
  8. `identity.test.ts` — staff role with an org → `23514`; partner role without an org →
     `23514`; `active` user without `password_hash` → `23514`; emails differing only by case →
     `23505`; request decided by its own filer → `23514`.
  9. `counters.test.ts` — 50 concurrent `next_counter('BRR-2026')` calls on separate
     connections return exactly the set 1..50; staff `SELECT` on `counters` → `42501`.
- [x] **Step 3: `runner.test.ts`** against a second, empty database in the same container:
  (a) first run applies all ten files in name order; (b) second run applies none
  (`applied.length === 0`, `skipped.length === 10`); (11b) a copy of the directory with one
  applied file's bytes changed → `MigrationChecksumError` naming that file; (c) the same file
  with only CRLF line endings → no error; (d) a file whose SQL fails leaves `schema_migrations`
  without that file and none of its statements applied.
- [x] **Step 4:** Run `corepack pnpm --filter @wms/db test`. Expected: FAIL — no migrations.
- [x] **Step 5: Implement** runner, bootstrap, CLI (`migrate` reads `DATABASE_URL_MIGRATOR`;
  `bootstrap` reads `DATABASE_URL_SUPERUSER`, `WMS_MIGRATOR_PASSWORD`, `WMS_STAFF_PASSWORD`,
  `WMS_PARTNER_PASSWORD`; both print file names and counts, never a URL) and the ten migrations.
- [x] **Step 6:** Run `corepack pnpm --filter @wms/db test`. Expected: every test above passes.
- [x] **Step 7: Commit** `feat(db): schema, migration runner, role bootstrap, guarantee tests`.

---

### Task 3: Typed schema, pools and the transaction wrapper

**Files:** `packages/db/src/schema/**`, `packages/db/src/client.ts`, `packages/db/src/scope.ts`,
`packages/db/src/index.ts`, `packages/db/test/drift.test.ts`, `packages/db/test/client.test.ts`.

**Interfaces — Consumes:** `DbConfig` from `@wms/config`; `getTestDb()` from Task 2's helpers;
the table and column names in Task 2's schema section, exactly.

**Produces:**

```ts
export type ActorScope =
  | { kind: 'staff'; userId: string }
  | { kind: 'partner'; userId: string; partnerOrgId: string }
  | { kind: 'system' };
export type Tx = NodePgDatabase<typeof schema>;
export class Database {                                   // pools are private fields
  constructor(config: DbConfig, onPoolError: (err: Error) => void);
  transaction<T>(scope: ActorScope, fn: (tx: Tx) => Promise<T>): Promise<T>;
  ping(timeoutMs: number): Promise<boolean>;              // never throws
  migrationsCurrent(expectedCount: number): Promise<boolean>;
  close(): Promise<void>;
}
export const EXPECTED_MIGRATION_COUNT = 10;
export * as schema from './schema/index.js';
export { MigrationRunner, RoleBootstrapper } from './migrate/...';
```

In the tests below, `withTransaction` means `Database.transaction` and `pingDb` means
`Database.ping`. `Database.transaction` is the only way to reach the database. `partner` scope uses the
partner pool and sets both settings; `staff` uses the staff pool and sets `app.user_id`;
`system` uses the staff pool and sets neither. Pools set `application_name` (`wms-staff`,
`wms-partner`) and `statement_timeout` from config. A pool `error` event is logged by the
caller-supplied handler and never crashes the process.

- [x] **Step 1: Failing tests.**
  `client.test.ts`: (a) `partner` scope → `current_user` is `wms_partner` and
  `current_setting('app.partner_org_id')` equals the scope's org; (b) `staff` scope →
  `wms_staff`; (c) after a `partner` transaction commits, the next transaction on the same
  pooled connection with a different org sees the new org, and a raw checkout shows the setting
  empty (pool `max: 1` to force reuse) — proves scope cannot leak between requests; (d) `fn`
  throwing rolls back: a row inserted before the throw is absent; (e) a `partner` scope whose
  `partnerOrgId` is not a UUID is rejected by `withTransaction` before any query runs; (f)
  `pingDb` returns `false` within `timeoutMs` against a closed port and does not throw; (g) a
  query exceeding `statementTimeoutMs` fails with `57014`.
  `drift.test.ts`: for every Drizzle table, the set of (column name, `is_nullable`, base data
  type) equals `information_schema.columns` for that table; and the set of Drizzle table names
  equals the set of base tables in `public` minus `schema_migrations`.
- [x] **Step 2:** Run `corepack pnpm --filter @wms/db test`. Expected: the two new files FAIL.
- [x] **Step 3: Implement** the Drizzle table definitions (one file per migration group, enums
  via `pgEnum`), `scope.ts` (type and UUID validation), `client.ts`.
- [x] **Step 4:** Run the package tests. Expected: PASS.
- [x] **Step 5: Commit** `feat(db): typed schema, scoped transaction wrapper, drift test`.

---

### Task 4: API process — boot, health, errors, hardening

**Files:** `apps/api/src/**`, `apps/api/test/**`.

**Interfaces — Consumes:** `loadConfig`, `AppConfig` (`@wms/config`); `problemSchema`
(`@wms/contracts`); `createDb`, `Db`, `pingDb`, `migrationsCurrent`,
`EXPECTED_MIGRATION_COUNT` (`@wms/db`).

**Produces:**

```ts
// apps/api/src/app.ts
export interface AppDeps { config: AppConfig; db: Database }
export function buildApp(deps: AppDeps): Promise<FastifyInstance>; // the composition root
// apps/api/src/modules/health/health.service.ts
export class HealthService {
  constructor(db: Database, expectedMigrations: number);
  isReady(): Promise<boolean>;
}
// apps/api/src/modules/health/health.routes.ts — registers /healthz and /readyz, given a HealthService
// apps/api/src/errors.ts
export class AppError extends Error {
  constructor(readonly status: number, readonly code: string, title: string, detail?: string);
}
```

Behaviour: `GET /healthz` → `200 {"status":"ok"}`, touches nothing. `GET /readyz` → `200
{"status":"ready"}` when `pingDb(db, 1000)` and `migrationsCurrent` are both true, else `503`
problem with `code: "not_ready"`. Every error leaves as `application/problem+json` matching
`problemSchema`; a non-`AppError` becomes `500` with `code: "internal_error"` and a fixed
title — its message is logged, never returned. Unknown route → `404` `code: "not_found"`.
Validation failure → `400` `code: "validation_failed"` listing field paths, not values.
`genReqId` yields a UUID and ignores any inbound `x-request-id`; the id is returned in an
`x-request-id` response header and in every problem body. `bodyLimit` 1 MiB. `trustProxy` from
config. Helmet with a `default-src 'none'` policy (this is a JSON API) and HSTS in production.
Logger redacts `req.headers.authorization`, `req.headers.cookie`, `res.headers["set-cookie"]`,
`*.password`, `*.token`, `*.passwordHash`. `server.ts`: `loadConfig()`, `createDb`, `buildApp`,
`listen`; on `SIGTERM`/`SIGINT` `app.close()` then `db.close()`, forced exit after 10 s; a
`ConfigError` prints its `invalidKeys` and exits 1.

- [x] **Step 1: Failing tests** using `app.inject`, real database from `getTestDb()`:
  1. `healthz returns 200 without touching the database` (build with a `Db` pointed at a closed port).
  2. `readyz returns 200 when the database is migrated`.
  3. `readyz returns 503 problem within 1500 ms when the database is unreachable`, and a
     following `/healthz` still returns 200.
  4. `unknown route returns a 404 problem with a requestId`.
  5. `an unexpected throw returns 500 with code internal_error and does not leak the message` —
     register a test-only route that throws `new Error('pg password=hunter2')`; body must not
     contain `hunter2`.
  6. `body over 1 MiB returns 413 problem`.
  7. `inbound x-request-id is not trusted` — send `x-request-id: evil`; the response header is a UUID.
  8. `security headers are present` — `x-content-type-options: nosniff`,
     `content-security-policy` contains `default-src 'none'`, no `x-powered-by`.
  9. `logs redact secrets` — capture the log stream, send a request with `authorization` and
     `cookie` headers; neither value appears in any log line.
  10. `malformed JSON returns a 400 problem, not a 500`.
- [x] **Step 2:** Run `corepack pnpm --filter @wms/api test`. Expected: FAIL.
- [x] **Step 3: Implement** `app.ts`, `errors.ts`, `plugins/` (error handler, request id,
  security headers), `modules/health/` (service + routes), `server.ts`. `modules/health` is the
  template every later module copies: `<name>.routes.ts`, `<name>.service.ts`, and, once it
  touches tables, `<name>.repository.ts`. `buildApp` is the only place objects are constructed
  and wired; nothing else calls `new` on a service or reaches for `Database` by import.
- [x] **Step 4:** Run the package tests. Expected: PASS.
- [x] **Step 5: Commit** `feat(api): bootable API with health, problem errors and hardening`.

---

### Task 5: Integration and falsification (coordinator)

- [x] `corepack pnpm install --frozen-lockfile && corepack pnpm format:check && corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test` from a clean checkout. Quote the output.
  _2026-11-14, GitHub Actions clean checkout: Test Files 17 passed (17), Tests 200 passed (200).
  The 149 database tests were also run three times in a row with no flakes._
- [x] `docker build -f infra/docker/Dockerfile .` succeeds; `docker run --rm <image> id -u` is not `0`.
  _Build proven in CI. The uid check is now a CI step ("Image runs as non-root")._
- [x] `git ls-files | grep -E '(^|/)\.env'` prints nothing. Gitleaks over the full history is clean.
- [ ] Adversarial read of every migration and of `client.ts` against spec sections 7, 9 and 15.
  _Partial: 0006, 0008, 0009, the runner and `client.ts` were read; two holes found and fixed
  (partner audit forgery, cancelling finished requests). 0001–0005, 0007 and 0010 not yet read
  line by line — their guarantees are covered by the attack tests, but a reviewer pass is owed._
- [x] Update `CLAUDE.md` commands and `.claude/rules/conventions.md`; check
  `.claude/rules/architecture.md` against the code as built; append lessons.
- [x] Build the code map: `graphify .` from the repository root; commit
  `graphify-out/GRAPH_REPORT.md`, `graph.json`, `graph.html` (see `.claude/rules/agent-context.md`).
