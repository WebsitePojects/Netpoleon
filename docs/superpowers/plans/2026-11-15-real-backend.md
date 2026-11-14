# Real backend for the staff console, and first deploy

- **Date:** 2026-11-15 · **Branch:** `feat/backend-slice-1`
- **Goal [USER]:** replace the browser demo store with the real API and database, make page
  loads feel instant, and ship it to the VPS in Docker containers.
- **Sources:** foundation spec (`docs/superpowers/specs/2026-11-13-netpoleon-wms-foundation-design.md`),
  web plan (`docs/superpowers/plans/2026-11-14-web-ui-slices.md`), the migrations as built.
- **Markers:** **[USER]** owner decided · **[CALL]** architect decided, open to correction.
- **Read section 9 first.** It holds the corrections from the adversarial review and overrides
  anything in sections 2 to 5 that it contradicts.
- **How it is built [USER]:** Opus builders write the code on disjoint folders; the coordinator
  plans, reviews, runs the real checks and tries to break the result.

## 1. Scope

**In:** everything the staff console (web slice 1) shows, made real: sign-in and sessions,
units, borrow/return, inspection and repair, reports, alerts, users, settings, audit trail; the
worker; production containers; deploy and backup docs.

**Out (later slices, unchanged in the spec):** partner portal screens, invitations by a partner
admin, CSV import, label sheet, record-existing-loan, loan-extension *requests* (staff extend
directly, see D6), two-factor sign-in, lost/found screens. The database already carries the
partner wall; nothing here weakens it, and every repository still takes an actor scope.

## 2. Decisions that reconcile the screens with the database

The demo store and the schema disagree in places. The database wins; the screens adapt.

| # | Decision | Why |
|---|---|---|
| D1 | **Sign-in by username or email [CALL].** Migration 0011 adds `users.username` (citext, unique, `^[a-z0-9._-]{3,32}$`) and `users.title`. | The proposal's login shows a username; the spec keys users by email. Both work; email stays the address for mail. |
| D2 | **One number per transaction [CALL].** A request gets `BRR-<year>-<5 digits>` from `next_counter`; the loan created at release reuses it (`loans.loan_no = loan_requests.request_no`). One loan per request. | People quote one number from request to return. Both unique constraints still hold. |
| D3 | **The console's "transaction" is a server-built read model** over `loan_requests` + item + reservation + loan + loan item. Its `stage` (`pending`, `approved`, `rejected`, `cancelled`, `expired`, `released`, `returned`, `closed`) is computed in SQL, never stored. | The screens need one row per borrowing; the tables stay normalised. |
| D4 | **The console files one model, quantity 1–`booking.max_units`.** Approval assigns one unit per requested quantity (partial allowed); the detail screen lists units. The UI defaults to 1. | Keeps the spec's model without a second booking path. |
| D5 | **A reservation covers `[needed_from, needed_until + 1 + buffer_days)`.** | Half-open ranges; the buffer is the spec's turnaround time. |
| D6 | **Extension by staff is direct:** a manager sets a later due date; it inserts an approved `loan_extensions` row and widens the reservation in one transaction; the exclusion constraint decides. | The partner-request half belongs to the portal slice. |
| D7 | **"Reserved" is not a movement.** Unit history = `asset_movements`; reservations are shown as their own list on the unit. Movement names follow the database (`relocated`, not `moved`). | A reservation does not change physical status. |
| D8 | **Receiving a return** inserts movement `returned`; **starting inspection** inserts `inspection_started`; the inspection outcome inserts `restocked` / `sent_to_repair` / `retired` and marks the reservation `completed`; the loan closes when every item is returned. `reassign` = restock, with a note, reservation completed. | Mirrors the lifecycle table in migration 0010. |
| D9 | **Sending a unit to repair, retiring it, or a loan going overdue past the next reservation's start flags that unit's future reservations `needs_reassignment`** and raises an alert. No automatic substitute. | Spec section 6. |
| D10 | **Alerts are rows in `notifications`**, written by the worker from outbox events and from the daily sweeps, with a dedupe key. The bell reads the signed-in user's rows. | Spec section 8; survives restarts, read state is per user. |
| D11 | **Mail goes through an interface.** Providers: `log` (default; writes "mail queued" with no link or token to the log) and `smtp` (env `SMTP_URL`, `MAIL_FROM`). Invite and reset links are only ever inside the mail. With `log`, the first-admin command and an admin-only "copy invite link" action on a *pending* user are the two ways to get a link; the link is returned once, never stored in an idempotency row, never logged. **[CALL]** | No mail provider has been chosen (spec open item 10) and a deploy must still be usable. |
| D12 | **Development seed** (`pnpm --filter @wms/db seed:dev`) loads the demo dataset (about 480 units, the four demo users with the demo password) and refuses to run when `NODE_ENV=production`. The empty-form sign-in bypass is deleted. | Spec section 15: no default credentials in production. |
| D13 | **Condition grades are `a`–`d`**, locations are the tree (`site` → `room` → `shelf`); the screens show `room` as the zone. | Database enums. |
| D14 | **Lists are keyset-paginated (limit ≤ 100) and return `total`** from the same statement (`count(*) OVER ()`). Search, filters and sort come from an allow-list per list. CSV export is a streamed endpoint with the same filters, capped at 10 000 rows, cells neutralised. | Spec section 8; the screens show totals. Acceptable to ~50 000 rows; beyond that the count becomes an estimate. |
| D15 | **Search uses `pg_trgm` GIN indexes** on asset code, serial, model name, borrower name and company (migration 0011). | "Search assets, serial number, or borrower" must not scan. |
| D16 | **The worker is a second entry point of `apps/api`** (`src/worker/main.ts`, command `node apps/api/dist/worker/main.js`). | An app may not import another app; the worker needs the same services. |
| D17 | **The web app is served by its own small container** (`nginx-unprivileged`, static files + `/api` proxied to `api`), published on loopback. The host's web server (or Caddy) terminates TLS and forwards to it. Same origin, so no CORS and a `SameSite=Lax` cookie is enough. | One origin is simpler and safer than two. |

## 3. Speed: what makes a page feel instant

Measured, not assumed. Budgets (local production build, seeded database):

| Budget | Target |
|---|---|
| Revisit of any page already seen this session | Rendered from memory in under 100 ms, then silently refreshed |
| First visit of a page | Content within 300 ms of click on localhost; skeleton only if slower than 150 ms |
| API list endpoint, p95 | Under 50 ms server time at seed scale; statement count constant in page size |
| Repeat load of the app | JS/CSS from disk cache, zero bytes over the network |

How:
1. **Client query cache (TanStack Query).** Every read is a keyed query: `staleTime` 30 s for
   lists, 5 min for reference data (categories, locations, models, settings, permissions),
   `gcTime` 10 min, refetch on focus and reconnect. Pagination keeps the previous page on screen.
2. **Prefetch on intent.** Hovering or focusing a nav link or a table row prefetches that
   route's code chunk and its first query. A click then renders from cache.
3. **Writes invalidate precisely.** Each mutation invalidates only the keys it affects and
   writes the returned entity into the detail cache. No optimistic guesses for rule-heavy
   actions (approve, release); the button shows pending and is guarded against double fire.
4. **Route-level code splitting** with the shell and sign-in in the entry chunk.
5. **HTTP caching, correct by layer.** Hashed assets: `Cache-Control: public, max-age=31536000,
   immutable`. `index.html`: `no-cache`. API JSON: `Cache-Control: private, no-cache` plus a weak
   `ETag`, so a refetch of unchanged data is a bodiless `304`. Never `public` on API responses.
   Pre-compressed brotli and gzip for static files; gzip for JSON over 1 KB at the proxy.
6. **One request per screen where it matters.** `GET /dashboard` returns the counts, recent
   activity, alert preview and due list together. `GET /bootstrap` returns the signed-in user,
   permissions, settings and reference lists in one call at start.
7. **Server side:** every list filter and sort has an index; no N+1 (enforced by the
   query-count harness); session lookup is one indexed read and the idle expiry is only written
   when it is more than 5 minutes stale; settings are cached in process for 30 s and dropped on
   write.
8. **Not done, on purpose:** no service worker (a stale app shell is worse than a 50 ms
   revalidation), no persistent browser cache of API data (it holds contact details), no
   server-side response cache (one small Postgres is faster than the invalidation bugs).

## 4. API surface (`/api/v1`)

All mutations: session cookie, `Origin` check, `X-WMS-Request: 1` header, `Idempotency-Key`
(except the pre-login ones), permission from one table, audit row, conditional state change.

| Module | Endpoints |
|---|---|
| auth | `POST /auth/login` · `POST /auth/logout` · `GET /bootstrap` · `POST /auth/password` (change) · `POST /auth/forgot` · `POST /auth/reset` · `POST /auth/accept-invite` |
| users | `GET /users` · `POST /users` (creates invited user, queues mail) · `PATCH /users/:id` · `POST /users/:id/deactivate` · `POST /users/:id/reactivate` · `POST /users/:id/invite-link` · `GET /audit` |
| settings | `GET /settings` · `PATCH /settings` |
| catalog | `GET/POST /categories` · `GET/POST /models` (with accessories) · `GET/POST /locations` |
| units | `GET /units` · `GET /units/export.csv` · `POST /units` (register + stock) · `GET /units/:code` (facts, reservations, last 50 movements) · `GET /units/:code/movements` · `PATCH /units/:code` · `POST /units/:code/relocate` · `/repair` · `/repair-complete` · `/retire` · `GET /models/availability?from&until` |
| transactions | `GET /transactions` · `GET /transactions/export.csv` · `POST /transactions` · `GET /transactions/:no` · `POST /transactions/:no/approve` (unit codes) · `/reject` · `/cancel` · `/release` (scanned code + accessories out) · `/return` (scanned code + accessories back) · `/extend` |
| inspections | `GET /inspections/queue` (returned, under inspection, for repair) · `POST /units/:code/inspection/start` · `POST /units/:code/inspection` |
| reports | `GET /dashboard` · `GET /reports/overview` · `/tracking` · `/borrowers` · `/aging` · `/utilization` (each with `from`, `until`, filters; each with `.csv`) |
| alerts | `GET /alerts` · `POST /alerts/read` · `GET /alerts/unread-count` |

Double-fire tests (sequential and `Promise.all`) for every mutating endpoint. Query-count test
for every list endpoint at 5 and 50 rows.

## 5. Build waves

Each builder gets one folder set nobody else touches. `apps/api/src/app.ts` is the one shared
hot file: wave 1 wires every module's `register` function against stub modules, and later
builders only fill their own module folder.

**Wave 1 — foundations (3 builders in parallel)**
- **1A `packages/db`:** migration `0011_console_support.sql` (D1, D15, new settings keys,
  any grant the endpoints need, `EXPECTED_MIGRATION_COUNT` → 11), typed schema, drift and
  catalogue tests updated, `seed:dev` (D12), `admin:create` first-admin command.
- **1B `packages/contracts`:** zod schemas and types for every endpoint in section 4 — the
  frozen contract both sides build against — plus the permission table (`role` × `action`).
- **1C `apps/api` platform:** cookie session plugin, CSRF check, permission guard, idempotency
  plugin (key row in the same transaction), audit writer with a field allow-list, outbox
  enqueue, rate limiter, ETag and cache headers, keyset helper, CSV writer, mailer interface
  (D11), query-count test harness, test helpers (signed-in clients per role), module stubs and
  `app.ts` wiring, worker skeleton (outbox loop with `SKIP LOCKED` lease, heartbeat, scheduler
  with advisory locks). Uses `packages/config` for new variables (owns that folder too).

**Wave 2 — modules (4 builders in parallel, after wave 1 is green)**
- **2A** `modules/auth`, `modules/users`, `modules/settings`, `modules/audit`.
- **2B** `modules/catalog`, `modules/units`.
- **2C** `modules/transactions`, `modules/inspections` (owns reservations; exposes the
  `ReservationFlagger` that 2B calls through an interface defined in wave 1).
- **2D** `modules/reports`, `modules/alerts`, worker jobs (overdue sweep, pickup expiry,
  reassignment flagging, cleanup, notification fan-out).

**Wave 3 — web on the real API, and containers (3 builders in parallel, after wave 2 is green)**
- **3A `apps/web` core:** API client (credentials, CSRF header, idempotency key per intent,
  problem errors), query hooks per resource, real auth and bootstrap, shell, server-driven
  `DataTable`, prefetch-on-intent, route splitting; deletes the demo store, seed and bypass.
- **3B `apps/web` pages:** every page moved from `useWmsState()` to the hooks (starts when 3A's
  hooks exist; pages only).
- **3C `infra/`, `.github/`, `docs/`:** web image, compose (api, worker, migrate, postgres,
  web, backup), CI builds and pushes both images to GHCR by digest and runs the browser
  lifecycle test against the composed stack, backup and restore scripts, deploy and runbook.

**Wave 4 — coordinator:** full gate, adversarial review, speed budgets measured, browser run of
the seven-step lifecycle as each role, code map rebuilt, lessons, then deploy.

## 6. How it gets falsified

- The 149 database attack tests keep passing unchanged; migration 0011 adds its own.
- Each wave merges only when format, lint, typecheck and the whole test suite pass on the
  coordinator's own run, and the coordinator has read the diff of every security-relevant file
  (auth, session, idempotency, permission guard, every repository that takes a scope).
- Attacks to run by hand before calling it done: forged `Origin`; missing CSRF header; replayed
  idempotency key with a different body; two approvals of one unit at once; release of a unit
  not on the request; return scanned against the wrong loan; auditor attempting each mutation;
  deactivated user's cookie; filer approving their own request; approve when the buffer
  collides; SQL-ish and formula-ish input in search and CSV; session cookie flags; 1 MiB body.
- Speed budgets in section 3 are measured with the production build and printed in the report.

## 7. Deploy — gated on facts only the owner or the server can give

Nothing is run on the server until a read-only pass (`docs/DEPLOY-vps.md` section 1) has been
pasted back. Needed from the owner: the server's address and login, the domain, where
encrypted backups go, and (optional) SMTP details. The first admin is created on the server
with `admin:create`. The repository should be private before any server detail is written down.

## 8. Checklist (ticked when verified, not when written)

- [x] Plan reviewed adversarially and corrected (section 9)
- [ ] Wave 1 green · [ ] Wave 2 green · [ ] Wave 3 green
- [ ] Attack list in section 6 run, results recorded
- [ ] Speed budgets measured
- [ ] Code map, architecture notes and lessons updated
- [ ] Deployed and smoke-tested on the VPS

## 9. Corrections from the adversarial review (2026-11-15) — these override the text above

An Opus reviewer attacked sections 1 to 8 against the code as built. Two blockers and eleven
major findings were confirmed. Each correction below is binding.

**Data and rules**
- **R1 Companies.** A request must point at a `partner_orgs` row. `GET /partners?q=` suggests
  names; `POST /transactions` takes `company: { id } | { name, type }` and finds or creates by
  name (`ON CONFLICT` on `partner_orgs_name_key`) in the same transaction.
- **R2 Paging (replaces D14).** The console's tables use page numbers, so lists use
  **offset paging**: `page`, `pageSize` ≤ 100, and a `total` from a separate filtered
  `count(*)` in the same transaction. Sort keys are an allow-list of real, indexed columns.
  This departs from the spec's keyset rule for the console lists **[CALL]**, acceptable to
  roughly 50 000 rows. The two append-only feeds (`/units/:code/movements`, `/audit`) stay
  keyset with "load more".
- **R3 Stage is one SQL view.** Migration 0011 creates `transaction_overview`
  (`security_invoker`, so row-level security still applies) with the computed `stage`.
  `returned` = every loan item returned and a reservation still `released`; `closed` = every
  reservation `completed`. Every module reads stage from this view; nobody re-derives it.
- **R4 Cancel never writes `decided_by_user_id`** (the filer-cannot-decide CHECK would raise).
  Who and why go to `decision_note` and the audit row. A filer approving or rejecting their own
  request gets `409 own_request`.
- **R5 Alerts are derived at read time (replaces D10).** `GET /alerts` computes overdue,
  missing accessory, for inspection, ready for redeployment and needs reassignment in SQL, each
  with a stable key. `notifications` stores only read marks (`dedupe_key` = alert key). An
  alert disappears when its condition does. The worker still sends reminder mail and runs the
  expiry and flagging sweeps.
- **R6 Availability matches the reservation.** Availability is asked for
  `[needed_from, needed_until + buffer_days]`. `GET /transactions/:no/candidates` returns the
  assignable units for that window and the number of other pending requests wanting the same
  model; the web fetches it fresh (no stale time) when the approve dialog opens.
- **R7 Admin safety.** Nobody deactivates or demotes themselves; the last active admin cannot
  be deactivated or demoted. The check locks the active admin rows `FOR UPDATE`, with a
  concurrent test.
- **R8 Release locks the request row `FOR UPDATE`** before creating or extending the loan.
- **R9 Access links.** `POST /users/:id/access-link` (admin) returns an invite link for an
  invited user or a reset link for an active one. It locks the user row, revokes earlier
  unused tokens of that purpose, is answered `Cache-Control: no-store`, and its response is
  never written to an idempotency row or a log. `admin:create` is an `apps/api` entry point
  (`src/cli/admin-create.ts`), run with `docker compose run --rm`, printing the link once.
- **R10 Settings keys, typed and bounded on the server:** `org.company_name`,
  `org.warehouse_name`, `booking.default_days` (1–90), `booking.max_days` (1–365),
  `booking.buffer_days` (0–14), `booking.pickup_grace_days` (0–14), `booking.max_units`
  (1–50), `notify.overdue`, `notify.missing_accessory`, `notify.for_inspection`,
  `notify.ready` (booleans), `notify.overdue_reminder_days` (1–30), `session.idle_hours`
  (1–24), `auth.lock_after_failed` (3–10), `labels.size`, `labels.show_serial`. Shown
  read-only, not stored: timezone (Asia/Manila) and minimum password length (12).
- **R11 Schema additions in 0011:** `assets.notes text` (in the column grants);
  `users.username` CHECK on `username::text ~ '^[a-z][a-z0-9._-]{2,23}$'`; index
  `audit_log (occurred_at DESC)`. Accessories stay per model; a unit shows its model's list.
- **R12 Bulk actions** are single-transaction endpoints: `POST /transactions/bulk-reject` and
  `POST /units/bulk-relocate`, at most 100 ids, per-row results.
- **R13 Behaviour that changes from the demo:** repair-complete lands in `under_inspection`,
  not in stock. "Switch user" and "Reset demo data" are removed. `GET /audit?actor=me` is open
  to every role; the full audit list needs `audit.read`.

**Security and caching**
- **R14 Cache headers.** Reference data without personal details (categories, models,
  locations, settings, permission table) is `private, no-cache` with an `ETag`. Every other
  API response is `no-store`. The client's in-memory cache is what makes pages instant; it is
  cleared (`queryClient.clear()`) on sign-out and on any `401`.
- **R15 Errors that must not be 500s:** lock timeout `55P03` → `409 busy`; exclusion
  violation `23P01` → `409 unit_unavailable`; unique violation on a business key → `409`.
- **R16 CSV export** reads at most 10 000 rows, ends the transaction, then streams.
- **R17 Development seed** lives in `apps/api/src/cli/seed/`, is compiled into the image,
  refuses when `NODE_ENV=production`, connects as the migrator, and advances `counters` past
  every code it inserts. The demo password is the owner's choice for demo data **[USER]** and
  is written as a hash directly; the 12-character rule applies to every password set through
  the API.

**Who does what**
- **R18 The coordinator installs every dependency** before a wave starts; builders never run
  `pnpm add` or touch a `package.json` or the lockfile.
- **R19 Builder 1C writes the final `app.ts`,** every module's constructor signature as a stub,
  the `ReservationFlagger` interface (it takes the caller's `Tx`), the outbox topic and payload
  types, the idempotency calling pattern (`idempotent(tx, request, fn)` inside the service's
  transaction), and registers OpenAPI from the zod schemas outside production. Wave-2 builders
  fill their folders and do not edit `app.ts`.
- **R20 The dev seed is built in wave 1 by builder 1A** in `apps/api/src/cli/seed/`, using
  `hashPassword` from `apps/api/src/platform/password.ts` (1C).
- **R21 Wave 3 is ordered:** 3A adds the API client, hooks, auth and server-driven table
  *next to* the demo store; 3B moves the pages; then 3A removes the store, its tests and seed,
  rewrites `apps/web/e2e/lifecycle.mjs` for the real stack, and extends lint to `.tsx`.
- **R22 CI browser test** runs against a compose override that starts the stack and runs the
  dev seed with `NODE_ENV=development`. The api port is no longer published; only the web
  container is, and each proxy hop appends `X-Forwarded-For`.
- **R23 Test counts change:** `runner.test.ts` and the catalogue test are updated for
  migration 0011; no existing attack test is weakened.

**Deferred, said plainly:** contact anonymisation, the weekly automatic restore check and the
26-hour backup alert, stale-heartbeat and parked-outbox alerting. The backup script, a manual
restore drill and the heartbeat row itself are in scope.
