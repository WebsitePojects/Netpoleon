# Netpoleon WMS

Warehouse management for Netpoleon's demo-unit lending: every unit accountable from registration
to redeployment, partner self-service booking, and an audit trail that cannot be edited.

Built and operated by Prince IT Solutions OPC.

## Layout

| Path                 | What it holds                                                       |
| -------------------- | ------------------------------------------------------------------- |
| `apps/api`           | Fastify API                                                         |
| `packages/config`    | Typed, validated environment loading; fails at start on bad config  |
| `packages/contracts` | zod schemas shared by the API and the future frontend               |
| `packages/db`        | SQL migrations, migration runner, typed schema, scoped transactions |
| `infra/docker`       | Dockerfile, compose files, Caddyfile                                |
| `docs`               | Deploy guide, runbook, design specs and plans                       |

## Commands

pnpm is not installed globally; call it through corepack.

```bash
corepack pnpm install
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

Starting the system locally is in [`docs/RUNBOOK.md`](docs/RUNBOOK.md); deploying it is in
[`docs/DEPLOY-vps.md`](docs/DEPLOY-vps.md).

## Ground rules

- No env file of any name is tracked, examples included. Variable names are documented in
  [`docs/DEPLOY-vps.md`](docs/DEPLOY-vps.md).
- The design is in
  [`docs/superpowers/specs/2026-11-13-netpoleon-wms-foundation-design.md`](docs/superpowers/specs/2026-11-13-netpoleon-wms-foundation-design.md).
- Project conventions and standing rules are in `CLAUDE.md` and `.claude/rules/`.
