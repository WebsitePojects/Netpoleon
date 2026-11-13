# Netpoleon WMS — Foundation Design

- **Date:** 2026-11-13
- **Status:** Approved by the project owner 2026-11-13. Section 15 was added after approval by
  the architect's own adversarial review; it tightens the design and changes no decision above.
- **Source:** proposal PITS-NTP-2026-001 (summarised in `.claude/rules/domain.md`)
- **Decision markers:** **[USER]** = decided by the project owner. **[CALL]** = decided by the
  architect; open to correction, not something the owner agreed to.

## 1. Intent

Netpoleon lends about 480 demo units (firewalls, switches, routers, access points, servers,
laptops, storage) to partners and resellers. Today nobody can say with confidence where a unit
is, who has it, when it is due back, or what condition it came back in. This system makes every
unit accountable from registration to redeployment.

Prince IT Solutions OPC builds it, owns the code, hosts it, and charges a monthly subscription.
The subscription promises backups and security updates, so operations are part of the product.

## 2. Goals, non-goals, anti-goals

**Goals**
- One record per physical unit, with its complete movement history.
- Partners and resellers log in to a portal and book demo units themselves. **[USER]**
- Staff approve, release by scan, receive by scan, inspect, and restock or route to repair.
- The same unit can never be promised to two borrowers for overlapping dates.
- A full audit trail that cannot be edited, including by an administrator using the app.
- Overdue, missing-accessory, for-inspection and ready-for-redeployment alerts.
- Runs on one Hostinger VPS, deployable and restorable from written steps.

**Non-goals (this foundation)**
- The web frontend. The API is built first; screens come after, against a stable contract.
- Billing for the subscription, custom integrations, a mobile app, multi-language.
- A drag-and-drop report builder. The proposal promises "custom reports for management";
  **[CALL]** the foundation meets that with the named reports, each filterable by date range,
  company, category, model and status, and each exportable to CSV. Anything beyond that is a
  later phase and should be said to the client in those words.

**Anti-goals — it has failed if any of these is true, even if it "works"**
- A partner can see another partner's bookings, loans or contacts.
- Two approvals of the same unit both succeed.
- A unit's current status disagrees with its movement history.
- A secret, token or password reaches git, a log line or an API response.
- A slow connection and three clicks produce three bookings.

## 3. Constraints

- Hostinger VPS, possibly shared with other production apps. `.claude/rules/vps-safety.md`
  applies: nothing is assumed about ports, Nginx or free memory until read from the server.
- Standing rules in `.claude/rules/idempotency-concurrency.md` and
  `.claude/rules/engineering-standards.md` are requirements, not preferences.
- No env file of any name is tracked in git.
- The proposal promises client data is not shared with third parties. The boundary is drawn
  like this **[CALL]**:
  - Identity and the live database stay on the VPS. No hosted auth or database service.
  - Backups leave the server only after being encrypted with a key Prince IT holds, so whoever
    stores them holds ciphertext they cannot read.
  - The image registry (GitHub Container Registry, private) holds code only, never data.
  - Emails are sent through a provider, so they carry the minimum: a greeting, the request or
    loan number, and a link to log in. No serial numbers, no end-customer names, no lists.

## 4. Approaches considered

**A. Modular monolith: TypeScript, Fastify, Drizzle, PostgreSQL, Docker Compose — chosen [CALL]**
One API process and one worker process from the same image, one Postgres. Drizzle keeps every
query visible as SQL, which is what makes "no N+1" checkable, and it does not get in the way of
the Postgres features this design leans on (exclusion constraints, partial unique indexes,
row-level security). Small memory footprint, which matters on a shared VPS.
Trade-off: less scaffolding is handed to us; we write the module structure ourselves.

**B. NestJS with Prisma**
More structure out of the box and familiar to many developers. Rejected because Prisma hides
the SQL (N+1 is easy to write and hard to see), and the three Postgres features above all need
raw SQL escapes anyway, so we would carry an ORM and still work around it. Heavier at runtime.

**C. Supabase (hosted Postgres, auth and row-level security)**
Fastest to a demo. Rejected because client data and identities would sit with a third party,
against the proposal's confidentiality promise, and because the owner specified a Hostinger VPS.
Business rules would also live in database policies and edge functions, which are harder to test.

The project owner delegated the how ("you decide"), so A proceeds as the architect's pick.

## 5. Who uses it

Two audiences in one user table, separated by a `kind` column and never mixed.

| Kind | Role | Can do |
|---|---|---|
| staff | `admin` | Everything, plus users, partner companies, settings |
| staff | `manager` | Approve or reject bookings, extend loans, all reports |
| staff | `warehouse` | Register, stock, release, receive, inspect, restock |
| staff | `auditor` | Read everything, change nothing |
| partner | `partner_admin` | Book, see the company's bookings and loans, invite colleagues |
| partner | `partner_member` | Book, see the company's bookings and loans |

**[CALL]** Internal teams and branches from the proposal are modelled as partner companies of
type `internal_team` or `branch`. They book through the same flow, so there is one booking path
to secure and test instead of two.

**[CALL]** Staff can file a request on behalf of any company — a partner who phones in, or a
Netpoleon team. The request records the staff member who filed it and a named contact person
(name, email, phone) at the borrowing company. This is how a Netpoleon employee borrows for an
internal team without needing a second account, and it keeps one email address to one user.
A person who files a request can never be the one who approves it.

**[CALL]** There is no public sign-up. An admin creates the partner company and invites its
first `partner_admin` by email; that person invites colleagues. An internet-facing sign-up form
for a system that lends hardware worth millions is an attack surface with no upside, since
Netpoleon already knows who its partners are.

**[CALL]** Single tenant: one deployment serves Netpoleon only. If Prince IT sells the system to
a second client, that client gets its own stack and database. Isolation by infrastructure is
simpler to reason about and to prove than a tenant column on every table.

## 6. How booking works

**[CALL]** Partners book a *model* for a *date range*, not a specific unit. Staff choose the
physical unit when they approve.

Reason: a partner wants "a FortiGate 60F from the 12th to the 26th", and does not care which of
six. Letting staff pick the unit lets them rotate stock, avoid one that is due for repair, and
substitute when a return is late.

1. **Browse.** The portal lists models with how many units are free for the chosen dates.
   Partners never see serial numbers, shelf locations or other partners.
2. **Request.** Partner submits model, quantity, dates, purpose and the end-customer name.
3. **Approve.** A manager approves and assigns specific units. Each assignment creates a
   reservation for that unit and date range. The database rejects an overlapping reservation.
4. **Release.** Warehouse scans each unit out, ticks the accessory checklist, and the loan starts.
5. **Return.** Warehouse scans each unit in and ticks the accessories that came back.
6. **Inspect.** Result is one of: restock, repair, reassign, retire.
7. **Restock.** Unit gets a shelf location and becomes bookable again.

**[CALL]** A reservation covers the loan dates plus a turnaround buffer (default 2 calendar
days, a setting) so a unit is not promised to the next borrower before it has been inspected.
Calendar days, not working days, so no holiday calendar has to be built and maintained.

**[CALL]** Loan extension is a request by the partner and a decision by a manager. It succeeds
only if the longer range does not collide with the next reservation — the same database
constraint decides.

### The cases the happy path hides — all **[CALL]**

- **Pending requests do not hold stock.** Only an approval reserves a unit. The portal says
  "subject to approval", and the manager's screen shows how many other pending requests want
  the same model for overlapping dates. First approved wins. Holding stock for every unreviewed
  request would let one careless or hostile partner lock up the catalogue.
- **Partial approval is allowed.** A manager may assign fewer units than requested. Each request
  line stores the quantity asked for and the units actually assigned. The request becomes
  `fulfilled` when every assigned unit has been released.
- **A unit that is not physically usable cannot be assigned.** Date ranges alone are not enough:
  a unit still out past its due date has no reservation covering today. The assignment check
  therefore requires both no overlapping reservation *and* a physical state that will be ready —
  not overdue, not `for_repair`, `lost` or `retired`.
- **When a unit becomes unusable, its future reservations are flagged, never silently moved.**
  If a unit goes overdue past the start of its next reservation, or is sent to repair, lost or
  retired, every future reservation on it is marked `needs_reassignment` and managers are
  alerted. A manager assigns a substitute or cancels with a reason. The system does not pick a
  substitute itself: which partner gets disappointed is a business decision.
- **A reservation nobody collects expires.** If the unit is not released within a grace period
  after the start date (default 3 calendar days, a setting), the reservation is cancelled, the
  request becomes `expired`, and the partner is notified. The unit is bookable again.

### Scanning and labels — **[CALL]**

The scanner reads the system's own asset code, printed as a QR code and barcode on a label the
system generates. An asset code identifies exactly one unit. Manufacturer serial numbers are
searchable but are not the scan key, because two models can share a serial.

### Loading what already exists — **[CALL]**

Nobody will type 480 units by hand. The stock step includes a CSV import of assets that
validates every row, reports all errors at once, and imports all rows or none. Units already
out on loan at go-live are entered by an admin through a "record existing loan" action that
accepts a past release date and is marked in the audit trail as a back-dated entry.

## 7. Data model

PostgreSQL. Conventions for every table:

- Primary keys are UUIDv7: time-ordered, so indexes stay compact, and not guessable, which
  matters for an internet-facing portal. Human-readable numbers are separate columns.
- `timestamptz` everywhere, stored in UTC. Due dates are `date`, interpreted in Asia/Manila.
- Every foreign key has an index. Every column used to filter, sort or join has an index.
- Enumerations are Postgres enum types or `CHECK` constraints. An unknown value cannot be stored.
- Nothing with history is deleted. Assets are retired, users deactivated, companies archived.
- Migrations are plain SQL files, reviewed, applied forward only, and written as
  expand-then-contract so the previous app version keeps working during a deploy.

### Tables

**Identity**
- `partner_orgs` — name, type (`partner`, `reseller`, `internal_team`, `branch`), status.
- `users` — email (case-insensitive unique), full name, phone, password hash, kind, role,
  `partner_org_id`, status, failed-login counter, lock-until. A `CHECK` enforces that partner
  roles have a company and staff roles do not.
- `sessions` — SHA-256 of the session token, user, idle expiry, absolute expiry, revoked-at,
  IP, user agent.
- `auth_tokens` — hashed single-use tokens for invitation and password reset, with expiry.

**Catalogue and stock**
- `categories` — name and the code used in asset codes (`SW`, `FW`, `AP`, `SRV`, …).
- `product_models` — brand, model name, category, whether partners may book it.
- `model_accessories` — the accessories a model ships with (power adapter, rack ears, …).
- `locations` — a tree: site, room, shelf. Kind and a scannable code.
- `assets` — asset code (unique), serial number (unique per model), model, status, condition
  grade, current location, ownership (`owned` or `vendor_consigned`, plus the vendor's name),
  retired-at.

**Booking and lending**
- `loan_requests` — request number, company, who filed it, contact person (name, email, phone),
  dates, purpose, end customer, status (`submitted`, `approved`, `rejected`, `cancelled`,
  `expired`, `fulfilled`), who decided and when.
- `loan_request_items` — model, quantity requested, quantity assigned.
- `reservations` — asset, request, date range, status (`active`, `needs_reassignment`,
  `released`, `completed`, `cancelled`, `expired`). Carries the no-overlap constraint. A
  reservation becomes `completed` when its unit passes inspection, which is the moment the unit
  stops being occupied — so an early return frees the unit early.
- `loans` — loan number (`BRR-2026-00124`), request, company, contact person copied from the
  request at release (so later edits to a user do not rewrite who borrowed), released by,
  released at, due date, closed at.
- `loan_items` — one row per unit on a loan: released-at, returned-at, accessories out,
  accessories back.
- `loan_extensions` — requested due date, reason, decision.

**Inspection and repair**
- `inspections` — loan item, asset, inspector, condition grade, checklist, notes, outcome.
- `repair_tickets` — asset, problem, opened, closed, resolution.

**Accountability**
- `asset_movements` — the ledger. One row per state change: type, from and to status, from and
  to location, actor, related loan, time. Append-only.
- `audit_log` — every mutating request: actor, action, target, changed fields, IP, request id.
  Append-only. Because it can never be scrubbed, what goes in is an allow-list per entity:
  field names always, values only for non-sensitive fields. Password hashes, tokens and
  contact details are never written to it.
- `notifications` — in-app alerts per user, with a dedupe key.

**Plumbing**
- `idempotency_keys` — key, user, route, request hash, stored response.
- `outbox` — queued side effects: topic, payload, status, attempts, next attempt, lease.
- `counters` — per-prefix running numbers for asset codes and loan numbers.
- `settings` — typed key/value for buffer days, default loan length, overdue reminder cadence.

### Asset status is physical, "reserved" is derived

`in_stock`, `on_demo`, `returned`, `under_inspection`, `for_repair`, `retired`, `lost`.

There is deliberately no `reserved` status. A unit can be on the shelf today and reserved for
next week; a single status column cannot express that. Whether a unit is free is a question
about a date range, answered from `reservations`. The dashboard's "Available" figure is units
`in_stock` with no reservation covering today.

Asset codes follow `NTP-<category code>-<5 digits>`, for example `NTP-SW-00124`. **[CALL]** The
proposal shows two formats; this one carries the client prefix on the printed label.

### Guarantees the database enforces, so application bugs cannot break them

| Rule | Mechanism |
|---|---|
| No double booking | `EXCLUDE USING gist (asset_id WITH =, period WITH &&)` on `reservations`, limited to rows whose status still occupies the unit (`active`, `needs_reassignment`, `released`) |
| A unit is on one open loan at most | Partial unique index on `loan_items (asset_id) WHERE returned_at IS NULL` |
| Status and history never disagree | The app roles have no `UPDATE` privilege on `assets.status` or `assets.current_location_id`. The only way to change them is to insert a row into `asset_movements`; a trigger on that insert checks the row's "from" status matches the asset's current status, raises an error if not, and applies the change. A status with no movement row is not expressible |
| History cannot be rewritten | The app roles have no `UPDATE`, `DELETE` or `TRUNCATE` on `asset_movements` and `audit_log`; a trigger rejects all three as a second lock |
| A partner sees only its company | Partner requests run under their own database role with row-level security. See below |
| Duplicate numbers are impossible | Unique constraints on asset code, serial per model, loan number, request number |

The asset lifecycle is one table, `asset_transitions`, listing every allowed (movement type,
from status, to status). `asset_movements` has a foreign key to it, so a transition that is not
listed cannot be inserted — by the app, by a script, or by hand. That table is the single place
a future developer reads to learn what may follow what, and changing the lifecycle is a
reviewed migration, not an edit buried in a service.

### How the partner wall actually holds

Row-level security is only a real backstop if a partner's request physically cannot run as a
role that sees everything. So there are two application roles and two connection pools:

- `wms_partner` — used for every request from a partner session. Row-level security is forced
  on every table a partner can reach. The policies read the company id from a setting applied
  with `SET LOCAL` at the start of the transaction. **If the setting is absent, the policies
  match nothing**, so a forgotten scope returns zero rows instead of everyone's rows.
- `wms_staff` — used for staff sessions, the worker, and the pre-login lookups in the auth
  module (find user by email, find session by token).

The pool is chosen in one place, from the session kind, and all database access goes through
one transaction wrapper, so there is no query that runs outside a scoped transaction.

One deliberate hole: the "units free for these dates" figure has to count every company's
reservations. Partners get it from a single database function that runs with elevated rights
and returns only a count per model — never a row, a company or a date from someone else's
booking.

## 8. API and logic layers

Three layers, each with one job. A layer never reaches past the one below it.

- **Routes** — parse and validate input with zod, check the session, check permission, call one
  service function, shape the response. No business rules, no SQL.
- **Services** — the business rules and the transaction boundary. One service call is one
  transaction.
- **Repositories** — SQL only. Every repository function takes an *actor scope* argument, so a
  query cannot be written without stating whose data it may return.

Request and response schemas live in a shared package, so the future frontend and the API
cannot drift apart. The OpenAPI document is generated from those schemas.

**Rules that hold for every endpoint**
- Versioned under `/api/v1`. Errors use one envelope (RFC 9457 problem details) with a stable
  machine code and never a stack trace or SQL fragment.
- Lists are paginated by keyset, capped at 100 rows, and filtered and sorted only on indexed
  columns from an allow-list.
- **No N+1.** List endpoints fetch related rows with a join or one batched `IN` query. The
  integration test harness counts the SQL statements each request issues and fails when a list
  endpoint's count grows with the number of rows returned.
- Every mutating endpoint behind a login requires an `Idempotency-Key` header. A replay with the
  same key and body returns the stored response; the same key with a different body is rejected.
- The pre-login endpoints (login, accept invitation, reset password) are the exception, because
  there is no user to key on and a stored login response would contain a session token. They
  are duplicate-safe by a different route: a token is consumed by a conditional update that
  succeeds once, and a repeated login only creates a second revocable session, under rate limit.
- Every state-changing action is also a conditional update, so two managers approving at once
  yields one approval and one clear conflict response.
- Every new mutating endpoint ships with a double-fire test, sequential and concurrent.
- Quantities, dates, availability, roles and company scope are computed on the server. Nothing
  of that kind is trusted from the client.

**Side effects** (invitation, reset, approval and overdue emails, notifications) are written to
`outbox` in the same transaction as the change that caused them. The worker claims rows with
`FOR UPDATE SKIP LOCKED` under a lease, retries with backoff up to a limit, and then parks the
row as failed where an admin can see it. Nothing is sent from inside a request.

**Scheduled work** runs in the worker: the daily overdue sweep, expiry of unreleased
reservations, flagging reservations on units that became unusable, session and idempotency-key
cleanup. Each job runs in one transaction and takes a transaction-level advisory lock inside it,
so the lock cannot outlive the job or leak onto another pooled connection, and a second worker
cannot run it twice. Each alert has a dedupe key so a re-run sends nothing new.

**Reports** are SQL aggregates over indexed columns: status counts in one grouped query, the
monthly movement report grouped from the ledger, utilisation from loan days over available days.
At the promised scale these are milliseconds. Materialised views are the next step if volume
grows a hundredfold, and the report functions are isolated so that swap touches one module.

## 9. Security

- **Passwords:** argon2id. Minimum length 12, checked against a list of common passwords.
- **Sessions:** a random opaque token in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie. Only
  its hash is stored. Sessions are revocable, and a password change revokes all of them.
  Chosen over JWT because a booking system must be able to log someone out immediately.
  **[CALL]** A session ends after 12 hours idle. "Remember me" raises the limit to 7 days for
  staff and 30 days for partners, and no session outlives that limit however active it is.
- **CSRF:** `SameSite` cookie, an `Origin` check, and a required custom header on mutations.
- **Login hardening:** rate limit per IP and per account, temporary account lock after repeated
  failures, the same error message and timing whether or not the email exists.
- **Tokens** for invitation and reset are random, stored hashed, single-use, short-lived, and
  compared in constant time.
- **Authorisation** is checked on the server for every route from one permission table. An
  unlisted role-and-action pair is denied. Row-level security is the backstop if a route check
  is ever missed.
- **Three database roles:** a migrator that owns the schema and runs only during deploys, and
  the two app roles from section 7, neither of which can alter tables or touch history.
- **Headers:** HSTS, a strict content security policy, no sniffing, no framing. CORS allows the
  application's own origin only.
- **Logs** are structured JSON with a redaction list (password, token, cookie, authorisation
  header, email body). Every request carries an id that also appears in the audit log.
- **Uploads** (condition photos, a later phase) will be type-checked by content, size-capped,
  renamed, and stored outside the web root.
- **Supply chain:** lockfile committed, dependency audit and a secret scanner in CI, and a
  secret-scanning pre-commit hook so a credential is stopped before it is ever committed.

**[CALL]** Two-factor authentication for staff is planned for the phase after the foundation.
The session and user tables are shaped so adding it needs no rewrite.

## 10. Infrastructure

**[CALL]** Docker Compose on the VPS. One compose project, images built elsewhere.

| Service | Purpose | Exposure |
|---|---|---|
| `api` | HTTP API | Bound to `127.0.0.1` on one port, never to the public interface |
| `worker` | Outbox and scheduled jobs. Same image as `api`, different command | None |
| `migrate` | Applies migrations, then exits. Runs before `api` starts | None |
| `postgres` | Database, on an internal network with a named volume | None. No published port |
| `backup` | Nightly `pg_dump`, encrypted, copied off the server, old copies pruned | None |
| `proxy` | Caddy with automatic TLS — only if the server has no web server already | 80 and 443 |

- **Why containers:** the VPS may host other apps. Containers keep this system's Node and
  Postgres versions, ports and files from colliding with theirs, and make the deploy identical
  on a laptop and on the server.
- **Why Postgres in a container on the same box:** one VPS is the budget. The risk that buys is
  covered by off-server encrypted backups and a written, rehearsed restore.
- **Images are built in GitHub Actions and pulled by the server.** Nothing is compiled on the
  VPS, because a build can exhaust memory other apps are using.
- **Reverse proxy:** if the server already runs Nginx for other sites, this system gets one new
  server block there and the `proxy` service stays off. This is decided from the server's own
  output, never assumed.
- **Hardening:** containers run as a non-root user with a read-only filesystem, dropped
  capabilities, memory limits, health checks and capped log size.
- **Secrets** live in one env file on the server, readable by its owner only, and are never in
  the image or the repository. Variable names are documented in prose in `docs/DEPLOY-vps.md`.
- **Backups:** nightly, encrypted before leaving the server, kept 14 daily and 8 weekly
  **[CALL]**, with a restore drill documented and run before go-live.
- **CI on every push:** lint, type-check, tests against a real Postgres, secret scan, dependency
  audit, image build and image vulnerability scan.

## 11. Repository layout

```
apps/
  api/            Fastify app: routes, services, repositories, one folder per module
  worker/         Outbox dispatcher and scheduled jobs (shares code with api)
  web/            Placeholder until the frontend phase
packages/
  contracts/      zod schemas and types shared by api and web
  db/             Drizzle schema, SQL migrations, seed, database roles
  config/         Typed, validated environment loading; fails at start if a variable is missing
infra/
  docker/         Dockerfile, compose files, Caddy config
  scripts/        Backup, restore, deploy
docs/
  DEPLOY-vps.md   Deploy steps and environment variable names
  RUNBOOK.md      Restore, rotate a secret, unlock a user
  superpowers/specs/
.github/workflows/
```

API modules: `auth`, `users`, `partners`, `catalog`, `locations`, `assets`, `bookings`, `loans`,
`inspections`, `reports`, `notifications`, `audit`.

## 12. Build order

Each step ends with running tests, and each is useful on its own.

1. **Skeleton** — workspace, tooling, config loader, compose with Postgres, CI, secret scanning.
2. **Database** — full schema, constraints, roles, row-level security, seed, and tests that
   attack each guarantee in section 7 directly.
3. **Platform** — error envelope, validation, idempotency layer, outbox and worker, audit log,
   query-count test harness.
4. **Auth** — login, sessions, invitation, reset, rate limiting, permission table.
5. **Stock** — categories, models, locations, assets, registration, stocking, scan lookup,
   CSV import, label generation.
6. **Booking** — availability, request, approve with assignment, reject, cancel.
7. **Lending** — release, return, inspection, restock, repair, extension, overdue sweep.
8. **Reports and alerts** — dashboard counts, movement report, borrower history, notifications.
9. **Deploy** — production compose, backup and restore, deploy guide, first release to the VPS.

The frontend is a separate design once step 6 exists to build against.

## 13. Left to the builder

- Exact library versions, pinned at the current stable releases when the scaffold is created.
- Folder structure inside each module, provided the three layers stay separate.
- Index definitions beyond the ones the rules above require, justified by a query.
- Wording of error codes and messages.
- Email delivery provider. The outbox sends through an interface; the foundation ships a
  provider that writes to the log, and a real one is chosen before go-live.

## 14. Open items for the project owner

None block the scaffold.

**Calls made for you — the build uses these unless corrected**
1. Booking by model with staff assigning the unit, rather than partners choosing a specific
   unit (section 6).
2. Invitation only, no public sign-up (section 5).
3. One deployment per client, not multi-tenant (section 5).
4. Pending requests do not hold stock; partial approval allowed (section 6).
5. Staff can file a request on behalf of a company; filer cannot approve (section 5).
6. "Custom reports" means filterable named reports with CSV export, not a builder (section 2).

7. Nightly backups, so up to 24 hours of data can be lost in a disaster (section 15).

**Facts only you or the client can supply — needed before go-live, not before the build**
8. Is the VPS new, or does it already host other apps? Read from the server before deploy.
9. Where encrypted backups are stored off the server. No default; the backup step is built
   against an interface and stays local-only until this is answered.
10. Which email provider sends notifications. Until answered, emails are written to the log.
11. Does Netpoleon have its current inventory in a spreadsheet, and are units out on loan
    today? This sets the columns of the CSV import and how much back-dated entry is needed.

## 15. Hardening — how it fails, and what stops it

Written by attacking the design above. Each line is a way this system would have broken in
production, and the mechanism that prevents it. All are **[CALL]**.

### Accounts and access
- **No default credentials exist anywhere.** Seed data is reference data only (categories,
  the lifecycle table, settings). The first admin is created on the server by a one-time
  command that sends an invitation; it refuses to run if an admin already exists. A separate
  development seed creates test users and refuses to run when the environment is production.
- **Turning someone off takes effect now.** Deactivating a user, or archiving a partner
  company, revokes every session it owns in the same transaction.
- **A partner admin can only invite into their own company, and only partner roles.** The
  company and the role ceiling come from the inviter's session, never from the request body.
- **The real client address is known.** The API trusts forwarding headers only from the local
  proxy; otherwise rate limits could be dodged, or one user could lock everyone out, by forging
  a header. Request bodies are size-capped.
- **Functions that run with elevated rights pin their `search_path`**, so a caller cannot
  substitute their own objects for the ones the function expects.
- **The partner database role is granted only what the portal shows.** It has no access at all
  to the audit log, other users, shelf locations or settings. Row-level security filters rows;
  grants remove whole tables and columns.

### Duplicates and races
- **Two identical requests arriving together produce one effect.** The idempotency key row is
  inserted inside the same transaction as the change. The second request waits on the unique
  index until the first commits, then replays its stored response. A crash rolls back both the
  key and the change, so there is never a key without its effect. Keys expire after 24 hours
  and stored responses never contain a secret.
- **A unit still out cannot be released again**, whatever the calendar says. The partial unique
  index on open loan items is the hard stop behind the assignment check in section 6.
- **Running numbers have no gaps and no duplicates.** They come from a locked counter row
  inside the transaction; a rollback returns the number.
- **Email is delivered at least once, so handlers are written to be safe to repeat.** The outbox
  row's id is passed to the provider as its idempotency key. A worker that dies mid-job leaves
  an expired lease, and the row is picked up again.

### Time
- **"Today" is always Asia/Manila, stated explicitly in the query.** Containers run in UTC; an
  overdue sweep that used the server's date would be wrong for eight hours of every day.
- **Bookings are bounded.** Start date not in the past, length and quantity capped by settings
  (default 30 days, 10 units), so one request cannot reserve the warehouse for a year.

### The database under load or misuse
- **A runaway query cannot freeze the system.** The app roles have a statement timeout, a lock
  timeout and an idle-in-transaction timeout. Pool sizes are fixed and add up to well under
  the server's connection limit.
- **Database features an ORM cannot describe are tested for by name.** The exclusion
  constraint, triggers, grants and policies live in hand-written SQL migrations. A test asks
  the database catalogue whether each one exists, and a second set of tests attacks each one
  using the real app roles — so a migration that silently drops a guarantee fails CI.
- **Exports cannot attack the person opening them.** CSV cells beginning with `=`, `+`, `-` or
  `@` are neutralised, since a partner-entered "purpose" would otherwise run as a formula in a
  manager's spreadsheet. Imports are size-capped and all-or-nothing.

### Operations — the subscription promises this
- **Recovery targets are stated, not implied.** Nightly backup means at most 24 hours of data
  lost, and a target of 2 hours to restore service on a fresh server. If the client needs
  better, continuous log archiving is the next step and is a cost conversation.
- **A backup that has never been restored is not a backup.** A weekly job restores the latest
  backup into a throwaway database and checks row counts. Prince IT is alerted if no good
  backup exists from the last 26 hours.
- **Someone is told when it breaks.** A health endpoint (process up) and a readiness endpoint
  (database reachable, migrations current) feed an external uptime check. The worker records a
  heartbeat; a stale heartbeat, parked outbox rows, or low disk space raises an alert.
- **Deploys can be undone.** Images are referenced by digest. Rolling back is starting the
  previous digest, which works because migrations never break the previous version. A deploy
  causes a restart of a few seconds; that is accepted and scheduled outside business hours.
- **Shutdown is clean.** On stop, the API finishes in-flight requests and the worker finishes
  or releases its current job before exiting.
- **Published ports are loopback-only because Docker bypasses the host firewall.** A port
  published on all interfaces is open to the internet even when the firewall says otherwise.

### Personal data
Contact names, emails and phone numbers are personal data under the Philippine Data Privacy
Act. They are collected only for accountability of borrowed equipment, are never in logs or the
audit log, and a contact can be anonymised on request while the movement history — which
refers to the user's id, not to a copy of their details — stays intact.

### Known limits, stated honestly
- One server. If the VPS is down, the system is down until it is restored.
- The "unit not physically ready" check at assignment is application logic, backed by the hard
  stop at release. A unit can therefore be promised and then flagged, but never double-released.
- Rate limiting is per process. That is correct for one API instance and must move to shared
  storage before a second instance is ever added.
