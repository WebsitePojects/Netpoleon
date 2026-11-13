# Graph Report - .  (2026-11-14)

## Corpus Check
- Corpus is ~40,615 words - fits in a single context window. You may not need a graph.

## Summary
- 594 nodes · 887 edges · 43 communities (38 shown, 5 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 57 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_API App Composition|API App Composition]]
- [[_COMMUNITY_Database Guarantee Tests|Database Guarantee Tests]]
- [[_COMMUNITY_Typed Table Definitions|Typed Table Definitions]]
- [[_COMMUNITY_Project Memory System|Project Memory System]]
- [[_COMMUNITY_Code Rules and CI|Code Rules and CI]]
- [[_COMMUNITY_Architecture Decisions and Ops|Architecture Decisions and Ops]]
- [[_COMMUNITY_Role Bootstrap|Role Bootstrap]]
- [[_COMMUNITY_Root Tooling Manifest|Root Tooling Manifest]]
- [[_COMMUNITY_API Dependencies|API Dependencies]]
- [[_COMMUNITY_DB Package Dependencies|DB Package Dependencies]]
- [[_COMMUNITY_Base TypeScript Config|Base TypeScript Config]]
- [[_COMMUNITY_Config Package Manifest|Config Package Manifest]]
- [[_COMMUNITY_Contracts Package Manifest|Contracts Package Manifest]]
- [[_COMMUNITY_Shared API Contracts|Shared API Contracts]]
- [[_COMMUNITY_Data Model and Partner Wall|Data Model and Partner Wall]]
- [[_COMMUNITY_Lesson Guard Hook|Lesson Guard Hook]]
- [[_COMMUNITY_Migration Runner|Migration Runner]]
- [[_COMMUNITY_Definition of Done|Definition of Done]]
- [[_COMMUNITY_Product Scope and Outbox|Product Scope and Outbox]]
- [[_COMMUNITY_Booking Rules|Booking Rules]]
- [[_COMMUNITY_Build Config A|Build Config A]]
- [[_COMMUNITY_Build Config B|Build Config B]]
- [[_COMMUNITY_Build Config C|Build Config C]]
- [[_COMMUNITY_Build Config D|Build Config D]]
- [[_COMMUNITY_Asset Lifecycle Ledger|Asset Lifecycle Ledger]]
- [[_COMMUNITY_Append-only History|Append-only History]]
- [[_COMMUNITY_Package TS Config A|Package TS Config A]]
- [[_COMMUNITY_Package TS Config B|Package TS Config B]]
- [[_COMMUNITY_Database Roles and Services|Database Roles and Services]]
- [[_COMMUNITY_Package TS Config C|Package TS Config C]]
- [[_COMMUNITY_Package TS Config D|Package TS Config D]]
- [[_COMMUNITY_Prettier Config|Prettier Config]]
- [[_COMMUNITY_Package TS Config E|Package TS Config E]]
- [[_COMMUNITY_Monorepo Layout|Monorepo Layout]]
- [[_COMMUNITY_Security Imperatives|Security Imperatives]]
- [[_COMMUNITY_Deploy Rollback Safety|Deploy Rollback Safety]]
- [[_COMMUNITY_VPS Change Fingerprinting|VPS Change Fingerprinting]]
- [[_COMMUNITY_Clean Code Standard|Clean Code Standard]]
- [[_COMMUNITY_Idempotent Posting Layer|Idempotent Posting Layer]]

## God Nodes (most connected - your core abstractions)
1. `Fixtures` - 26 edges
2. `getTestDb()` - 21 edges
3. `compilerOptions` - 16 edges
4. `MigrationRunner` - 15 edges
5. `Database` - 13 edges
6. `RoleBootstrapper` - 13 edges
7. `sqlState()` - 12 edges
8. `connect()` - 12 edges
9. `Netpoleon WMS Foundation Design spec` - 11 edges
10. `loadConfig()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `Composition root (buildApp)` --references--> `buildApp()`  [INFERRED]
  .claude/rules/architecture.md → apps/api/src/app.ts
- `Task 3: typed schema, pools and transaction wrapper` --implements--> `Database`  [INFERRED]
  docs/superpowers/plans/2026-11-13-foundation-scaffold.md → packages/db/src/client.ts
- `RFC 9457 problem+json error envelope and AppError` --references--> `AppError`  [INFERRED]
  docs/superpowers/plans/2026-11-13-foundation-scaffold.md → apps/api/src/errors.ts
- `Three-layer API: routes -> services -> repositories -> Database` --references--> `HealthService`  [INFERRED]
  .claude/rules/architecture.md → apps/api/src/modules/health/health.service.ts
- `Local development start-up procedure` --references--> `HealthService`  [INFERRED]
  docs/RUNBOOK.md → apps/api/src/modules/health/health.service.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Database-enforced guarantees (last line of defence)** — docs_superpowers_specs_2026_11_13_netpoleon_wms_foundation_design_no_double_booking, docs_superpowers_specs_2026_11_13_netpoleon_wms_foundation_design_one_open_loan_per_unit, docs_superpowers_specs_2026_11_13_netpoleon_wms_foundation_design_status_matches_history, docs_superpowers_specs_2026_11_13_netpoleon_wms_foundation_design_append_only_history, docs_superpowers_specs_2026_11_13_netpoleon_wms_foundation_design_partner_wall [EXTRACTED 1.00]
- **Duplicate-safe mutating endpoint mechanisms** — _claude_rules_idempotency_concurrency_idempotency_key_store, _claude_rules_idempotency_concurrency_conditional_state_transition_update, _claude_rules_idempotency_concurrency_unique_constraint_recovery, _claude_rules_idempotency_concurrency_central_posting_layer, _claude_rules_idempotency_concurrency_double_fire_test [EXTRACTED 1.00]
- **Safe shared-VPS deploy workflow** — docs_deploy_vps_read_only_server_pass, _claude_rules_vps_safety_fingerprint_before_after, _claude_rules_vps_safety_target_by_exact_name, _claude_rules_vps_safety_rollback_for_every_change, docs_deploy_vps_rollback_by_image_digest [INFERRED 0.85]

## Communities (43 total, 5 thin omitted)

### Community 0 - "API App Composition"
Cohesion: 0.05
Nodes (35): AppDeps, buildApp(), AppError, createLogger(), REDACTED_PATHS, healthRoutes(), okSchema, readySchema (+27 more)

### Community 1 - "Database Guarantee Tests"
Cohesion: 0.08
Nodes (24): ColumnShape, schemaExports, tables, ATTACKS, TABLES, HISTORY_TRIGGERS, RLS_TABLES, Fixtures (+16 more)

### Community 2 - "Typed Table Definitions"
Cohesion: 0.08
Nodes (48): assetMovements, assetTransitions, auditLog, notifications, assets, locations, modelAccessories, productModels (+40 more)

### Community 3 - "Project Memory System"
Cohesion: 0.09
Nodes (27): .claude/README.md, lesson-guard Stop hook, Self-improving memory loop, Before ending a session that changed code, Where each kind of knowledge lives, Delivery workflow (plan first, sonnet builders, opus reviews), Self-improvement loop (lessons.md, Stop hook), Commercial model (monthly subscription, IP stays with Prince IT) (+19 more)

### Community 4 - "Code Rules and CI"
Cohesion: 0.07
Nodes (31): Composition root (buildApp), Object rules (classes with constructor injection, no module-level mutable state), No .env* file is ever tracked, Lesson: Vitest needs ssr.resolve.conditions for wms-source, CI pnpm audit of production dependencies, CI docker image build (infra/docker/Dockerfile), CI gitleaks full-history secret scan, CI verify job (format, lint, typecheck, test) (+23 more)

### Community 5 - "Architecture Decisions and Ops"
Cohesion: 0.09
Nodes (19): Database.transaction(scope, fn) is the only door, Three-layer API: routes -> services -> repositories -> Database, Deploy gaps: backups, first admin, image publishing, vulnerability scan, Runbook placeholders: restore, rotate secret, first administrator, Encrypted nightly backups with rehearsed restore, Data confidentiality boundary (VPS-only identity and data, encrypted backups), Approach A: modular monolith (TypeScript, Fastify, Drizzle, PostgreSQL, Compose), Rejected approach B: NestJS with Prisma (+11 more)

### Community 6 - "Role Bootstrap"
Cohesion: 0.08
Nodes (18): APP_ROLE_LIMITS, APP_ROLES, RoleBootstrapper, RoleName, RolePasswords, bootstrap(), COMMANDS, migrate() (+10 more)

### Community 7 - "Root Tooling Manifest"
Cohesion: 0.07
Nodes (26): description, devDependencies, eslint, eslint-config-prettier, @eslint/js, globals, prettier, @types/node (+18 more)

### Community 8 - "API Dependencies"
Cohesion: 0.08
Nodes (25): dependencies, fastify, @fastify/helmet, fastify-plugin, @fastify/swagger, fastify-type-provider-zod, pino, @wms/config (+17 more)

### Community 9 - "DB Package Dependencies"
Cohesion: 0.08
Nodes (23): default, dependencies, drizzle-orm, pg, @wms/config, devDependencies, testcontainers, @testcontainers/postgresql (+15 more)

### Community 10 - "Base TypeScript Config"
Cohesion: 0.12
Nodes (16): compilerOptions, exactOptionalPropertyTypes, forceConsistentCasingInFileNames, isolatedModules, lib, module, moduleResolution, noFallthroughCasesInSwitch (+8 more)

### Community 11 - "Config Package Manifest"
Cohesion: 0.13
Nodes (14): default, dependencies, zod, exports, name, private, scripts, build (+6 more)

### Community 12 - "Contracts Package Manifest"
Cohesion: 0.13
Nodes (14): default, dependencies, zod, exports, name, private, scripts, build (+6 more)

### Community 13 - "Shared API Contracts"
Cohesion: 0.40
Nodes (6): Page, pageOf(), PageQuery, pageQuerySchema, Problem, problemSchema

### Community 14 - "Data Model and Partner Wall"
Cohesion: 0.22
Nodes (9): Forward-only hand-written SQL migrations with checksums, New table checklist (FK indexes, grants, RLS, schema type, EXPECTED_MIGRATION_COUNT), EFFICIENT standard (no N+1, index filters, think 100x), ActorScope (staff, partner, system) type, Plan review focus (scope never set, concurrent approvals, edited migration, DB down, bad config), Task 3: typed schema, pools and transaction wrapper, Invitation-only accounts and single-tenant deployment, Partner wall (wms_partner role under row-level security) (+1 more)

### Community 15 - "Lesson Guard Hook"
Cohesion: 0.31
Nodes (8): block(), changedFiles(), { execSync }, fs, LESSONS_REL, main(), mtime(), path

### Community 17 - "Definition of Done"
Cohesion: 0.25
Nodes (8): graphify-out code map, Falsify, don't justify, before saying done, AI-generated code is highest-risk code, Definition of done checklist, Double-fire test (sequential and concurrent), Frontend in-flight guard and one idempotency key per intent, Agent hard rules (no .env, no weakened DB guarantee, no edited migration), Task 5: integration and falsification (coordinator)

### Community 18 - "Product Scope and Outbox"
Cohesion: 0.25
Nodes (8): Netpoleon WMS product, Promised alerts (overdue, missing accessory, inspection, redeployment), Promised modules (inventory, borrowing, assets, inspection, reports, access), Idempotency-Key store, No fire-and-forget side effects (outbox with lease and bounded retry), Idempotency-Key on every logged-in mutating endpoint, Today is Asia/Manila, stated in the query, Transactional outbox with SKIP LOCKED worker lease

### Community 19 - "Booking Rules"
Cohesion: 0.29
Nodes (7): Conditional state-transition UPDATE, Elevated availability count function (counts only, no foreign rows), Partners book a model for a date range; staff assign the unit, Reservations flagged needs_reassignment, never silently moved, No double booking (reservations_no_overlap exclusion constraint), Pending requests do not hold stock; partial approval allowed, Reservation turnaround buffer and uncollected-reservation expiry

### Community 20 - "Build Config A"
Cohesion: 0.29
Nodes (6): compilerOptions, declaration, outDir, rootDir, extends, include

### Community 21 - "Build Config B"
Cohesion: 0.29
Nodes (6): compilerOptions, declaration, outDir, rootDir, extends, include

### Community 22 - "Build Config C"
Cohesion: 0.29
Nodes (6): compilerOptions, declaration, outDir, rootDir, extends, include

### Community 23 - "Build Config D"
Cohesion: 0.29
Nodes (6): compilerOptions, declaration, outDir, rootDir, extends, include

### Community 24 - "Asset Lifecycle Ledger"
Cohesion: 0.33
Nodes (5): Asset status changes only through a recorded movement, 7-step demo unit lifecycle, Asset status is physical; reserved is derived from reservations, asset_transitions allowed-lifecycle table, Status and history never disagree (movement-trigger, no UPDATE on assets.status)

### Community 25 - "Append-only History"
Cohesion: 0.33
Nodes (6): Database is the last line of defence, Nothing with movement history is hard-deleted, Unique constraint with recovery outside aborted transaction, Append-only asset_movements and audit_log, audit_log per-entity field allow-list, One open loan per unit (partial unique index on loan_items)

### Community 26 - "Package TS Config A"
Cohesion: 0.33
Nodes (5): compilerOptions, customConditions, noEmit, extends, include

### Community 27 - "Package TS Config B"
Cohesion: 0.33
Nodes (5): compilerOptions, customConditions, noEmit, extends, include

### Community 28 - "Database Roles and Services"
Cohesion: 0.40
Nodes (5): Task 2: migrations, runner, role bootstrap, guarantee tests, Three database roles (wms_migrator, wms_staff, wms_partner), Dev postgres service (loopback 5432), Prod migrate one-shot service (bootstrap roles then migrate), Prod postgres service

### Community 29 - "Package TS Config C"
Cohesion: 0.40
Nodes (4): compilerOptions, noEmit, extends, include

### Community 30 - "Package TS Config D"
Cohesion: 0.40
Nodes (4): compilerOptions, noEmit, extends, include

### Community 31 - "Prettier Config"
Cohesion: 0.40
Nodes (4): endOfLine, printWidth, singleQuote, trailingComma

### Community 32 - "Package TS Config E"
Cohesion: 0.40
Nodes (4): compilerOptions, noEmit, extends, include

### Community 34 - "Security Imperatives"
Cohesion: 0.67
Nodes (3): Fail closed on unrecognized enum/route/state, Security imperatives (validate at boundary, constant-time compare, no secrets in logs, server-side authz), Opaque hashed-token sessions with argon2id passwords

### Community 35 - "Deploy Rollback Safety"
Cohesion: 0.67
Nodes (3): No destructive command without explicit yes, Every change has a written rollback and backup, Rollback by pinning previous image digest

## Knowledge Gaps
- **240 isolated node(s):** `{ execSync }`, `fs`, `path`, `LESSONS_REL`, `singleQuote` (+235 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `MigrationRunner` connect `Migration Runner` to `Database Guarantee Tests`, `Architecture Decisions and Ops`, `Role Bootstrap`, `Data Model and Partner Wall`, `Database Roles and Services`?**
  _High betweenness centrality (0.091) - this node is a cross-community bridge._
- **Why does `Database` connect `Architecture Decisions and Ops` to `Data Model and Partner Wall`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Why does `Three-layer API: routes -> services -> repositories -> Database` connect `Architecture Decisions and Ops` to `API App Composition`, `Project Memory System`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `MigrationRunner` (e.g. with `Forward-only hand-written SQL migrations with checksums` and `Local development start-up procedure`) actually correct?**
  _`MigrationRunner` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `Database` (e.g. with `Database.transaction(scope, fn) is the only door` and `Task 3: typed schema, pools and transaction wrapper`) actually correct?**
  _`Database` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `{ execSync }`, `fs`, `path` to the rest of the system?**
  _255 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `API App Composition` be split into smaller, more focused modules?**
  _Cohesion score 0.05376972530683811 - nodes in this community are weakly interconnected._