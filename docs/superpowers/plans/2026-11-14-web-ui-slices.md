# Web UI — full page plan and slice order

- **Date:** 2026-11-14
- **Source of the look:** proposal PITS-NTP-2026-001, page 5 (sample system interface) and
  page 6 (transactions, reports, alerts). The proposal screens are the visual contract.
- **Change of order [USER] 2026-11-14:** the foundation spec said the frontend waits for the API.
  The project owner now wants the screens first, running on demo data with no backend, so the
  client can see and click the product early. The API plan is unchanged; the UI swaps its demo
  store for HTTP calls slice by slice.

## Decisions

| # | Decision | Reason |
|---|---|---|
| 1 | `apps/web`: Vite + React + TypeScript, plain CSS with design tokens | Vite is already pinned in the workspace; tokens keep one palette for light and dark; no CSS framework to fight the proposal look |
| 2 | Demo store in the browser (`src/data/`), saved to `localStorage`, behind one `WmsStore` class | Every screen reads and writes through one door, so replacing it with the API later touches one folder |
| 3 | Status changes only through `recordMovement` in the store | Mirrors the database rule: status and history cannot disagree, even in the demo |
| 4 | Sign in accepts the seeded demo accounts; an empty form signs in as the demo administrator | [USER] no backend needed for now. The bypass lives in `src/auth/` and is removed when the API lands |
| 5 | Palette: deep green-black sidebar, green primary, Netpoleon orange only on the brand mark, status colours carry meaning only | Matches page 5; colour as state passes the anti-flop audit |
| 6 | Imagery cropped from the proposal's own artwork (`public/img/`) | Temporary placeholders that already match the pitch; replace with client photography |
| 7 | The person who files a request cannot approve it | Foundation spec section 5 |

## Every page (all slices)

Legend: **S1** built in slice 1 · S2, S3 later.

### Public
| Route | Page | Slice |
|---|---|---|
| `/login` | Sign in: username, password, show/hide, remember me, forgot password, demo bypass | **S1** |
| `/forgot-password` | Request a reset link (demo: confirmation only) | **S1** |
| `/reset-password/:token` | Set a new password | S2 |
| `/accept-invite/:token` | Invited user sets a password | S2 |

### Staff console
| Route | Page | Sub-pages, tabs, dialogs | Slice |
|---|---|---|---|
| `/` | Dashboard | KPI row, status donut, recent activity, alerts strip, due this week, quick actions | **S1** |
| `/units` | Demo units | Search, status/category/location filters, table to cards on phones, pagination, Add unit dialog, CSV export | **S1** |
| `/units/:code` | Unit detail | Facts, QR label, accessories, movement history, Edit, Move shelf, Send to repair, Retire | **S1** |
| `/units/labels` | Label sheet for printing | Select units, print layout | S2 |
| `/units/import` | Bulk import from spreadsheet | Upload, column mapping, error report | S3 |
| `/borrow` | Borrow / Return | Tabs: Requests, On demo, Returned, All; New request dialog | **S1** |
| `/borrow/:number` | Transaction detail | Borrower, unit, dates, step timeline; Approve, Reject, Release (scan + accessory check), Receive return (scan + accessories back), Extend, Cancel | **S1** |
| `/inspection` | Inspection | Tabs: Awaiting inspection, Under inspection, For repair; Inspect dialog (grade, checklist, notes, outcome: restock / repair / reassign); Repair complete | **S1** |
| `/reports` | Reports | Tabs: Overview (key figures, movement bars, status donut), Tracking record, Borrower history, Aging and condition, Utilization; date range; CSV export | **S1** |
| `/reports/custom` | Custom report builder | Columns, filters, saved reports | S3 |
| `/alerts` | Alerts and notifications | Overdue, missing accessory, for inspection, ready for redeployment; mark read | **S1** |
| `/users` | Users | Tabs: Users (add, edit, deactivate), Roles and permissions matrix, Activity log | **S1** |
| `/partners` | Partner companies | List, detail, contacts, loan history, archive | S2 |
| `/settings` | Settings | Sections: General, Categories, Locations, Loan rules, Notifications, Labels, Security, Backup and data (reset demo data) | **S1** |
| `/profile` | My profile | Details, change password, theme | **S1** |
| `/help` | Help centre | Guides per workflow step | S2 |
| `*` | Not found | Back to dashboard | **S1** |

### Partner portal (S3)
`/portal` browse models and availability · `/portal/requests` my requests · `/portal/requests/new`
· `/portal/loans` what my company holds · `/portal/team` invite colleagues.

## Slices

- **Slice 1 (this change):** the staff console above, on demo data. The seven-step lifecycle is
  clickable end to end: register, stock, request, approve, release, return, inspect, restock or
  repair, and every step appears in reports and the audit trail.
- **Slice 2:** wire sign-in, units and users to the API; password reset and invite pages; label
  printing; partner companies; help centre.
- **Slice 3:** wire borrowing, inspection, reports; partner portal; bulk import; custom reports.

## Slice 1 checklist

- [x] Plan and page inventory (this file)
- [x] App shell: sidebar, header search, alerts bell, person menu, breadcrumb, phone drawer and tab bar, light and dark
- [x] Sign in with demo accounts and the empty-form bypass
- [x] Dashboard, Demo units, Unit detail, Borrow / Return, Transaction detail, Inspection, Reports, Alerts, Users, Settings, Profile, Not found
- [x] Loaders, page transitions, micro-interactions, reduced-motion support
- [x] Store unit tests for the lifecycle and its guards
- [x] Browser end-to-end run of the full lifecycle (`apps/web/e2e/lifecycle.mjs`)
- [x] Every table on one `DataTable`: search, filters, sort, row selection, batch actions, CSV export
- [x] Tab strips with a travelling spring highlight

## Slice 2 checklist

Delivered in four pushes, each green in CI before it reaches `main`.

- [x] **2a, screens on demo data:** password reset and accept-invite pages (single-use links,
  only the token hash stored, demo mailbox in place of email), invitations from Users, real
  password change on Profile, partner companies list and detail (contacts, loan history,
  archive), label sheet with QR code and Code 128 barcode, help centre
- [x] **2b, API platform and auth:** audit writer, idempotency keys, outbox and worker,
  permission table, login, sessions, logout, invitation, password reset, rate limits
- [ ] **2c, API stock and people:** users, partner companies, categories, locations, assets
  (register, edit, move, repair, retire), development seed
- [ ] **2d, wiring:** the web app uses the API when `VITE_API_URL` is set; demo mode stays the
  default

## Demo accounts (demo data only, no real system behind them)

| Username | Role |
|---|---|
| `lara` | Administrator |
| `tina` | Manager |
| `marco` | Warehouse |
| `audit` | Auditor (read only) |

All four share the demo password written in `apps/web/src/data/seed.ts`. An empty sign-in form
enters as the administrator.
