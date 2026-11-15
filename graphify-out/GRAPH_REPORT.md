# Graph Report - Netpoleon  (2026-11-15)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1447 nodes · 3266 edges · 79 communities (70 shown, 9 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 115 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `06a9f6da`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- lending.ts
- auth.service.ts
- platform.test.ts
- store.ts
- contracts/src/index.ts
- CLAUDE.md
- app.ts
- Inspection.tsx
- WmsError
- helpers.ts
- DataTable.tsx
- package.json
- Users.tsx
- Reports.tsx
- harness.ts
- auth.test.ts
- session.ts
- client.test.ts
- db/package.json
- ui.tsx
- dependencies
- Partners.tsx
- RoleBootstrapper
- App.tsx
- WmsStore
- hooks.ts
- MigrationRunner
- lifecycle.mjs
- SetPassword.tsx
- TransactionDetail.tsx
- dates.ts
- Settings.tsx
- Fixtures
- Shell.tsx
- compilerOptions
- web/package.json
- selectors.ts
- Section 15 hardening (how it fails and what stops it)
- controls.tsx
- WmsState
- config/package.json
- contracts/package.json
- No double booking (reservations_no_overlap exclusion constraint)
- auth.tsx
- lesson-guard.cjs
- config/src/index.ts
- Database is the last line of defence
- global-setup.ts
- compilerOptions
- loadConfig
- Partner wall (wms_partner role under row-level security)
- Netpoleon WMS product
- Agent hard rules (no .env, no weakened DB guarantee, no edited migration)
- ./tsconfig.base.json
- api/tsconfig.build.json
- dependencies
- devDependencies
- Sk
- KeyValueStorage
- config/tsconfig.build.json
- contracts/tsconfig.build.json
- db/tsconfig.build.json
- test/fixtures.ts
- scripts
- drift.test.ts
- db/tsconfig.json
- context.tsx
- config/tsconfig.json
- contracts/tsconfig.json
- .prettierrc.json
- tsconfig.json
- useLiquidInk
- MemoryStorage
- Monorepo layout (apps/api, packages/config, contracts, db, infra/docker, docs)
- Security imperatives (validate at boundary, constant-time compare, no secrets in logs, server-side authz)
- Every change has a written rollback and backup
- Fingerprint PM2 and containers before and after a change
- Central idempotent posting layer

## God Nodes (most connected - your core abstractions)
1. `WmsStore` - 67 edges
2. `WmsError` - 43 edges
3. `react` - 29 edges
4. `toDateKey()` - 27 edges
5. `getTestDb()` - 27 edges
6. `Fixtures` - 26 edges
7. `usePageReady()` - 26 edges
8. `AuthRepository` - 25 edges
9. `WmsState` - 25 edges
10. `formatDate()` - 25 edges

## Surprising Connections (you probably didn't know these)
- `RFC 9457 problem+json error envelope and AppError` --references--> `AppError`  [INFERRED]
  docs/superpowers/plans/2026-11-13-foundation-scaffold.md → apps/api/src/errors.ts
- `Database.transaction(scope, fn) is the only door` --references--> `Database`  [INFERRED]
  .claude/rules/architecture.md → packages/db/src/client.ts
- `Task 3: typed schema, pools and transaction wrapper` --implements--> `Database`  [INFERRED]
  docs/superpowers/plans/2026-11-13-foundation-scaffold.md → packages/db/src/client.ts
- `Composition root (buildApp)` --references--> `buildApp()`  [INFERRED]
  .claude/rules/architecture.md → apps/api/src/app.ts
- `Partner wall (wms_partner role under row-level security)` --references--> `Database`  [INFERRED]
  docs/superpowers/specs/2026-11-13-netpoleon-wms-foundation-design.md → packages/db/src/client.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Database-enforced guarantees (last line of defence)** — docs_superpowers_specs_2026_11_13_netpoleon_wms_foundation_design_no_double_booking, docs_superpowers_specs_2026_11_13_netpoleon_wms_foundation_design_one_open_loan_per_unit, docs_superpowers_specs_2026_11_13_netpoleon_wms_foundation_design_status_matches_history, docs_superpowers_specs_2026_11_13_netpoleon_wms_foundation_design_append_only_history, docs_superpowers_specs_2026_11_13_netpoleon_wms_foundation_design_partner_wall [EXTRACTED 1.00]
- **Duplicate-safe mutating endpoint mechanisms** — _claude_rules_idempotency_concurrency_idempotency_key_store, _claude_rules_idempotency_concurrency_conditional_state_transition_update, _claude_rules_idempotency_concurrency_unique_constraint_recovery, _claude_rules_idempotency_concurrency_central_posting_layer, _claude_rules_idempotency_concurrency_double_fire_test [EXTRACTED 1.00]
- **Safe shared-VPS deploy workflow** — docs_deploy_vps_read_only_server_pass, _claude_rules_vps_safety_fingerprint_before_after, _claude_rules_vps_safety_target_by_exact_name, _claude_rules_vps_safety_rollback_for_every_change, docs_deploy_vps_rollback_by_image_digest [INFERRED 0.85]

## Communities (79 total, 9 thin omitted)

### Community 0 - "lending.ts"
Cohesion: 0.08
Nodes (50): assetMovements, assetTransitions, auditLog, notifications, assets, categories, locations, modelAccessories (+42 more)

### Community 1 - "auth.service.ts"
Cohesion: 0.08
Nodes (23): AuthRepository, LoginCandidate, SessionRow, userColumns, AuthService, INVALID_LOGIN, LIMITS, LINK_INVALID (+15 more)

### Community 2 - "platform.test.ts"
Cohesion: 0.08
Nodes (27): created(), Mutations, OutboxMessage, OutboxTopic, backoffSeconds(), Claimed, KNOWN_TOPICS, MAX_ATTEMPTS (+19 more)

### Community 3 - "store.ts"
Cohesion: 0.06
Nodes (48): AP_KIT, APPROVERS, BORROWERS, buildLocations(), buildPartners(), buildSeed(), buildUsers(), CATEGORY_SPECS (+40 more)

### Community 4 - "contracts/src/index.ts"
Cohesion: 0.07
Nodes (42): RFC-9457, changePasswordBodySchema, CLIENT_HEADER, email, forgotPasswordBodySchema, LoginBody, loginBodySchema, password (+34 more)

### Community 5 - "CLAUDE.md"
Cohesion: 0.07
Nodes (21): lesson-guard Stop hook, Before ending a session that changed code, Where each kind of knowledge lives, Database.transaction(scope, fn) is the only door, Delivery workflow (plan first, sonnet builders, opus reviews), Commercial model (monthly subscription, IP stays with Prince IT), Netpoleon Solutions Philippines (NSPH INC.) client, Prince IT Solutions OPC (+13 more)

### Community 6 - "app.ts"
Cohesion: 0.07
Nodes (34): name, private, type, version, AppDeps, healthRoutes(), okSchema, readySchema (+26 more)

### Community 7 - "Inspection.tsx"
Cohesion: 0.08
Nodes (26): ACTIVE_STATUSES, missingAccessories(), UnitStatus, delay(), useSubmit(), boot, root, store (+18 more)

### Community 8 - "WmsError"
Cohesion: 0.18
Nodes (4): required(), WmsError, Loan, Partner

### Community 9 - "helpers.ts"
Cohesion: 0.15
Nodes (21): ATTACKS, TABLES, HISTORY_TRIGGERS, RLS_TABLES, SeededStatus, StaffRole, bootstrapperFor(), connect() (+13 more)

### Community 10 - "DataTable.tsx"
Cohesion: 0.07
Nodes (28): BarGroup, BarSeries, Donut(), GroupedBars(), niceCeiling(), percent(), Slice, BatchAction (+20 more)

### Community 11 - "package.json"
Cohesion: 0.06
Nodes (36): description, devDependencies, eslint, eslint-config-prettier, @eslint/js, globals, prettier, @types/node (+28 more)

### Community 12 - "Users.tsx"
Cohesion: 0.11
Nodes (27): ACTION_LABELS, can(), GRANTS, MANAGER_ACTIONS, ROLE_LABELS, ROLE_SUMMARIES, WAREHOUSE_ACTIONS, Guide (+19 more)

### Community 13 - "Reports.tsx"
Cohesion: 0.12
Nodes (31): Alert, countByStatus(), movementsByMonth(), Movement, formatDate(), formatRelative(), toDateKey(), useCountUp() (+23 more)

### Community 14 - "harness.ts"
Cohesion: 0.11
Nodes (20): buildApp(), createLogger(), REDACTED_PATHS, main(), readConfigOrExit(), ShutdownCoordinator, SIGNALS, apps (+12 more)

### Community 15 - "auth.test.ts"
Cohesion: 0.10
Nodes (23): argsSchema, main(), AuthTokens, PATHS, TOKEN_TTL_HOURS, AuditEntry, AuditWriter, redactFields() (+15 more)

### Community 16 - "session.ts"
Cohesion: 0.13
Nodes (23): AppError, accepted, authRoutes(), userResponse, clearedCookie(), readCookie(), sessionCookie(), SessionCookieOptions (+15 more)

### Community 17 - "client.test.ts"
Cohesion: 0.13
Nodes (13): Database, DatabaseOptions, EXPECTED_MIGRATION_COUNT, observed(), Tx, schema, ActorScope, assertValidScope() (+5 more)

### Community 18 - "db/package.json"
Cohesion: 0.08
Nodes (22): dependencies, drizzle-orm, pg, @wms/config, devDependencies, testcontainers, @testcontainers/postgresql, tsx (+14 more)

### Community 19 - "ui.tsx"
Cohesion: 0.08
Nodes (9): ButtonProps, CATEGORY_IMAGES, Crumb, LOAN_TONES, pageWindow(), TabItem, TableFoot(), Toast (+1 more)

### Community 20 - "dependencies"
Cohesion: 0.08
Nodes (24): dependencies, drizzle-orm, fastify, @fastify/helmet, fastify-plugin, @fastify/swagger, fastify-type-provider-zod, pino (+16 more)

### Community 21 - "Partners.tsx"
Cohesion: 0.17
Nodes (19): daysOverdue(), LOAN_STATUS_LABELS, daysBetween(), usePageReady(), Borrow(), isTabId(), PURPOSES, RequestDialog() (+11 more)

### Community 22 - "RoleBootstrapper"
Cohesion: 0.13
Nodes (11): APP_ROLE_LIMITS, APP_ROLES, RoleBootstrapper, RoleName, RolePasswords, bootstrap(), COMMANDS, migrate() (+3 more)

### Community 24 - "WmsStore"
Cohesion: 0.20
Nodes (6): WmsStore, User, K, randomToken(), rotr(), sha256Hex()

### Community 25 - "hooks.ts"
Cohesion: 0.18
Nodes (19): applyTheme(), EdgeWave, INK_LEAD, INK_TRAIL, InkEdge, prefersReducedMotion(), radiusToCover(), randomWaves() (+11 more)

### Community 26 - "MigrationRunner"
Cohesion: 0.16
Nodes (7): Local development start-up procedure, checksumOf(), MigrationChecksumError, MigrationFile, MigrationResult, MigrationRunner, MIGRATIONS_DIR

### Community 27 - "lifecycle.mjs"
Cohesion: 0.19
Nodes (16): assert(), check(), choose(), { chromium }, dialog(), loanOf(), readState(), require (+8 more)

### Community 28 - "SetPassword.tsx"
Cohesion: 0.16
Nodes (12): AssetLabel(), Barcode(), Barcode, code128(), PATTERNS, COMMON, passwordProblem(), AcceptInvite() (+4 more)

### Community 29 - "TransactionDetail.tsx"
Cohesion: 0.16
Nodes (15): MOVEMENT_LABELS, STATUS_LABELS, formatDateTime(), ApproveDialog(), buildSteps(), ExtendDialog(), Open, ReceiveDialog() (+7 more)

### Community 30 - "dates.ts"
Cohesion: 0.15
Nodes (14): addDays(), dateFormat, formatLongDate(), formatMonth(), fromDateKey(), longDateFormat, monthFormat, monthKeyOf() (+6 more)

### Community 31 - "Settings.tsx"
Cohesion: 0.27
Nodes (18): CategoriesSection(), DataSection(), Draft, GeneralSection(), isSectionId(), LabelSection(), LoanSection(), LocationsSection() (+10 more)

### Community 33 - "Shell.tsx"
Cohesion: 0.18
Nodes (16): GlobalSearch(), isActive(), NAV, NavItem, PersonMenu(), searchAll(), SearchHit, Shell() (+8 more)

### Community 34 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, exactOptionalPropertyTypes, forceConsistentCasingInFileNames, isolatedModules, lib, module, moduleResolution, noFallthroughCasesInSwitch (+8 more)

### Community 35 - "web/package.json"
Cohesion: 0.13
Nodes (12): vite, vitest, name, private, type, version, @fontsource-variable/manrope, qrcode-generator (+4 more)

### Community 36 - "selectors.ts"
Cohesion: 0.21
Nodes (11): ALERT_TITLES, AlertKind, buildAlerts(), lastMovementAt(), ModelAvailability, modelKey(), MonthlyMovement, StatusCounts (+3 more)

### Community 37 - "Section 15 hardening (how it fails and what stops it)"
Cohesion: 0.17
Nodes (11): Composition root (buildApp), No .env* file is ever tracked, CI pnpm audit of production dependencies, CI docker image build (infra/docker/Dockerfile), CI gitleaks full-history secret scan, CI verify job (format, lint, typecheck, test), Plan global constraints (exact versions, strict TS, OO rules), All-or-nothing CSV asset import and back-dated existing loans (+3 more)

### Community 38 - "controls.tsx"
Cohesion: 0.21
Nodes (12): CONDITION_OPTIONS, DateField(), monthTitle, Placement, Popover(), Select(), SelectOption, SK_TABS (+4 more)

### Community 39 - "WmsState"
Cohesion: 0.36
Nodes (4): normaliseCode(), MovementType, Unit, WmsState

### Community 40 - "config/package.json"
Cohesion: 0.15
Nodes (12): dependencies, zod, exports, zod, name, private, scripts, build (+4 more)

### Community 41 - "contracts/package.json"
Cohesion: 0.15
Nodes (12): dependencies, zod, exports, zod, name, private, scripts, build (+4 more)

### Community 42 - "No double booking (reservations_no_overlap exclusion constraint)"
Cohesion: 0.17
Nodes (9): Conditional state-transition UPDATE, Task 2: migrations, runner, role bootstrap, guarantee tests, Elevated availability count function (counts only, no foreign rows), No double booking (reservations_no_overlap exclusion constraint), Reservation turnaround buffer and uncollected-reservation expiry, Three database roles (wms_migrator, wms_staff, wms_partner), Dev postgres service (loopback 5432), Prod migrate one-shot service (bootstrap roles then migrate) (+1 more)

### Community 43 - "auth.tsx"
Cohesion: 0.23
Nodes (10): AuthContext, AuthProvider(), AuthValue, readSession(), useAuth(), useCurrentUser(), writeSession(), Action (+2 more)

### Community 44 - "lesson-guard.cjs"
Cohesion: 0.21
Nodes (8): block(), changedFiles(), { execSync }, fs, LESSONS_REL, main(), mtime(), path

### Community 45 - "config/src/index.ts"
Cohesion: 0.20
Nodes (9): AppConfig, bindsBeyondLoopback(), DbConfig, LOOPBACK_HOSTS, envSchema, httpOrigin, LOG_LEVELS, ParsedEnv (+1 more)

### Community 46 - "Database is the last line of defence"
Cohesion: 0.18
Nodes (8): Nothing with movement history is hard-deleted, Asset status changes only through a recorded movement, Unique constraint with recovery outside aborted transaction, Append-only asset_movements and audit_log, asset_transitions allowed-lifecycle table, audit_log per-entity field allow-list, One open loan per unit (partial unique index on loan_items), Status and history never disagree (movement-trigger, no UPDATE on assets.status)

### Community 47 - "global-setup.ts"
Cohesion: 0.27
Nodes (10): MIGRATIONS_DIR, onServer(), secret(), Server, serverLock(), setup(), startContainer(), useExternalServer() (+2 more)

### Community 48 - "compilerOptions"
Cohesion: 0.20
Nodes (9): compilerOptions, jsx, lib, module, moduleResolution, noEmit, types, extends (+1 more)

### Community 49 - "loadConfig"
Cohesion: 0.27
Nodes (8): Reverse proxy decision: existing Nginx site file vs Caddy profile, wms.env server-side secrets file and variable catalogue, Prod api service (loopback-bound port), Prod opt-in Caddy proxy service, ConfigError, loadConfig(), failure(), validEnv

### Community 50 - "Partner wall (wms_partner role under row-level security)"
Cohesion: 0.22
Nodes (7): Forward-only hand-written SQL migrations with checksums, New table checklist (FK indexes, grants, RLS, schema type, EXPECTED_MIGRATION_COUNT), ActorScope (staff, partner, system) type, Plan review focus (scope never set, concurrent approvals, edited migration, DB down, bad config), Task 3: typed schema, pools and transaction wrapper, Partner wall (wms_partner role under row-level security), User kinds and roles (staff vs partner)

### Community 51 - "Netpoleon WMS product"
Cohesion: 0.22
Nodes (8): Netpoleon WMS product, Promised alerts (overdue, missing accessory, inspection, redeployment), Promised modules (inventory, borrowing, assets, inspection, reports, access), 7-step demo unit lifecycle, Idempotency-Key store, No fire-and-forget side effects (outbox with lease and bounded retry), Idempotency-Key on every logged-in mutating endpoint, Transactional outbox with SKIP LOCKED worker lease

### Community 52 - "Agent hard rules (no .env, no weakened DB guarantee, no edited migration)"
Cohesion: 0.25
Nodes (5): graphify-out code map, Definition of done checklist, Double-fire test (sequential and concurrent), Frontend in-flight guard and one idempotency key per intent, Task 5: integration and falsification (coordinator)

### Community 53 - "./tsconfig.base.json"
Cohesion: 0.29
Nodes (6): compilerOptions, customConditions, noEmit, extends, include, ./tsconfig.base.json

### Community 54 - "api/tsconfig.build.json"
Cohesion: 0.29
Nodes (6): compilerOptions, declaration, outDir, rootDir, extends, include

### Community 55 - "dependencies"
Cohesion: 0.29
Nodes (7): dependencies, @fontsource-variable/manrope, lucide-react, qrcode-generator, react, react-dom, react-router-dom

### Community 56 - "devDependencies"
Cohesion: 0.29
Nodes (7): devDependencies, @types/react, @types/react-dom, typescript, vite, @vitejs/plugin-react, vitest

### Community 57 - "Sk"
Cohesion: 0.52
Nodes (7): Sk(), SkBars(), SkCardHead(), SkFacts(), SkPage(), SkTable(), SkTabs()

### Community 59 - "config/tsconfig.build.json"
Cohesion: 0.29
Nodes (6): compilerOptions, declaration, outDir, rootDir, extends, include

### Community 60 - "contracts/tsconfig.build.json"
Cohesion: 0.29
Nodes (6): compilerOptions, declaration, outDir, rootDir, extends, include

### Community 61 - "db/tsconfig.build.json"
Cohesion: 0.29
Nodes (6): compilerOptions, declaration, outDir, rootDir, extends, include

### Community 62 - "test/fixtures.ts"
Cohesion: 0.40
Nodes (4): GOOD_PASSWORD, openDb(), TestUser, configFor()

### Community 63 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, build, dev, preview, test, typecheck

### Community 64 - "drift.test.ts"
Cohesion: 0.33
Nodes (3): ColumnShape, schemaExports, tables

### Community 65 - "db/tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, customConditions, noEmit, extends, include

### Community 66 - "context.tsx"
Cohesion: 0.50
Nodes (3): StoreContext, useStore(), useWmsState()

### Community 67 - "config/tsconfig.json"
Cohesion: 0.40
Nodes (4): compilerOptions, noEmit, extends, include

### Community 68 - "contracts/tsconfig.json"
Cohesion: 0.40
Nodes (4): compilerOptions, noEmit, extends, include

### Community 69 - ".prettierrc.json"
Cohesion: 0.40
Nodes (4): endOfLine, printWidth, singleQuote, trailingComma

### Community 70 - "tsconfig.json"
Cohesion: 0.40
Nodes (4): compilerOptions, noEmit, extends, include

### Community 71 - "useLiquidInk"
Cohesion: 0.50
Nodes (4): Tabs(), atRest(), pull(), useLiquidInk()

### Community 75 - "Every change has a written rollback and backup"
Cohesion: 0.67
Nodes (3): No destructive command without explicit yes, Every change has a written rollback and backup, Rollback by pinning previous image digest

## Knowledge Gaps
- **448 isolated node(s):** `LoginCandidate`, `LoginResult`, `BatchAction`, `Changes`, `Column` (+443 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 576 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `drizzle-orm` connect `lending.ts` to `drift.test.ts`, `auth.service.ts`, `platform.test.ts`, `app.ts`, `auth.test.ts`, `session.ts`, `client.test.ts`, `db/package.json`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **Why does `loadConfig()` connect `loadConfig` to `config/src/index.ts`, `CLAUDE.md`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **Why does `typescript` connect `package.json` to `web/package.json`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **What connects `LoginCandidate`, `LoginResult`, `BatchAction` to the rest of the system?**
  _448 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `lending.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08357685563997662 - nodes in this community are weakly interconnected._
- **Should `auth.service.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07922077922077922 - nodes in this community are weakly interconnected._
- **Should `platform.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07686932215234102 - nodes in this community are weakly interconnected._