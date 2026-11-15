# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is
Netpoleon WMS — an ICT equipment warehouse and demo-asset management system built by
Prince IT Solutions OPC for Netpoleon / NSPH INC. It tracks demo units (firewalls, switches,
servers, laptops) through registration, stocking, borrowing, release, return, inspection and
redeployment, with a full audit trail. Deploy target: a Hostinger VPS.

## Commands
pnpm is not on PATH here: run it as `corepack pnpm …`.
- `corepack pnpm install` — install (lockfile is committed; CI uses `--frozen-lockfile`)
- `corepack pnpm format:check && corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`
  — the full local gate; tests start Postgres 18 through Testcontainers and need Docker
- `corepack pnpm build` — compile every package to `dist/`
- `docker build -f infra/docker/Dockerfile .` — the production image
- No local Docker? Set `WMS_TEST_PG_URL` to the superuser URL of a DISPOSABLE PostgreSQL 18
  (for example a throwaway cluster from `initdb` on a spare port); each test run creates and
  drops its own database there. Or push to a `feat/*` branch; CI runs the gate with Docker
- `corepack pnpm --filter @wms/api worker` — the outbox and cleanup worker (dev)
- `corepack pnpm --filter @wms/api create-admin --email … --name "…"` — invite the first admin
- `WMS_DEV_PASSWORD=… corepack pnpm --filter @wms/api dev-seed` — demo accounts, warehouse,
  catalogue, units and partners in a development database (refuses in production)
- Web app on the API: run the API (`corepack pnpm --filter @wms/api dev`), then
  `VITE_BACKEND=api corepack pnpm --filter @wms/web dev`; `/api` is proxied to port 3000.
  Without `VITE_BACKEND=api` the web app runs the in-browser demo
- `apps/web/e2e/lifecycle.mjs` (demo) and `apps/web/e2e/api-mode.mjs` (connected; reads
  `WMS_E2E_EMAIL` / `WMS_E2E_PASSWORD`) — browser end-to-end runs through Playwright
- `graphify . --update` — refresh the code map in `graphify-out/` after structural changes

## Project memory (auto-loaded)
@.claude/rules/agent-context.md
@.claude/rules/conventions.md
@.claude/rules/domain.md
@.claude/rules/architecture.md
@.claude/rules/idempotency-concurrency.md
@.claude/rules/engineering-standards.md
@.claude/rules/vps-safety.md
@.claude/rules/lessons.md
