# Lessons Learned (append-only)

> Auto-loaded into every session via `@import` from CLAUDE.md. When a bug, wrong
> assumption, or environment gotcha is found, APPEND it here (newest at top). This
> is the project's growing memory — it exists so the same mistake never repeats.
>
> Format: one bold takeaway per bullet, then the mechanism/cause and the fix.
> Keep it to what a future session needs to avoid the trap — not a changelog.

## 2026-11-13
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
