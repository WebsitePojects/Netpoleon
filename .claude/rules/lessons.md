# Lessons Learned (append-only)

> Auto-loaded into every session via `@import` from CLAUDE.md. When a bug, wrong
> assumption, or environment gotcha is found, APPEND it here (newest at top). This
> is the project's growing memory — it exists so the same mistake never repeats.
>
> Format: one bold takeaway per bullet, then the mechanism/cause and the fix.
> Keep it to what a future session needs to avoid the trap — not a changelog.

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
