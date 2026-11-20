# User handbook

The Netpoleon WMS user handbook: a PDF on long bond paper (8.5 × 13 in) in the Prince IT
Solutions template, English with a Tagalog side note on every section, and annotated screenshots
of the real system.

| File                                     | Role                                                                                |
| ---------------------------------------- | ----------------------------------------------------------------------------------- |
| `figures.mjs`                            | Every figure: how to reach the screen, the crop, and each callout's target and text |
| `capture.mjs`                            | Opens the system as each demo role and saves screenshots plus element positions     |
| `content.mjs`                            | The chapters, page by page                                                          |
| `build.mjs`, `layout.js`, `handbook.css` | Lays the pages out, places and checks the callouts, prints the PDF                  |
| `assets/prince-logo.png`                 | Prince IT Solutions logo, cut from proposal PITS-NTP-2026-001                       |

## Rebuild

Playwright is not a project dependency; point `PW_DIR` at any folder holding
`node_modules/playwright`.

```bash
# 1. Screenshots from a running system that holds the demo data (read-only: every API call
#    other than GET and sign-in is blocked, so nothing can be saved by accident).
PW_DIR=… HANDBOOK_BASE=https://wms.princeitsolutions.tech DEMO_PASSWORD=… node docs/handbook/capture.mjs
#    One figure only: add its id, e.g. `… capture.mjs register`.

# 2. Lay out, verify and print. PREVIEW=1 also writes a PNG of every page.
PW_DIR=… node docs/handbook/build.mjs
```

Output: `docs/handbook/build/Netpoleon-WMS-User-Handbook.pdf` (the `build/` folder is not
tracked).

## The callout check

`layout.js` places each callout label beside the screenshot in the same order as the element it
points at, and draws every leader as two straight pieces: from the element straight out to the
screenshot's edge, then across the gap to its label. Then it checks the result and the build
refuses to print if any of these is true: two leaders cross; a leader runs through another
label, number or highlighted element; two labels or numbers overlap; a page overflows.

When the check fails, move the callout to the other side (`side` in `figures.mjs`) or point it
at a smaller element. Do not loosen the check.

## Keeping it true

- The text documents the version named on the cover (`EDITION` in `build.mjs`). When a release
  changes a screen, recapture its figures and re-read the matching chapter.
- Every behaviour the text claims was checked against the code; re-check claims about timing,
  alerts and permissions when that code changes.
