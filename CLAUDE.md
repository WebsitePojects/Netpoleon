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
- No local Docker? Push to a `feat/*` branch; GitHub Actions runs the same gate with Docker
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
