# Lessons Learned (append-only)

> Auto-loaded into every session via `@import` from CLAUDE.md. When a bug, wrong
> assumption, or environment gotcha is found, APPEND it here (newest at top). This
> is the project's growing memory — it exists so the same mistake never repeats.
>
> Format: one bold takeaway per bullet, then the mechanism/cause and the fix.
> Keep it to what a future session needs to avoid the trap — not a changelog.

## 2026-11-15
- **Drizzle drops the table name from columns in a one-table select, which silently breaks a
  correlated subquery.** `sql\`(SELECT … FROM model_accessories WHERE product_model_id =
  ${productModels.id})\`` rendered `= "id"`, which bound to `model_accessories.id`: every model
  showed no accessories, and the partners list would have counted each company's contacts and
  loans wrong. Render the query with `.toSQL()` when in doubt; in subqueries name the outer
  column literally (`product_models.id`). A test that puts data on one company and checks a
  second one stays empty is what catches it.
- **`= ANY(${array})` in a Drizzle `sql` template becomes `= ANY(($1, $2))`, a row, not an
  array.** Use `inArray(column, values)`.
- **Tests and development data must not share a PostgreSQL cluster.** Roles are cluster-wide,
  so every test run resets their passwords and the dev database's credentials stop working.
  The dev database lives on its own throwaway cluster (port 55433 here).
- **Docker here cannot start when WSL has no distributions.** `docker version` fails on the
  `dockerDesktopLinuxEngine` pipe and `wsl -l -v` lists nothing; Docker's data is on
  `E:\DockerData` and `E:` was not attached. Do not reinstall or reset it (other projects'
  containers live there). Run the tests against a throwaway cluster instead: `initdb` with the
  binaries in `D:\PostgreSQL\bin` into a scratch folder, `pg_ctl … -o "-p 55432"`, then set
  `WMS_TEST_PG_URL`. Never point it at the PostgreSQL service on 5432: it belongs to other
  projects and the tests create cluster-wide roles.
- **`corepack pnpm test` runs the db and api suites at the same time, and roles are
  cluster-wide.** On one shared server each suite's setup reset the role passwords and locked
  the other out (partner guarantee tests failed only when run together). External-server mode
  now derives the role passwords from the server URL and takes a server-level advisory lock
  around role setup.
- **Node 24.7+ has argon2id built in (`crypto.argon2`).** No native module, no install script,
  nothing extra in the image. The Docker base `node:24-slim` and CI's `.nvmrc` (24) both
  resolve to a new enough 24.x; pin a minor if that ever stops being true.
- **A new CSRF guard breaks every existing POST test that omits the header.** The hardening
  tests for body size and malformed JSON started returning 403 because the guard runs first.
  They now send the client header; a test of a later layer must pass the earlier ones.
- **Check a hand-written encoder against an independent decoder, not against your own table.**
  Comparing the Code 128 bars with `python-barcode` showed differences, but only because that
  library switches to the denser set C for digit runs. Decoding our bars with the library's
  own pattern table proved every label reads back to its exact asset code with a valid
  checksum. Comparing encodings alone would have "failed" a correct barcode.
- **Prettier collapses a lookup table to one entry per line.** Put `// prettier-ignore` on
  data tables (the 107 barcode patterns) so the file stays readable.
- **React Router 7 applies `setSearchParams` inside a transition, so the URL changes before the
  new screen paints.** Two e2e checks read the old table: one waited for `?sort=-code` then read
  still-ascending rows, the other clicked a tab and then "Export CSV" on the previous tab's
  table. Wait for rendered state instead (`th[aria-sort="descending"]`,
  `.tab[aria-selected="true"]`, the new heading), never for the URL alone.
- **A phone table label is a `::before` on the cell, so it inherits the cell's class.** Codes set
  in `mono` printed their label ("Serial Number") in monospace too. The label now sets its own
  font in `app.css`.
- **A red format step hides every bug behind it.** CI stops at the first failing step, so the
  web branch's format failure kept typecheck from ever running, and a real crash went unseen:
  bulk "Reject requests" on Borrow / Return called `store`, `user` and `toast` that `Borrow()`
  never fetched. Before judging a red branch, run the whole gate locally
  (`format:check && lint && typecheck && test`), not just the step CI reported.
- **ESLint here only matches `**/*.ts` and `**/*.js`, so every `.tsx` file in `apps/web` is
  unlinted.** Typecheck still covers them. Extending lint to `.tsx` (with React rules) is owed
  work; expect findings when it is switched on.

## 2026-11-14
- **A blob drawn as a `polygon()` with independent random jitter per vertex always looks spiky.**
  Neighbouring vertices disagree, so every one becomes a corner. The theme wipe in
  `apps/web/src/lib/hooks.ts` now builds the rim from four low harmonics (1–4 lobes; the 1-lobe
  term makes it lopsided so it never reads as a circle) and draws it as a closed Catmull-Rom →
  cubic Bézier `path()`, so it is smooth by construction. Motion is sampled into ~60 keyframes
  with `linear` easing (the browser only interpolates between near-identical shapes).
- **Size a reveal to the shape it actually has, then measure pacing in the browser.** Sizing the
  blob for its worst-case dent (radius / (1 − wobble)) made it cover the screen at ~330 ms of
  1100 ms: the rest played off screen. Now `radiusToCover` computes the exact radius for this
  run's waves, and an accelerating curve (owner's ask: slow first, then fast) finishes coverage
  at the very end of the run (700 ms total since the owner asked for a little faster). The check that caught it: read the keyframes from
  `document.getAnimations()`, test a point grid with `Path2D` + `isPointInPath`, and print
  coverage per frame. Eyeballing screenshots did not catch it.
- **A root `"type": "module"` silently breaks every CommonJS `.js` script in the repo, including
  `.claude/hooks/`.** The lesson-guard Stop hook uses `require` and crashed with "require is not
  defined in ES module scope" from the moment the workspace `package.json` landed — the memory
  loop was off without anyone noticing. Fix: it is now `.claude/hooks/lesson-guard.cjs`. Any
  CommonJS helper added later must use `.cjs`. After touching `package.json`, run
  `node .claude/hooks/lesson-guard.cjs` and check exit 0.
- **Vitest 5 resolves imports through Vite's server-side environment: set
  `ssr.resolve.conditions`, not only `resolve.conditions`.** The `wms-source` export condition
  (workspace packages → TypeScript source) was set only at the top level. API tests passed
  locally because a builder had compiled `dist/` folders, and failed in CI with "Failed to
  resolve entry for package @wms/contracts". The db tests never caught it: they import
  workspace packages for types only. Fix is in `apps/api/vitest.config.ts` and
  `packages/db/vitest.config.ts`. To reproduce any "works here, fails in CI" import error,
  move the `dist/` folders aside first.
- **Testing through GitHub Actions is a real fallback when local Docker is down.** Push to a
  `feat/*` branch, read the Test step, merge to `main` only when it is green. The CI runner
  provides Docker for Testcontainers.

## 2026-11-13
- **When Docker Desktop hangs on this machine, check free space on `C:` before anything else.**
  `docker version` timed out twice and a restart only helped for minutes. The cause was `C:` at
  0 MB free: Docker's data lives on `E:\DockerData`, but Docker Desktop and WSL still need room
  on the system drive, and the backend log showed `Failed to attach disk ... docker_data.vhdx`.
  Symptom looks like a Docker bug; it is a full disk. Check with
  `Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"`. Never "fix" it with
  `wsl --shutdown` or a prune — other projects' containers live in the same engine.
- **A hardened container probe is not the way to test compose hardening on a dev laptop.** An
  agent started Postgres with `read_only` + `cap_drop` to check `compose.prod.yml` just before
  the engine hung. Whether it contributed is unproven (the disk was already full), but the
  hardened Postgres service remains unverified and must be proven on the real server before
  go-live, with the read-only context block from `vps-safety.md` first.
- **The requirements PDF is image-only and lives outside the repo; read it by rendering pages.**
  `D:\Win10_UserData\Downloads\NWAMS.pdf` (the Windows Downloads folder is relocated to `D:`,
  and the file is NWAMS, not NWASM) has zero extractable text — all 8 pages are flattened
  images, and this machine has no poppler/pdftotext. Fix: render pages to JPEG with PyMuPDF in
  a throwaway venv and read the images. The extracted requirements are written down in
  `.claude/rules/domain.md`, so nobody needs to repeat this.
- **The proposal's sample figures contradict each other — never treat them as test fixtures.**
  Page 5 shows Returned 52 / Under Inspection 28; page 6 shows 62 / 18 and adds a "For Repair"
  status page 5 lacks. Asset codes appear as both `SW-00124` and `NTP-SW-001`. They are
  marketing mockups. Status list and code format are design decisions, recorded in the spec.
