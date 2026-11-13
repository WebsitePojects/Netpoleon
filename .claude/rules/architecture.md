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
| `infra/docker` | Dockerfile, compose files, proxy config | — |

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
