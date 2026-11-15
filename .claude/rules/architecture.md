# Architecture — how the code is organised and why

> Auto-loaded. The short version of `docs/superpowers/specs/2026-11-13-netpoleon-wms-foundation-design.md`.
> When this file and the spec disagree, the spec wins and this file gets fixed.

## Shape
A pnpm workspace. One deployable image runs as different commands (api, migrate, later worker).

| Path | Owns | May import |
|---|---|---|
| `packages/config` | Reading and validating environment variables | nothing internal |
| `packages/contracts` | Request/response schemas shared with the future frontend | nothing internal |
| `packages/db` | SQL migrations, typed tables, the `Database` class | `config` |
| `apps/api` | HTTP: routes, services, repositories | all three packages |
| `apps/web` | The staff console (React + Vite). Slice 1 runs on demo data in `src/data/store.ts` | nothing internal yet |
| `infra/docker` | Dockerfile, compose files, proxy config | — |

Imports go down that table only. A package never imports from `apps/`.

## Inside the web app
- Pages live in `apps/web/src/pages/`; shared pieces in `src/components/`.
- **Every list is a `DataTable`** (`src/components/DataTable.tsx`): search, filter dropdowns,
  sortable headers, row selection with batch actions, CSV export (gated by `reports.export`),
  paging, a loading placeholder with the real column widths, stacked rows on phones. A new
  table passes columns, filters and batch actions; it never builds its own `<table>`. Pass
  `syncUrl` only when the table is the only one on its screen, since the state keys (`q`,
  `page`, `sort`, filter ids) live in the address.
- Batch actions call the store once per row through `runBatch`, which skips rows the store
  refuses and reports the count, so a mixed selection never half-fails silently.
- Partner companies live in the demo store. Loans copy the company name when filed, so a
  rename keeps the old name in `aliases` and history still matches; nothing is rewritten.
- Single-use links (invitation, password reset) keep only the SHA-256 of the token
  (`src/lib/sha256.ts`), as the API does. The demo mailbox shows the email the server would
  send; it disappears when the API is connected.
- Labels print the asset code as a QR code and a Code 128 (set B) barcode
  (`src/lib/barcode.ts`, `src/components/AssetLabel.tsx`), sized in millimetres.
- Tab strips use `Tabs` (`src/components/ui.tsx`); the highlight is one element moved by the
  spring in `useLiquidInk` (`src/lib/hooks.ts`).

## The API platform (build order steps 3 and 4)
- **Every state change goes through `Mutations.run(scope, idempotency, change)`**
  (`apps/api/src/platform/mutations.ts`): one transaction holding the change, its audit row,
  any outbox message and the idempotency key. Routes get the key with `idempotencyOf(request)`.
  Pre-login endpoints (login, links) are the exception and are safe to repeat by design.
- **Audit:** `AuditWriter.record` inside the transaction. Values are kept only for fields in
  its per-target allow-list; anything else (email, phone, password hash) is stored as
  `[changed]`, because the log can never be scrubbed.
- **Side effects:** `Outbox.enqueue` inside the transaction; the worker
  (`apps/api/src/worker.ts`, same image, its own compose service) claims rows with
  `FOR UPDATE SKIP LOCKED` under a lease, retries with backoff, parks after 8 attempts, and
  strips the link from the payload once a row is finished.
- **Auth** (`modules/auth`): argon2id via Node's built-in `crypto.argon2` (Node 24.7+), opaque
  session token in an HttpOnly SameSite=Lax cookie, only its SHA-256 stored; each session row
  carries its own idle window. Single-use links come only from `AuthTokens.issue`.
- **Guards:** `csrfPlugin` (client header + Origin) on every unsafe method; `sessionPlugin`
  attaches `request.session`; routes use `requireSignedIn` / `requirePermission(action)` with
  the one permission table in `@wms/contracts`.
- **Rate limits** are in-process (`platform/rate-limit.ts`): correct for one API instance.

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
- **Never insert into `assets` with Drizzle's `insert()`.** Drizzle names every column and sends
  `default` for the ones you omit, and Postgres checks privilege on every named column — so the
  statement names `status` and fails with 42501 by design. The asset repository inserts with
  explicit SQL listing only the granted columns, then inserts the `registered` movement in the
  same transaction.
