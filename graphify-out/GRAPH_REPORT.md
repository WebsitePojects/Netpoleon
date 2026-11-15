# Graph Report - Netpoleon  (2026-11-15)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1146 nodes · 2394 edges · 73 communities (67 shown, 6 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 70 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d5d68435`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- WmsStore
- lending.ts
- CLAUDE.md
- package.json
- db/package.json
- DataTable.tsx
- config/src/index.ts
- web/package.json
- react
- selectors.ts
- ref_vitest
- ui.tsx
- seed.ts
- MigrationRunner
- dates.ts
- app.ts
- lifecycle.mjs
- controls.tsx
- hooks.ts
- store.ts
- Reports.tsx
- TransactionDetail.tsx
- Settings.tsx
- RoleBootstrapper
- Fixtures
- harness.ts
- Shell.tsx
- compilerOptions
- error-handler.ts
- auth.tsx
- contracts/src/index.ts
- Borrow.tsx
- config/package.json
- contracts/package.json
- client.ts
- api/package.json
- lesson-guard.cjs
- helpers.ts
- Database is the last line of defence
- charts.tsx
- Users.tsx
- Database
- buildApp
- Profile.tsx
- Inspection.tsx
- compilerOptions
- cli.ts
- Three-layer API: routes -> services -> repositories -> Database
- Netpoleon WMS product
- ShutdownCoordinator
- Agent hard rules (no .env, no weakened DB guarantee, no edited migration)
- No double booking (reservations_no_overlap exclusion constraint)
- ./tsconfig.base.json
- api/tsconfig.build.json
- config/tsconfig.build.json
- contracts/tsconfig.build.json
- client.test.ts
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
- Monorepo layout (apps/api, packages/config, contracts, db, infra/docker, docs)
- Security imperatives (validate at boundary, constant-time compare, no secrets in logs, server-side authz)
- Every change has a written rollback and backup
- Fingerprint PM2 and containers before and after a change
- Central idempotent posting layer

## God Nodes (most connected - your core abstractions)
1. `WmsStore` - 50 edges
2. `WmsError` - 35 edges
3. `Fixtures` - 26 edges
4. `toDateKey()` - 24 edges
5. `react` - 24 edges
6. `usePageReady()` - 23 edges
7. `WmsState` - 22 edges
8. `formatDate()` - 22 edges
9. `getTestDb()` - 21 edges
10. `lucide-react` - 19 edges

## Surprising Connections (you probably didn't know these)
- `Database.transaction(scope, fn) is the only door` --references--> `Database`  [INFERRED]
  .claude/rules/architecture.md → packages/db/src/client.ts
- `Composition root (buildApp)` --references--> `buildApp()`  [INFERRED]
  .claude/rules/architecture.md → apps/api/src/app.ts
- `Forward-only hand-written SQL migrations with checksums` --references--> `MigrationRunner`  [INFERRED]
  .claude/rules/architecture.md → packages/db/src/migrate/runner.ts
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

## Communities (73 total, 6 thin omitted)

### Community 0 - "WmsStore"
Cohesion: 0.14
Nodes (10): KeyValueStorage, normaliseCode(), required(), WmsError, WmsStore, Loan, MovementType, Unit (+2 more)

### Community 1 - "lending.ts"
Cohesion: 0.08
Nodes (50): assetMovements, assetTransitions, auditLog, notifications, assets, categories, locations, modelAccessories (+42 more)

### Community 2 - "CLAUDE.md"
Cohesion: 0.08
Nodes (20): lesson-guard Stop hook, Before ending a session that changed code, graphify-out code map, Where each kind of knowledge lives, Delivery workflow (plan first, sonnet builders, opus reviews), Commercial model (monthly subscription, IP stays with Prince IT), Netpoleon Solutions Philippines (NSPH INC.) client, Prince IT Solutions OPC (+12 more)

### Community 3 - "package.json"
Cohesion: 0.06
Nodes (36): description, devDependencies, eslint, eslint-config-prettier, @eslint/js, globals, prettier, @types/node (+28 more)

### Community 4 - "db/package.json"
Cohesion: 0.05
Nodes (36): dependencies, fastify, @fastify/helmet, fastify-plugin, @fastify/swagger, fastify-type-provider-zod, pino, @wms/config (+28 more)

### Community 5 - "DataTable.tsx"
Cohesion: 0.07
Nodes (18): App(), Protected(), BatchAction, Changes, Column, compare(), CsvCell, DataTable() (+10 more)

### Community 6 - "config/src/index.ts"
Cohesion: 0.07
Nodes (28): Composition root (buildApp), No .env* file is ever tracked, CI pnpm audit of production dependencies, CI docker image build (infra/docker/Dockerfile), CI gitleaks full-history secret scan, CI verify job (format, lint, typecheck, test), Reverse proxy decision: existing Nginx site file vs Caddy profile, wms.env server-side secrets file and variable catalogue (+20 more)

### Community 7 - "web/package.json"
Cohesion: 0.06
Nodes (31): dependencies, @fontsource-variable/manrope, lucide-react, qrcode-generator, react, react-dom, react-router-dom, devDependencies (+23 more)

### Community 8 - "react"
Cohesion: 0.10
Nodes (18): ActionDialog(), BaseProps, ReasonDialog(), ShelfDialog(), ShelfSelect(), delay(), useSubmit(), boot (+10 more)

### Community 9 - "selectors.ts"
Cohesion: 0.11
Nodes (25): ACTIVE_STATUSES, Alert, ALERT_TITLES, AlertKind, buildAlerts(), lastMovementAt(), MonthlyMovement, STATUS_LABELS (+17 more)

### Community 10 - "ref_vitest"
Cohesion: 0.17
Nodes (12): ATTACKS, TABLES, HISTORY_TRIGGERS, RLS_TABLES, SeededStatus, StaffRole, connect(), getTestDb() (+4 more)

### Community 11 - "ui.tsx"
Cohesion: 0.08
Nodes (9): ButtonProps, CATEGORY_IMAGES, Crumb, LOAN_TONES, pageWindow(), TabItem, TableFoot(), Toast (+1 more)

### Community 12 - "seed.ts"
Cohesion: 0.10
Nodes (23): AP_KIT, APPROVERS, BORROWERS, buildLocations(), buildSeed(), buildUsers(), CATEGORY_SPECS, CategorySpec (+15 more)

### Community 13 - "MigrationRunner"
Cohesion: 0.12
Nodes (12): Local development start-up procedure, Task 2: migrations, runner, role bootstrap, guarantee tests, Three database roles (wms_migrator, wms_staff, wms_partner), Dev postgres service (loopback 5432), Prod migrate one-shot service (bootstrap roles then migrate), Prod postgres service, checksumOf(), MigrationChecksumError (+4 more)

### Community 14 - "dates.ts"
Cohesion: 0.14
Nodes (17): DateField(), movementsByMonth(), addDays(), dateFormat, formatLongDate(), fromDateKey(), longDateFormat, monthFormat (+9 more)

### Community 15 - "app.ts"
Cohesion: 0.16
Nodes (13): AppDeps, healthRoutes(), okSchema, readySchema, HealthService, generateRequestId(), requestIdPlugin, SecurityHeadersOptions (+5 more)

### Community 16 - "lifecycle.mjs"
Cohesion: 0.18
Nodes (16): assert(), check(), choose(), { chromium }, dialog(), loanOf(), readState(), require (+8 more)

### Community 17 - "controls.tsx"
Cohesion: 0.19
Nodes (18): CONDITION_OPTIONS, monthTitle, Placement, Popover(), Select(), SelectOption, Sk(), SK_TABS (+10 more)

### Community 18 - "hooks.ts"
Cohesion: 0.16
Nodes (18): Tabs(), atRest(), EdgeWave, INK_LEAD, INK_TRAIL, InkEdge, prefersReducedMotion(), pull() (+10 more)

### Community 19 - "store.ts"
Cohesion: 0.18
Nodes (17): LOCATION_IDS, STATE_VERSION, InspectionInput, RegisterUnitInput, RequestInput, TRANSITIONS, UserInput, AuditEntry (+9 more)

### Community 20 - "Reports.tsx"
Cohesion: 0.17
Nodes (18): countByStatus(), MOVEMENT_LABELS, formatDate(), formatMonth(), AGE_BANDS, Borrowers(), Figure(), IdleRow (+10 more)

### Community 21 - "TransactionDetail.tsx"
Cohesion: 0.19
Nodes (15): missingAccessories(), formatDateTime(), usePageReady(), ApproveDialog(), buildSteps(), ExtendDialog(), Open, ReceiveDialog() (+7 more)

### Community 22 - "Settings.tsx"
Cohesion: 0.27
Nodes (18): CategoriesSection(), DataSection(), Draft, GeneralSection(), isSectionId(), LabelSection(), LoanSection(), LocationsSection() (+10 more)

### Community 23 - "RoleBootstrapper"
Cohesion: 0.15
Nodes (9): APP_ROLE_LIMITS, APP_ROLES, RoleBootstrapper, RoleName, RolePasswords, MIGRATIONS_DIR, secret(), setup() (+1 more)

### Community 25 - "harness.ts"
Cohesion: 0.18
Nodes (13): apps, buildProbeApp(), urls, CLOSED_PORT_URL, configFor(), DatabaseUrls, registerProbeRoutes(), TestApp (+5 more)

### Community 26 - "Shell.tsx"
Cohesion: 0.18
Nodes (16): GlobalSearch(), isActive(), NAV, NavItem, PersonMenu(), searchAll(), SearchHit, Shell() (+8 more)

### Community 27 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, exactOptionalPropertyTypes, forceConsistentCasingInFileNames, isolatedModules, lib, module, moduleResolution, noFallthroughCasesInSwitch (+8 more)

### Community 28 - "error-handler.ts"
Cohesion: 0.20
Nodes (11): AppError, describeError(), describeValidationFailure(), errorHandlerPlugin, FASTIFY_CLIENT_ERRORS, INTERNAL_ERROR, isFastifyClientError(), ProblemDescriptor (+3 more)

### Community 29 - "auth.tsx"
Cohesion: 0.20
Nodes (12): AuthContext, AuthProvider(), AuthValue, readSession(), useAuth(), useCurrentUser(), writeSession(), can() (+4 more)

### Community 30 - "contracts/src/index.ts"
Cohesion: 0.27
Nodes (9): RFC-9457, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, Page, pageOf(), PageQuery, pageQuerySchema, Problem (+1 more)

### Community 31 - "Borrow.tsx"
Cohesion: 0.24
Nodes (11): daysOverdue(), LOAN_STATUS_LABELS, ModelAvailability, modelKey(), daysBetween(), Borrow(), isTabId(), PURPOSES (+3 more)

### Community 32 - "config/package.json"
Cohesion: 0.15
Nodes (12): dependencies, zod, exports, zod, name, private, scripts, build (+4 more)

### Community 33 - "contracts/package.json"
Cohesion: 0.15
Nodes (12): dependencies, zod, exports, zod, name, private, scripts, build (+4 more)

### Community 34 - "client.ts"
Cohesion: 0.29
Nodes (7): EXPECTED_MIGRATION_COUNT, Tx, schema, ActorScope, assertValidScope(), InvalidScopeError, scopeSettings()

### Community 35 - "api/package.json"
Cohesion: 0.17
Nodes (11): devDependencies, testcontainers, @testcontainers/postgresql, tsx, tsx, zod, name, private (+3 more)

### Community 36 - "lesson-guard.cjs"
Cohesion: 0.21
Nodes (8): block(), changedFiles(), { execSync }, fs, LESSONS_REL, main(), mtime(), path

### Community 37 - "helpers.ts"
Cohesion: 0.33
Nodes (9): bootstrapperFor(), createScratchDatabase(), passwordOf(), ProvidedContext, ScratchDatabase, vitest, withClient(), withDatabase() (+1 more)

### Community 38 - "Database is the last line of defence"
Cohesion: 0.18
Nodes (8): Nothing with movement history is hard-deleted, Asset status changes only through a recorded movement, Unique constraint with recovery outside aborted transaction, Append-only asset_movements and audit_log, asset_transitions allowed-lifecycle table, audit_log per-entity field allow-list, One open loan per unit (partial unique index on loan_items), Status and history never disagree (movement-trigger, no UPDATE on assets.status)

### Community 39 - "charts.tsx"
Cohesion: 0.24
Nodes (8): BarGroup, BarSeries, Donut(), GroupedBars(), niceCeiling(), percent(), Slice, useCountUp()

### Community 40 - "Users.tsx"
Cohesion: 0.29
Nodes (10): formatRelative(), ActivityLog(), isTabId(), RoleMatrix(), ROLES, TabId, TABS, UserDialog() (+2 more)

### Community 41 - "Database"
Cohesion: 0.22
Nodes (5): ActorScope (staff, partner, system) type, Task 3: typed schema, pools and transaction wrapper, Partner wall (wms_partner role under row-level security), User kinds and roles (staff vs partner), Database

### Community 42 - "buildApp"
Cohesion: 0.33
Nodes (6): buildApp(), createLogger(), REDACTED_PATHS, main(), readConfigOrExit(), pino

### Community 43 - "Profile.tsx"
Cohesion: 0.29
Nodes (8): Action, ACTION_LABELS, GRANTS, MANAGER_ACTIONS, ROLE_LABELS, ROLE_SUMMARIES, WAREHOUSE_ACTIONS, THEMES

### Community 44 - "Inspection.tsx"
Cohesion: 0.27
Nodes (8): CHECKS, InspectDialog(), Inspection(), isTabId(), OUTCOMES, StartButton(), TAB_STATUS, TabId

### Community 45 - "compilerOptions"
Cohesion: 0.20
Nodes (9): compilerOptions, jsx, lib, module, moduleResolution, noEmit, types, extends (+1 more)

### Community 46 - "cli.ts"
Cohesion: 0.27
Nodes (6): bootstrap(), COMMANDS, migrate(), MIGRATIONS_DIR, MissingEnvError, requireEnv()

### Community 47 - "Three-layer API: routes -> services -> repositories -> Database"
Cohesion: 0.22
Nodes (4): Database.transaction(scope, fn) is the only door, Deploy gaps: backups, first admin, image publishing, vulnerability scan, Runbook placeholders: restore, rotate secret, first administrator, Encrypted nightly backups with rehearsed restore

### Community 48 - "Netpoleon WMS product"
Cohesion: 0.22
Nodes (8): Netpoleon WMS product, Promised alerts (overdue, missing accessory, inspection, redeployment), Promised modules (inventory, borrowing, assets, inspection, reports, access), 7-step demo unit lifecycle, Idempotency-Key store, No fire-and-forget side effects (outbox with lease and bounded retry), Idempotency-Key on every logged-in mutating endpoint, Transactional outbox with SKIP LOCKED worker lease

### Community 49 - "ShutdownCoordinator"
Cohesion: 0.32
Nodes (3): ShutdownCoordinator, SIGNALS, fastify

### Community 50 - "Agent hard rules (no .env, no weakened DB guarantee, no edited migration)"
Cohesion: 0.29
Nodes (5): Forward-only hand-written SQL migrations with checksums, New table checklist (FK indexes, grants, RLS, schema type, EXPECTED_MIGRATION_COUNT), Double-fire test (sequential and concurrent), Frontend in-flight guard and one idempotency key per intent, Plan review focus (scope never set, concurrent approvals, edited migration, DB down, bad config)

### Community 51 - "No double booking (reservations_no_overlap exclusion constraint)"
Cohesion: 0.29
Nodes (4): Conditional state-transition UPDATE, Elevated availability count function (counts only, no foreign rows), No double booking (reservations_no_overlap exclusion constraint), Reservation turnaround buffer and uncollected-reservation expiry

### Community 52 - "./tsconfig.base.json"
Cohesion: 0.29
Nodes (6): compilerOptions, customConditions, noEmit, extends, include, ./tsconfig.base.json

### Community 53 - "api/tsconfig.build.json"
Cohesion: 0.29
Nodes (6): compilerOptions, declaration, outDir, rootDir, extends, include

### Community 54 - "config/tsconfig.build.json"
Cohesion: 0.29
Nodes (6): compilerOptions, declaration, outDir, rootDir, extends, include

### Community 55 - "contracts/tsconfig.build.json"
Cohesion: 0.29
Nodes (6): compilerOptions, declaration, outDir, rootDir, extends, include

### Community 56 - "client.test.ts"
Cohesion: 0.29
Nodes (3): configFor(), POOL_DEFAULTS, stateOfQuery()

### Community 57 - "db/tsconfig.build.json"
Cohesion: 0.29
Nodes (6): compilerOptions, declaration, outDir, rootDir, extends, include

### Community 58 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, build, dev, start, test, typecheck

### Community 59 - "drift.test.ts"
Cohesion: 0.33
Nodes (3): ColumnShape, schemaExports, tables

### Community 60 - "db/tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, customConditions, noEmit, extends, include

### Community 61 - "context.tsx"
Cohesion: 0.50
Nodes (3): StoreContext, useStore(), useWmsState()

### Community 62 - "useTheme"
Cohesion: 0.70
Nodes (5): applyTheme(), readTheme(), resolvesDark(), subscribeTheme(), useTheme()

### Community 63 - "config/tsconfig.json"
Cohesion: 0.40
Nodes (4): compilerOptions, noEmit, extends, include

### Community 64 - "contracts/tsconfig.json"
Cohesion: 0.40
Nodes (4): compilerOptions, noEmit, extends, include

### Community 65 - ".prettierrc.json"
Cohesion: 0.40
Nodes (4): endOfLine, printWidth, singleQuote, trailingComma

### Community 66 - "tsconfig.json"
Cohesion: 0.40
Nodes (4): compilerOptions, noEmit, extends, include

### Community 69 - "Every change has a written rollback and backup"
Cohesion: 0.67
Nodes (3): No destructive command without explicit yes, Every change has a written rollback and backup, Rollback by pinning previous image digest

## Knowledge Gaps
- **389 isolated node(s):** `SeededStatus`, `StaffRole`, `ButtonProps`, `Crumb`, `TabItem` (+384 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 496 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `WmsError` connect `WmsStore` to `DataTable.tsx`, `Users.tsx`, `selectors.ts`, `dates.ts`, `hooks.ts`, `store.ts`, `Borrow.tsx`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **Why does `drizzle-orm` connect `lending.ts` to `client.test.ts`, `client.ts`, `drift.test.ts`, `db/package.json`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **Why does `@wms/contracts` connect `harness.ts` to `api/package.json`, `error-handler.ts`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **What connects `SeededStatus`, `StaffRole`, `ButtonProps` to the rest of the system?**
  _389 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `WmsStore` be split into smaller, more focused modules?**
  _Cohesion score 0.1360655737704918 - nodes in this community are weakly interconnected._
- **Should `lending.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08357685563997662 - nodes in this community are weakly interconnected._
- **Should `CLAUDE.md` be split into smaller, more focused modules?**
  _Cohesion score 0.07729468599033816 - nodes in this community are weakly interconnected._