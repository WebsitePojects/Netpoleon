# Graph Report - Netpoleon  (2026-11-15)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1672 nodes · 4040 edges · 92 communities (83 shown, 9 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 244 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f089bb31`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- lending.ts
- app.ts
- WmsStore
- RequestContext
- auth.service.ts
- store.ts
- CLAUDE.md
- react
- AppError
- helpers.ts
- stock.ts
- DataTable.tsx
- session.ts
- auth.test.ts
- Reports.tsx
- platform.test.ts
- controls.tsx
- client.test.ts
- selectors.ts
- contracts/src/index.ts
- db/package.json
- ui.tsx
- Inspection.tsx
- people.ts
- dev-seed.ts
- .record
- Users.tsx
- RoleBootstrapper
- App.tsx
- MigrationRunner
- lifecycle.mjs
- hooks.ts
- User
- Settings.tsx
- package.json
- harness.ts
- TransactionDetail.tsx
- Fixtures
- Shell.tsx
- compilerOptions
- api/package.json
- web/package.json
- worker.ts
- Section 15 hardening (how it fails and what stops it)
- assets.repository.ts
- config/package.json
- contracts/package.json
- Agent hard rules (no .env, no weakened DB guarantee, no edited migration)
- dependencies
- auth.tsx
- lesson-guard.cjs
- pagination.ts
- Database is the last line of defence
- KeyValueStorage
- Partners.tsx
- loadConfig
- devDependencies
- config/src/index.ts
- global-setup.ts
- compilerOptions
- Partner wall (wms_partner role under row-level security)
- Netpoleon WMS product
- scripts
- error-handler.ts
- AssetLabel.tsx
- src/permissions.ts
- No double booking (reservations_no_overlap exclusion constraint)
- ./tsconfig.base.json
- api/tsconfig.build.json
- dependencies
- devDependencies
- scripts
- config/tsconfig.build.json
- contracts/tsconfig.build.json
- db/tsconfig.build.json
- scripts
- drift.test.ts
- db/tsconfig.json
- context.tsx
- useTheme
- config/tsconfig.json
- contracts/tsconfig.json
- .prettierrc.json
- tsconfig.json
- .addPartner
- problem.ts
- Monorepo layout (apps/api, packages/config, contracts, db, infra/docker, docs)
- Security imperatives (validate at boundary, constant-time compare, no secrets in logs, server-side authz)
- Every change has a written rollback and backup
- Fingerprint PM2 and containers before and after a change
- Central idempotent posting layer

## God Nodes (most connected - your core abstractions)
1. `WmsStore` - 67 edges
2. `WmsError` - 43 edges
3. `AppError` - 41 edges
4. `RequestContext` - 36 edges
5. `@wms/db` - 33 edges
6. `buildApp()` - 32 edges
7. `getTestDb()` - 31 edges
8. `drizzle-orm` - 30 edges
9. `AuthRepository` - 29 edges
10. `react` - 29 edges

## Surprising Connections (you probably didn't know these)
- `Database.transaction(scope, fn) is the only door` --references--> `Database`  [INFERRED]
  .claude/rules/architecture.md → packages/db/src/client.ts
- `Task 3: typed schema, pools and transaction wrapper` --implements--> `Database`  [INFERRED]
  docs/superpowers/plans/2026-11-13-foundation-scaffold.md → packages/db/src/client.ts
- `Composition root (buildApp)` --references--> `buildApp()`  [INFERRED]
  .claude/rules/architecture.md → apps/api/src/app.ts
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

## Communities (92 total, 9 thin omitted)

### Community 0 - "lending.ts"
Cohesion: 0.08
Nodes (50): assetMovements, assetTransitions, auditLog, notifications, assets, categories, locations, modelAccessories (+42 more)

### Community 1 - "app.ts"
Cohesion: 0.08
Nodes (33): AppDeps, buildApp(), argsSchema, main(), AuthRepository, LoginCandidate, userColumns, AuthTokens (+25 more)

### Community 2 - "WmsStore"
Cohesion: 0.18
Nodes (8): normaliseCode(), required(), WmsError, WmsStore, Loan, MovementType, Unit, WmsState

### Community 3 - "RequestContext"
Cohesion: 0.12
Nodes (16): main(), AssetRow, AssetsRepository, assetRoutes(), actorOf(), AssetsService, explain(), toUser() (+8 more)

### Community 4 - "auth.service.ts"
Cohesion: 0.07
Nodes (19): SessionRow, AuthService, INVALID_LOGIN, LIMITS, LINK_INVALID, LoginResult, SYSTEM_SCOPE, toSessionUser() (+11 more)

### Community 5 - "store.ts"
Cohesion: 0.07
Nodes (47): AP_KIT, APPROVERS, BORROWERS, buildLocations(), buildPartners(), buildSeed(), buildUsers(), CATEGORY_SPECS (+39 more)

### Community 6 - "CLAUDE.md"
Cohesion: 0.07
Nodes (21): lesson-guard Stop hook, Before ending a session that changed code, Where each kind of knowledge lives, Database.transaction(scope, fn) is the only door, Delivery workflow (plan first, sonnet builders, opus reviews), Commercial model (monthly subscription, IP stays with Prince IT), Netpoleon Solutions Philippines (NSPH INC.) client, Prince IT Solutions OPC (+13 more)

### Community 7 - "react"
Cohesion: 0.08
Nodes (25): delay(), useSubmit(), boot, root, store, Guide, GUIDES, Help() (+17 more)

### Community 8 - "AppError"
Cohesion: 0.11
Nodes (19): AppError, NOT_FOUND, Refusal, CatalogRepository, CatalogService, duplicateAs409(), DUPLICATES, NOT_FOUND (+11 more)

### Community 9 - "helpers.ts"
Cohesion: 0.15
Nodes (21): ATTACKS, TABLES, HISTORY_TRIGGERS, RLS_TABLES, SeededStatus, StaffRole, bootstrapperFor(), connect() (+13 more)

### Community 10 - "stock.ts"
Cohesion: 0.05
Nodes (37): Asset, ASSET_SORTS, ASSET_STATUSES, assetCodeParamsSchema, AssetDetail, assetDetailSchema, AssetListQuery, assetListQuerySchema (+29 more)

### Community 11 - "DataTable.tsx"
Cohesion: 0.07
Nodes (28): BarGroup, BarSeries, Donut(), GroupedBars(), niceCeiling(), percent(), Slice, BatchAction (+20 more)

### Community 12 - "session.ts"
Cohesion: 0.16
Nodes (27): repairedBodySchema, auditRoutes(), Cursor, decode(), accepted, authRoutes(), userResponse, catalogRoutes() (+19 more)

### Community 13 - "auth.test.ts"
Cohesion: 0.12
Nodes (30): apps, db, latestEmail(), requestReset(), tokenOf(), createModel(), createShelves(), createUser() (+22 more)

### Community 14 - "Reports.tsx"
Cohesion: 0.11
Nodes (30): Alert, countByStatus(), Movement, formatLongDate(), formatMonth(), toDateKey(), useCountUp(), ALERT_ICONS (+22 more)

### Community 15 - "platform.test.ts"
Cohesion: 0.12
Nodes (15): OutboxMessage, OutboxTopic, backoffSeconds(), Claimed, KNOWN_TOPICS, MAX_ATTEMPTS, OutboxDispatcher, renderEmail() (+7 more)

### Community 16 - "controls.tsx"
Cohesion: 0.11
Nodes (25): CONDITION_OPTIONS, DateField(), monthTitle, Placement, Popover(), Select(), SelectOption, Sk() (+17 more)

### Community 17 - "client.test.ts"
Cohesion: 0.12
Nodes (13): Database, DatabaseOptions, EXPECTED_MIGRATION_COUNT, observed(), Tx, schema, ActorScope, assertValidScope() (+5 more)

### Community 18 - "selectors.ts"
Cohesion: 0.13
Nodes (22): ALERT_TITLES, AlertKind, buildAlerts(), daysOverdue(), lastMovementAt(), ModelAvailability, modelKey(), MonthlyMovement (+14 more)

### Community 19 - "contracts/src/index.ts"
Cohesion: 0.14
Nodes (24): changePasswordBodySchema, CLIENT_HEADER, email, forgotPasswordBodySchema, LoginBody, loginBodySchema, password, SESSION_COOKIE (+16 more)

### Community 20 - "db/package.json"
Cohesion: 0.08
Nodes (22): dependencies, drizzle-orm, pg, @wms/config, devDependencies, testcontainers, @testcontainers/postgresql, tsx (+14 more)

### Community 21 - "ui.tsx"
Cohesion: 0.08
Nodes (10): ButtonProps, CATEGORY_IMAGES, Crumb, LOAN_TONES, pageWindow(), TabItem, TableFoot(), Toast (+2 more)

### Community 22 - "Inspection.tsx"
Cohesion: 0.13
Nodes (19): ACTIVE_STATUSES, STATUS_LABELS, UnitStatus, usePageReady(), CHECKS, InspectDialog(), Inspection(), isTabId() (+11 more)

### Community 23 - "people.ts"
Cohesion: 0.08
Nodes (21): AuditEntry, auditEntrySchema, auditQuerySchema, Contact, contactBodySchema, contactParamsSchema, contactSchema, editPartnerBodySchema (+13 more)

### Community 24 - "dev-seed.ts"
Cohesion: 0.13
Nodes (15): AISLES, KITS, location(), MODELS, PARTNERS, STAFF, createLogger(), REDACTED_PATHS (+7 more)

### Community 25 - ".record"
Cohesion: 0.21
Nodes (5): PartnersRepository, partnerRoutes(), duplicate(), PartnersService, redactFields()

### Community 26 - "Users.tsx"
Cohesion: 0.15
Nodes (20): ACTION_LABELS, can(), GRANTS, MANAGER_ACTIONS, ROLE_LABELS, ROLE_SUMMARIES, WAREHOUSE_ACTIONS, formatRelative() (+12 more)

### Community 27 - "RoleBootstrapper"
Cohesion: 0.13
Nodes (11): APP_ROLE_LIMITS, APP_ROLES, RoleBootstrapper, RoleName, RolePasswords, bootstrap(), COMMANDS, migrate() (+3 more)

### Community 29 - "MigrationRunner"
Cohesion: 0.16
Nodes (7): Local development start-up procedure, checksumOf(), MigrationChecksumError, MigrationFile, MigrationResult, MigrationRunner, MIGRATIONS_DIR

### Community 30 - "lifecycle.mjs"
Cohesion: 0.19
Nodes (16): assert(), check(), choose(), { chromium }, dialog(), loanOf(), readState(), require (+8 more)

### Community 31 - "hooks.ts"
Cohesion: 0.16
Nodes (18): Tabs(), atRest(), EdgeWave, INK_LEAD, INK_TRAIL, InkEdge, prefersReducedMotion(), pull() (+10 more)

### Community 32 - "User"
Cohesion: 0.19
Nodes (7): User, COMMON, passwordProblem(), K, randomToken(), rotr(), sha256Hex()

### Community 33 - "Settings.tsx"
Cohesion: 0.27
Nodes (18): CategoriesSection(), DataSection(), Draft, GeneralSection(), isSectionId(), LabelSection(), LoanSection(), LocationsSection() (+10 more)

### Community 34 - "package.json"
Cohesion: 0.13
Nodes (17): description, engines, node, vite, vitest, name, packageManager, private (+9 more)

### Community 35 - "harness.ts"
Cohesion: 0.16
Nodes (13): newApp(), urls(), apps, buildProbeApp(), urls, CLOSED_PORT_URL, DatabaseUrls, registerProbeRoutes() (+5 more)

### Community 36 - "TransactionDetail.tsx"
Cohesion: 0.21
Nodes (16): missingAccessories(), dateFormat, formatDate(), formatDateTime(), longDateFormat, monthFormat, parse(), timeFormat (+8 more)

### Community 38 - "Shell.tsx"
Cohesion: 0.18
Nodes (16): GlobalSearch(), isActive(), NAV, NavItem, PersonMenu(), searchAll(), SearchHit, Shell() (+8 more)

### Community 39 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, exactOptionalPropertyTypes, forceConsistentCasingInFileNames, isolatedModules, lib, module, moduleResolution, noFallthroughCasesInSwitch (+8 more)

### Community 40 - "api/package.json"
Cohesion: 0.12
Nodes (14): devDependencies, testcontainers, @testcontainers/postgresql, tsx, name, private, type, version (+6 more)

### Community 41 - "web/package.json"
Cohesion: 0.12
Nodes (13): vite, vitest, name, private, type, version, typescript, @fontsource-variable/manrope (+5 more)

### Community 42 - "worker.ts"
Cohesion: 0.22
Nodes (7): beat(), CLEANUP_JOBS, Job, runExclusive(), LogMailer, MailerUnavailableError, main()

### Community 43 - "Section 15 hardening (how it fails and what stops it)"
Cohesion: 0.17
Nodes (11): Composition root (buildApp), No .env* file is ever tracked, CI pnpm audit of production dependencies, CI docker image build (infra/docker/Dockerfile), CI gitleaks full-history secret scan, CI verify job (format, lint, typecheck, test), Plan global constraints (exact versions, strict TS, OO rules), All-or-nothing CSV asset import and back-dated existing loans (+3 more)

### Community 44 - "assets.repository.ts"
Cohesion: 0.19
Nodes (8): assetColumns, Cursor, decodeCursor(), encodeCursor(), fromLocation, RawAsset, toAsset(), toLocation

### Community 45 - "config/package.json"
Cohesion: 0.15
Nodes (12): dependencies, zod, exports, zod, name, private, scripts, build (+4 more)

### Community 46 - "contracts/package.json"
Cohesion: 0.15
Nodes (12): dependencies, zod, exports, zod, name, private, scripts, build (+4 more)

### Community 47 - "Agent hard rules (no .env, no weakened DB guarantee, no edited migration)"
Cohesion: 0.17
Nodes (8): graphify-out code map, Forward-only hand-written SQL migrations with checksums, New table checklist (FK indexes, grants, RLS, schema type, EXPECTED_MIGRATION_COUNT), Definition of done checklist, Double-fire test (sequential and concurrent), Frontend in-flight guard and one idempotency key per intent, Plan review focus (scope never set, concurrent approvals, edited migration, DB down, bad config), Task 5: integration and falsification (coordinator)

### Community 48 - "dependencies"
Cohesion: 0.17
Nodes (12): dependencies, drizzle-orm, fastify, @fastify/helmet, fastify-plugin, @fastify/swagger, fastify-type-provider-zod, pino (+4 more)

### Community 49 - "auth.tsx"
Cohesion: 0.23
Nodes (10): AuthContext, AuthProvider(), AuthValue, readSession(), useAuth(), useCurrentUser(), writeSession(), Action (+2 more)

### Community 50 - "lesson-guard.cjs"
Cohesion: 0.21
Nodes (8): block(), changedFiles(), { execSync }, fs, LESSONS_REL, main(), mtime(), path

### Community 51 - "pagination.ts"
Cohesion: 0.18
Nodes (7): DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, Page, pageOf(), PageQuery, pageQuerySchema, can()

### Community 52 - "Database is the last line of defence"
Cohesion: 0.18
Nodes (8): Nothing with movement history is hard-deleted, Asset status changes only through a recorded movement, Unique constraint with recovery outside aborted transaction, Append-only asset_movements and audit_log, asset_transitions allowed-lifecycle table, audit_log per-entity field allow-list, One open loan per unit (partial unique index on loan_items), Status and history never disagree (movement-trigger, no UPDATE on assets.status)

### Community 54 - "Partners.tsx"
Cohesion: 0.25
Nodes (9): ContactDialog(), OPEN_STATUSES, PARTNER_TYPE_LABELS, PartnerDetail(), PartnerDialog(), PartnerRow, Partners(), TYPE_OPTIONS (+1 more)

### Community 55 - "loadConfig"
Cohesion: 0.24
Nodes (9): Reverse proxy decision: existing Nginx site file vs Caddy profile, wms.env server-side secrets file and variable catalogue, Prod api service (loopback-bound port), Prod opt-in Caddy proxy service, bindsBeyondLoopback(), ConfigError, loadConfig(), failure() (+1 more)

### Community 56 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, eslint, eslint-config-prettier, @eslint/js, globals, prettier, @types/node, typescript (+3 more)

### Community 57 - "config/src/index.ts"
Cohesion: 0.22
Nodes (8): AppConfig, DbConfig, LOOPBACK_HOSTS, envSchema, httpOrigin, LOG_LEVELS, ParsedEnv, postgresUrl

### Community 58 - "global-setup.ts"
Cohesion: 0.27
Nodes (10): MIGRATIONS_DIR, onServer(), secret(), Server, serverLock(), setup(), startContainer(), useExternalServer() (+2 more)

### Community 59 - "compilerOptions"
Cohesion: 0.20
Nodes (9): compilerOptions, jsx, lib, module, moduleResolution, noEmit, types, extends (+1 more)

### Community 60 - "Partner wall (wms_partner role under row-level security)"
Cohesion: 0.20
Nodes (9): ActorScope (staff, partner, system) type, Task 2: migrations, runner, role bootstrap, guarantee tests, Task 3: typed schema, pools and transaction wrapper, Partner wall (wms_partner role under row-level security), Three database roles (wms_migrator, wms_staff, wms_partner), User kinds and roles (staff vs partner), Dev postgres service (loopback 5432), Prod migrate one-shot service (bootstrap roles then migrate) (+1 more)

### Community 61 - "Netpoleon WMS product"
Cohesion: 0.22
Nodes (8): Netpoleon WMS product, Promised alerts (overdue, missing accessory, inspection, redeployment), Promised modules (inventory, borrowing, assets, inspection, reports, access), 7-step demo unit lifecycle, Idempotency-Key store, No fire-and-forget side effects (outbox with lease and bounded retry), Idempotency-Key on every logged-in mutating endpoint, Transactional outbox with SKIP LOCKED worker lease

### Community 62 - "scripts"
Cohesion: 0.22
Nodes (9): scripts, build, create-admin, dev, dev-seed, start, test, typecheck (+1 more)

### Community 63 - "error-handler.ts"
Cohesion: 0.33
Nodes (8): describeError(), describeValidationFailure(), errorHandlerPlugin, FASTIFY_CLIENT_ERRORS, INTERNAL_ERROR, isFastifyClientError(), ProblemDescriptor, toProblem()

### Community 64 - "AssetLabel.tsx"
Cohesion: 0.31
Nodes (6): AssetLabel(), Barcode(), Settings, Barcode, code128(), PATTERNS

### Community 65 - "src/permissions.ts"
Cohesion: 0.22
Nodes (8): Action, ACTIONS, GRANTS, isStaffRole(), PartnerRole, Role, STAFF_READ, StaffRole

### Community 66 - "No double booking (reservations_no_overlap exclusion constraint)"
Cohesion: 0.29
Nodes (4): Conditional state-transition UPDATE, Elevated availability count function (counts only, no foreign rows), No double booking (reservations_no_overlap exclusion constraint), Reservation turnaround buffer and uncollected-reservation expiry

### Community 67 - "./tsconfig.base.json"
Cohesion: 0.29
Nodes (6): compilerOptions, customConditions, noEmit, extends, include, ./tsconfig.base.json

### Community 68 - "api/tsconfig.build.json"
Cohesion: 0.29
Nodes (6): compilerOptions, declaration, outDir, rootDir, extends, include

### Community 69 - "dependencies"
Cohesion: 0.29
Nodes (7): dependencies, @fontsource-variable/manrope, lucide-react, qrcode-generator, react, react-dom, react-router-dom

### Community 70 - "devDependencies"
Cohesion: 0.29
Nodes (7): devDependencies, @types/react, @types/react-dom, typescript, vite, @vitejs/plugin-react, vitest

### Community 71 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, build, format, format:check, lint, test, typecheck

### Community 72 - "config/tsconfig.build.json"
Cohesion: 0.29
Nodes (6): compilerOptions, declaration, outDir, rootDir, extends, include

### Community 73 - "contracts/tsconfig.build.json"
Cohesion: 0.29
Nodes (6): compilerOptions, declaration, outDir, rootDir, extends, include

### Community 74 - "db/tsconfig.build.json"
Cohesion: 0.29
Nodes (6): compilerOptions, declaration, outDir, rootDir, extends, include

### Community 75 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, build, dev, preview, test, typecheck

### Community 76 - "drift.test.ts"
Cohesion: 0.33
Nodes (3): ColumnShape, schemaExports, tables

### Community 77 - "db/tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, customConditions, noEmit, extends, include

### Community 78 - "context.tsx"
Cohesion: 0.50
Nodes (3): StoreContext, useStore(), useWmsState()

### Community 79 - "useTheme"
Cohesion: 0.70
Nodes (5): applyTheme(), readTheme(), resolvesDark(), subscribeTheme(), useTheme()

### Community 80 - "config/tsconfig.json"
Cohesion: 0.40
Nodes (4): compilerOptions, noEmit, extends, include

### Community 81 - "contracts/tsconfig.json"
Cohesion: 0.40
Nodes (4): compilerOptions, noEmit, extends, include

### Community 82 - ".prettierrc.json"
Cohesion: 0.40
Nodes (4): endOfLine, printWidth, singleQuote, trailingComma

### Community 83 - "tsconfig.json"
Cohesion: 0.40
Nodes (4): compilerOptions, noEmit, extends, include

### Community 85 - "problem.ts"
Cohesion: 0.50
Nodes (3): RFC-9457, Problem, problemSchema

### Community 88 - "Every change has a written rollback and backup"
Cohesion: 0.67
Nodes (3): No destructive command without explicit yes, Every change has a written rollback and backup, Rollback by pinning previous image digest

## Knowledge Gaps
- **533 isolated node(s):** `SettingKey`, `LoginCandidate`, `AuditEntry`, `AppDeps`, `PartnerType` (+528 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 666 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `zod` connect `session.ts` to `app.ts`, `harness.ts`, `api/package.json`, `stock.ts`, `platform.test.ts`, `contracts/src/index.ts`, `pagination.ts`, `problem.ts`, `people.ts`, `config/src/index.ts`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **Why does `drizzle-orm` connect `app.ts` to `lending.ts`, `api/package.json`, `AppError`, `worker.ts`, `assets.repository.ts`, `session.ts`, `auth.test.ts`, `platform.test.ts`, `drift.test.ts`, `client.test.ts`, `db/package.json`, `dev-seed.ts`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Why does `Database` connect `client.test.ts` to `Partner wall (wms_partner role under row-level security)`, `CLAUDE.md`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **What connects `SettingKey`, `LoginCandidate`, `AuditEntry` to the rest of the system?**
  _533 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `lending.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0780399274047187 - nodes in this community are weakly interconnected._
- **Should `app.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08417508417508418 - nodes in this community are weakly interconnected._
- **Should `RequestContext` be split into smaller, more focused modules?**
  _Cohesion score 0.11809923130677848 - nodes in this community are weakly interconnected._