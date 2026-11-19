# Lessons Learned (append-only)

> Auto-loaded into every session via `@import` from CLAUDE.md. When a bug, wrong
> assumption, or environment gotcha is found, APPEND it here (newest at top). This
> is the project's growing memory — it exists so the same mistake never repeats.
>
> Format: one bold takeaway per bullet, then the mechanism/cause and the fix.
> Keep it to what a future session needs to avoid the trap — not a changelog.

## 2026-11-20
- **Postgres reads `POSTGRES_PASSWORD` only when the data volume is first created.** Changing
  the superuser password in the env file afterwards does nothing; change it inside the database
  first. App-role passwords are different: `migrate` re-runs role bootstrap, which resets them.
- **Prove backups by restoring them.** `infra/scripts/restore-check.sh` decrypts the newest dump
  into a throwaway database and counts rows; it passed on the local production stack, and the
  dump file starts with `Salted__` (openssl ciphertext) with no readable asset codes in it.
- **Never `queryClient.clear()` while a component is subscribed to a query you then re-seed.**
  Sign-in cleared the whole TanStack cache and then set the bootstrap query; the AuthProvider's
  observer stayed on the removed query, so the console was blank after signing in until a
  reload. Every earlier browser test reloaded after sign-in and hid it. `dropSessionData()` in
  `apps/web/src/auth/auth.tsx` removes every query except the session's and updates that one in
  place. Browser tests must cover the in-place sign-in and an account switch without reload.
- **Drive the workflows through the screens, not just the pages.** Loading every page passed;
  clicking through the lifecycle found two real problems: a just-returned unit was unreachable
  past page one of the inspection queue (fixed with a scan box), and the blank-after-sign-in bug.
- **The hardened Postgres container works.** `read_only` + `cap_drop` + the five `cap_add`s in
  `compose.prod.yml` ran the full stack locally (migrate, seed, lifecycle over HTTPS via Caddy).
  The 2026-11-13 hang was the full `C:` disk, not the hardening.

## 2026-11-19
- **Drizzle's node-postgres driver returns `timestamptz`, `timestamp` and `date` as strings, not
  `Date`.** It installs its own type parsers, so `tx.execute(sql...)` rows carry ISO-ish strings.
  The session lookup called `.getTime()` on one and every signed-in request 500'd. Row types in
  repositories say `Date | string`; convert with `iso()` / `Date.parse()`, never `.getTime()`.
- **Drizzle's `sql` tag spreads a JS array into a parameter list: `${['a','b']}` becomes `($1, $2)`.**
  `= ANY(${array})` is therefore invalid SQL; write `col IN ${array}` (the array is never empty —
  the schemas require at least one). For a jsonb array, pass `JSON.stringify(array)` and cast.
- **When a test sees an opaque 500, print the app's own log line, not the response.** The problem
  body is deliberately bare; `apps/api/test/support.ts` appends the last logged `err` to setup
  failures so a single CI run names the real cause.

## 2026-11-15
- **`pnpm add` wrote `^` ranges here even though `.npmrc` has `save-exact=true`.** Seven new
  dependencies landed as carets. Always pass `-E`, then check with
  `grep '"\^' apps/*/package.json packages/*/package.json package.json` before committing.
- **Have the plan attacked before any code is written.** An adversarial read of the backend plan
  against the migrations found two blockers no amount of building would have fixed cheaply: a
  request needs a `partner_orgs` row the screens never supplied, and keyset paging cannot serve
  page-number tables (and `count(*) OVER ()` after a cursor predicate is not the total). The
  corrections are section 9 of `docs/superpowers/plans/2026-11-15-real-backend.md`.
- **The owner wants one builder agent at a time, not parallel builders** (said 2026-11-15, after
  three were launched). Queue tasks to the same agent so it keeps its context; partial files
  from a stopped builder stay in the tree and must be reviewed, not assumed complete.
- **A red format step hides every bug behind it.** CI stops at the first failing step, so the
  web branch's format failure kept typecheck from ever running, and a real crash went unseen:
  bulk "Reject requests" on Borrow / Return called `store`, `user` and `toast` that `Borrow()`
  never fetched. Before judging a red branch, run the whole gate locally
  (`format:check && lint && typecheck && test`), not just the step CI reported.
- **ESLint here only matched `**/*.ts` and `**/*.js`, so every `.tsx` file was unlinted.**
  Fixed 2026-11-20: `.tsx` is in the type-aware block and `apps/web/src` gets the React hooks
  rules. Switching it on found 9 small issues (unused imports, needless casts), no real bugs.

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
