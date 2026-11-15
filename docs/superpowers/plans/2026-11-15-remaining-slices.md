# Remaining slices — plan

- **Date:** 2026-11-15
- **State when written:** slices 1 and 2 are done and on `main`. The staff console runs either on
  the in-browser demo (`VITE_BACKEND` unset) or on the API (`VITE_BACKEND=api`). On the API,
  sign-in, units, catalogue, users, partner companies, labels and the activity log are live;
  borrowing, inspection, reports, alerts and the dashboard still run on the demo store and show
  a "connects in the next release" notice (`NeedsLending`) when the API is on.
- **Source of truth for every rule below:** `docs/superpowers/specs/2026-11-13-netpoleon-wms-foundation-design.md`
  (sections 5–9 and 15). This plan orders the work; it does not change a decision.
- **How each slice ships:** on `feat/web-slice-1` (or a new `feat/*` branch), full local gate
  (`format:check`, `lint`, `typecheck`, `test` with `WMS_TEST_PG_URL` or Docker), both browser
  runs (`apps/web/e2e/lifecycle.mjs` demo, `apps/web/e2e/api-mode.mjs` connected), push, CI
  green, then fast-forward `main`. Lessons, `architecture.md` and the code map in the same push.

## Rules every new endpoint follows (already in the platform; do not re-invent)

- State changes go through `Mutations.run(scope, idempotencyOf(request), change)` with an audit
  row (`AuditWriter`) and, for email, an outbox message (`Outbox.enqueue`) in the same
  transaction. Every new mutating endpoint gets a sequential **and** a concurrent double-fire test.
- Status changes only by inserting an `asset_movements` row; the transition must exist in
  `asset_transitions` (migration 0010). Never update `assets.status` directly.
- Lists: keyset pages capped at 100, filters and sort from an allow-list, and a test that the
  query count does not grow with the rows returned. Correlated subqueries name the outer table
  literally (see `lessons.md`, 2026-11-15).
- "Today" is Asia/Manila, stated in the query.
- Partner requests run as `wms_partner` under row-level security; staff as `wms_staff`.

---

## Slice 3 — lending on the API (build order steps 6–8)

### 3a. Bookings: request, approve with assignment, reject, cancel
API module `modules/bookings`:
- [ ] `POST /api/v1/requests` — staff file for a company (contact name, email, phone copied
      onto the request), model + quantity + dates + purpose + end customer. Dates bounded by
      `booking.max_days`, quantity by `booking.max_units`, start not in the past. Request
      number from `next_counter('request:<year>')`. Pending requests hold no stock.
- [ ] `GET /api/v1/requests` (keyset, filters: status, company, model, dates) and
      `GET /api/v1/requests/:number` with items, reservations and the other pending requests
      that want the same model for overlapping dates (spec 6).
- [ ] `POST /requests/:number/approve` — assigns specific units; each assignment inserts a
      `reservations` row over the loan dates plus `booking.buffer_days`; the exclusion
      constraint decides overlaps (map its SQLSTATE to a 409 naming the unit). Partial approval
      allowed. Refuses units that are overdue, for repair, lost or retired. The filer cannot
      approve (CHECK `loan_requests_filer_cannot_decide` plus a clear 409).
- [ ] `reject` (reason required), `cancel` (reason; releases reservations).
- [ ] Email to the contact on decision through the outbox (`email.request_decided`).
- [ ] Tests: double booking refused, filer cannot approve, two managers approving at once yields
      one approval and one 409, partial approval, reservation buffer.

### 3b. Lending: release, return, extension
API module `modules/loans`:
- [ ] `POST /requests/:number/release` — per unit: scanned asset code must match the reservation,
      accessories out recorded; inserts `loans` (number from `next_counter('loan:<year>')`),
      `loan_items`, the `released` movement and marks the reservation `released`. The partial
      unique index on open loan items is the hard stop against a second release.
- [ ] `POST /loans/:number/return` — per unit: scan, accessories back; `returned` movement;
      a missing accessory is recorded on the item and raises an alert.
- [ ] Extensions: `POST /loans/:number/extensions` (requested date, reason) and
      `.../decide`; succeeds only if the longer reservation still fits (same constraint).
- [ ] "Record existing loan" for go-live: admin only, back-dated release date, `is_backdated`.
- [ ] Tests: wrong scan refused, double release has one effect, return with missing accessory,
      extension colliding with the next reservation is refused.

### 3c. Inspection and repair
- [ ] `POST /assets/:code/inspection/start` (`returned` → `under_inspection`, QA room).
- [ ] `POST /assets/:code/inspection` — grade, checklist, notes, outcome
      (`restock` | `repair` | `reassign` | `retire`) → `inspections` row and the movement; a
      restock completes the reservation, so an early return frees the unit early (spec 7).
- [ ] Repair tickets (`repair_tickets`) opened by "send to repair", closed by "repair complete".

### 3d. Worker jobs and alerts
- [ ] Daily overdue sweep (Asia/Manila): notifications with a dedupe key, email reminder on the
      `overdueReminderDays` cadence.
- [ ] Expire unreleased reservations after `booking.pickup_grace_days`; request → `expired`.
- [ ] Flag future reservations when a unit goes overdue past the next start, is sent to repair,
      lost or retired (`needs_reassignment`; already done for repair and retire in 2c).
- [ ] `GET /api/v1/notifications`, `POST /notifications/read` — the Alerts screen and the bell.

### 3e. Reports, dashboard, settings
- [ ] `GET /api/v1/reports/overview` (status counts, monthly movements from the ledger,
      utilisation = loan days / available days), `tracking`, `borrowers`, `aging`,
      `utilization`; each one grouped query over indexed columns, CSV-safe export
      (cells starting with `= + - @` neutralised).
- [ ] `GET /api/v1/dashboard` — KPI counts, due this week, recent movements.
- [ ] `GET/PATCH /api/v1/settings` for the typed settings table (loan rules, session lengths,
      label size); company name and warehouse name added as settings rows by migration.

### 3f. Web wiring
- [ ] Backend methods for everything above in `src/backend/types.ts`, `http.ts`, `demo.ts`.
- [ ] Borrow / Return, Transaction detail, Inspection, Reports, Alerts, Dashboard and the
      remaining Settings sections read through the backend; remove `NeedsLending` from
      `App.tsx`; shell badges and the alerts bell from the API.
- [ ] `PartnerLoan` / `UnitLoan` filled from the API (partner and unit pages).
- [ ] Extend `e2e/api-mode.mjs` with the full seven-step lifecycle; `dev-seed` creates loans in
      every state so the screens have data.

### 3g. Partner portal (spec 5–6)
- [ ] Partner sign-in lands on `/portal` instead of `PortalNotice`.
- [ ] `/portal` models with units free for chosen dates (`model_availability()`; counts only),
      `/portal/requests` and `/portal/requests/new`, `/portal/loans`, extension requests.
- [ ] `/portal/team`: a `partner_admin` invites colleagues into their own company only; the
      company and role ceiling come from the session, never the request body.
- [ ] Every portal query runs as `wms_partner`; add attack tests that a partner cannot see
      another company's rows through any new endpoint.

### 3h. Bulk import and custom reports
- [ ] `/units/import`: CSV upload, column mapping, every row validated and every error
      reported at once, all rows or none; size cap. Depends on the client's spreadsheet
      (open item 11).
- [ ] Custom reports = named, filterable report views with CSV export (spec call 6), saved per
      user.

---

## Slice 4 — deploy (build order step 9)

- [ ] Serve the built web app: a static stage in the image (or Caddy/Nginx serving `apps/web/dist`)
      with `/api` proxied to the API, so the app and API share one origin. `APP_ORIGIN` must be
      exactly that origin: the CSRF guard refuses any other.
- [ ] Image publishing from CI by digest, image vulnerability scan.
- [ ] Nightly encrypted `pg_dump`, off-server copy, 14 daily and 8 weekly, weekly restore drill
      and an alert when no good backup is newer than 26 hours (spec 15).
- [ ] Uptime check on `/healthz` and `/readyz`; worker heartbeat staleness and parked outbox
      rows alert an admin.
- [ ] Email provider behind the `Mailer` interface (open item 10); until then production emails
      park as `failed` by design and the first admin uses `create-admin`.
- [ ] First release to the VPS following `.claude/rules/vps-safety.md`: read-only pass first,
      fingerprint before and after, rollback written next to every step.

## Engineering items owed (not tied to a slice)

- [ ] Lint `.tsx` with React rules (ESLint matches only `.ts` today; see `lessons.md`).
- [ ] Adversarial read of every migration and `client.ts` against spec sections 7, 9 and 15
      (the one unchecked item of the scaffold plan).
- [ ] Split the web bundle (538 kB minified; Vite warns above 500 kB): lazy-load the lending
      and reports pages.
- [ ] Staff two-factor authentication (spec 9, the phase after the foundation).
- [ ] A trigram index on unit search before about 50,000 units; a shared rate-limit store if a
      second API instance is ever run.
- [ ] Retire the demo store once every screen runs on the API, or keep it deliberately as the
      sales demo: decide with the owner.

## Facts only the owner or client can supply (from spec section 14)

- Is the VPS new or shared? (read from the server before deploying)
- Where encrypted backups are stored off the server.
- Which email provider sends notifications.
- The current inventory spreadsheet and units out on loan at go-live (sets the CSV columns and
  how much back-dated entry is needed).
