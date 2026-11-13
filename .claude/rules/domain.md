# Domain — what the client was promised

> Auto-loaded. Source: proposal PITS-NTP-2026-001 (Oct 2026), Prince IT Solutions OPC →
> Netpoleon Solutions Philippines, Inc. (NSPH INC.). This file records what the proposal
> COMMITS us to. Design decisions made on top of it live in `docs/superpowers/specs/`.

## The product
"Netpoleon WMS" — ICT Equipment Warehouse & Demo Asset Management System. Netpoleon is a
value-added ICT distributor; it lends demo units (firewalls, switches, routers, access points,
servers, laptops, storage) to partners and resellers for product demos, trainings, proofs of
concept and customer evaluations. The system tracks every unit from registration to
redeployment. Scale in the mockups: ~480 units.

Commercial model: monthly subscription. Source code and IP stay with Prince IT Solutions OPC;
Netpoleon gets a non-exclusive right to use it; Netpoleon owns its data.

## The 7-step lifecycle (proposal section 3)
1. **Registration** — encode serial number, model, QR/barcode, shelf location.
2. **Stocking** — assign the unit to a shelf / stock-room location.
3. **Borrowing request** — a partner, reseller, internal team or branch requests a unit.
4. **Release** — approved unit is scanned out; transaction details recorded.
5. **Return & inspection** — returned unit is scanned, checked for completeness and condition.
6. **Restock or reassign** — good units go back to shelf; others are reassigned or sent to repair.
7. **Reports & audit trail** — full movement history and accountability.

"Approval" is a distinct step between request and release, done by authorized personnel.

## Promised modules (section 6)
- **Demo unit inventory** — central records, availability, location, inflow/outflow.
- **Borrowing & returns** — loan requests, approvals, releases, return schedules, borrower history.
- **Asset management** — serial number + asset code, shelf location, lifecycle, ownership.
- **Inspection & restocking** — inspection results, condition, repair/maintenance tagging.
- **Reports & analytics** — inventory, utilization, borrow/return history, condition and aging,
  available vs deployed, custom management reports.
- **User access & audit trail** — role-based access, user activity logs, full audit trail.

## Promised behaviors that are easy to miss
- **Alerts**: overdue return (days overdue), returned with missing accessory, tagged for
  inspection, available for redeployment.
- **Accessories are tracked** — "returned with missing power adapter" is a first-class outcome.
- **Scanning** — QR/barcode scan at release and at return.
- **Borrower record** — name, company, email, contact number; expected return date and loan
  length; who approved.
- **Statuses shown**: Available, On Demo, Returned, Under Inspection, For Repair.
- **Login screen** shows username + password, "remember me", "forgot password".
- **Sidebar**: Dashboard, Demo Units, Borrow/Return, Inspection, Reports, Users, Settings.
- **Hosting promise** (section 8): regular backups and security updates are part of the fee.
- **Confidentiality** (section 8): client data is not shared with third parties.

## Out of scope per the proposal
Hardware, network infrastructure, third-party licences, on-site support, custom integrations.
