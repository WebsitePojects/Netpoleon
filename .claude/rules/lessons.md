# Lessons Learned (append-only)

> Auto-loaded into every session via `@import` from CLAUDE.md. When a bug, wrong
> assumption, or environment gotcha is found, APPEND it here (newest at top). This
> is the project's growing memory — it exists so the same mistake never repeats.
>
> Format: one bold takeaway per bullet, then the mechanism/cause and the fix.
> Keep it to what a future session needs to avoid the trap — not a changelog.

## 2026-11-14
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
