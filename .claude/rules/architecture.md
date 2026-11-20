# Architecture — how the code is organised and why

> Auto-loaded. The short version of `docs/superpowers/specs/2026-11-13-netpoleon-wms-foundation-design.md`.
> When this file and the spec disagree, the spec wins and this file gets fixed.

## Shape
A pnpm workspace. Two images: `runtime` runs as different commands (api, worker, migrate, the
CLIs) and `web` serves the console through nginx, which forwards `/api` (same origin).

| Path | Owns | May import |
|---|---|---|
| `packages/config` | Reading and validating environment variables | nothing internal |
| `packages/contracts` | Request/response schemas shared with the future frontend | nothing internal |
| `packages/db` | SQL migrations, typed tables, the `Database` class | `config` |
| `apps/api` | HTTP: routes, services, repositories; `src/worker` (outbox, jobs); `src/cli` (seed, admin-create) | all three packages |
| `apps/web` | The console: React + TanStack Query, talking only to `/api/v1` | `contracts` |
| `infra/docker` | Dockerfile (targets `runtime`, `web`), compose files, nginx and Caddy config | — |
| `infra/scripts` | `backup.sh` (encrypted nightly dump), `restore-check.sh` | — |

Imports go down that table only. A package never imports from `apps/`.

## Inside the API: three layers, one direction
`routes → services → repositories → Database`. A layer never reaches past the one below it.

- **Routes** validate input, check session and permission, call one service method, shape the
  response. No business rules, no SQL.
- **Services** hold the business rules. One service method is one database transaction.
- **Repositories** hold SQL only, and every method takes the actor's scope.

Each feature is a folder `apps/api/src/modules/<name>/` with `<name>.routes.ts`,
`<name>.service.ts`, `<name>.repository.ts`. `modules/health` is the template to copy.

## Object rules (project owner's instruction)
- Anything holding state or a dependency is a class: constructor injection, `private readonly`
  fields, one responsibility, one file.
- Stateless helpers are plain functions. A class with no state is noise.
- `buildApp` in `apps/api/src/app.ts` is the only composition root — the one place objects are
  constructed and wired. Nothing else calls `new` on a service or imports a shared instance.
- No module-level mutable state. No inheritance deeper than one level; compose.
- Fewer lines only when the result is still obvious to a stranger.

## The database is the last line of defence
These hold even if application code is wrong. Each has an attack test in
`packages/db/test/guarantees/`. Never weaken one to make a feature easier.

- **No double booking** — exclusion constraint `reservations_no_overlap`.
- **One open loan per unit** — partial unique index `loan_items_one_open_per_asset`.
- **Status always matches history** — app roles cannot update `assets.status`; inserting into
  `asset_movements` is the only way, and the allowed moves are rows in `asset_transitions`.
- **History is append-only** — no update, delete or truncate on `asset_movements`, `audit_log`.
- **Partner wall** — partner requests run as database role `wms_partner` under row-level
  security. A missing scope returns zero rows.

## Rules that are easy to break by accident
- All database access goes through `Database.transaction(scope, fn)`. There is no other door.
- Migrations are hand-written SQL in `packages/db/migrations/`, forward-only. Never edit an
  applied file — the runner compares checksums and stops. Add a new file.
- A new table needs: indexes on its foreign keys, grants for each role, a row-level security
  policy if partners can reach it, a typed definition in `packages/db/src/schema/`, and
  `EXPECTED_MIGRATION_COUNT` raised by one.
- Side effects (email, notifications) are written to `outbox` inside the transaction. Nothing
  is sent from a request handler.
- "Today" is Asia/Manila, stated in the query. Containers run in UTC.
- Every mutation takes an `Idempotency-Key` and calls `idempotent(tx, ctx, body, fn)` inside its
  own transaction (`apps/api/src/platform/idempotency.ts`); the console makes one key per dialog.
- A route gets its `RequestContext` only from `guard.require(request, action)`; the permission
  table is `can()` in `packages/contracts/src/permissions.ts`, shared with the console.
- Lists are offset-paged with a `total` (plan R2); the console's `DataTable` has a server mode
  that keeps search, filters, sort and page in the URL for the page's query to read.
- Repositories use drizzle's `sql` tag: arrays bind as `IN ${list}`, timestamps come back as
  strings (see lessons 2026-11-19).
- `modules/partners` owns borrowing companies and their contacts; `TransactionsService` takes its
  repository to resolve a request's company (share-locked, archived refused) and remember the
  contact. Catalog no longer serves `/partners`.
- Go-live paths: `POST /units/import` (checks a whole file in `units.import.ts`, a pure function,
  then registers all or nothing) and `POST /transactions/existing` (`loan.backdate`, admin only:
  files, reserves and releases in one transaction with `loans.is_backdated`).
- One transaction is one connection: never `Promise.all` queries on the same `tx` (pg 9 rejects
  overlapping queries on a client); await them in turn.
- **Never insert into `assets` with Drizzle's `insert()`.** Drizzle names every column and sends
  `default` for the ones you omit, and Postgres checks privilege on every named column — so the
  statement names `status` and fails with 42501 by design. The asset repository inserts with
  explicit SQL listing only the granted columns, then inserts the `registered` movement in the
  same transaction.
