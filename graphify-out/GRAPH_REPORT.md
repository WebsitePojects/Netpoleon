# Graph Report - Netpoleon  (2026-11-15)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1865 nodes · 4477 edges · 91 communities (77 shown, 14 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 272 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a0b50be5`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Reports.tsx
- CLAUDE.md
- WmsStore
- auth.service.ts
- store.ts
- AppError
- AssetsRepository
- DemoBackend
- @wms/db
- app.ts
- hooks.ts
- auth.test.ts
- helpers.ts
- Inspection.tsx
- stock.ts
- api/package.json
- @wms/contracts
- package.json
- Users.tsx
- Backend
- config/src/index.ts
- useSubmit
- HttpBackend
- Partners.tsx
- client.test.ts
- db/package.json
- ui.tsx
- No double booking (reservations_no_overlap exclusion constraint)
- platform.test.ts
- backend/context.tsx
- contracts/src/index.ts
- people.ts
- accountability.ts
- Settings.tsx
- worker.ts
- App.tsx
- demo.ts
- DataTable.tsx
- RoleBootstrapper
- lifecycle.mjs
- Fixtures
- compilerOptions
- harness.ts
- contracts/package.json
- contracts/src/client.ts
- pagination.ts
- Status and history never disagree (movement-trigger, no UPDATE on assets.status)
- MigrationRunner
- api-mode.mjs
- web/package.json
- config/package.json
- lending.ts
- identity.ts
- controls.tsx
- store.test.ts
- lesson-guard.cjs
- runner.test.ts
- PartnersRepository
- Unit
- compilerOptions
- UsersRepository
- global-setup.ts
- error-handler.ts
- http.ts
- dependencies
- plumbing.ts
- api/tsconfig.build.json
- devDependencies
- Sk
- KeyValueStorage
- config/tsconfig.build.json
- contracts/tsconfig.build.json
- db/tsconfig.build.json
- api/tsconfig.json
- scripts
- ./tsconfig.base.json
- drift.test.ts
- db/tsconfig.json
- ShutdownCoordinator
- data/context.tsx
- contracts/tsconfig.json
- .prettierrc.json
- tsconfig.json
- Monorepo layout (apps/api, packages/config, contracts, db, infra/docker, docs)
- Security imperatives (validate at boundary, constant-time compare, no secrets in logs, server-side authz)
- Every change has a written rollback and backup
- .units
- Fingerprint PM2 and containers before and after a change
- Central idempotent posting layer

## God Nodes (most connected - your core abstractions)
1. `WmsStore` - 69 edges
2. `WmsError` - 57 edges
3. `Backend` - 54 edges
4. `DemoBackend` - 50 edges
5. `@wms/contracts` - 43 edges
6. `AppError` - 41 edges
7. `HttpBackend` - 38 edges
8. `RequestContext` - 36 edges
9. `@wms/db` - 33 edges
10. `buildApp()` - 32 edges

## Surprising Connections (you probably didn't know these)
- `Database.transaction(scope, fn) is the only door` --references--> `Database`  [INFERRED]
  .claude/rules/architecture.md → packages/db/src/client.ts
- `Task 3: typed schema, pools and transaction wrapper` --implements--> `Database`  [INFERRED]
  docs/superpowers/plans/2026-11-13-foundation-scaffold.md → packages/db/src/client.ts
- `RFC 9457 problem+json error envelope and AppError` --references--> `AppError`  [INFERRED]
  docs/superpowers/plans/2026-11-13-foundation-scaffold.md → apps/api/src/errors.ts
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

## Communities (91 total, 14 thin omitted)

### Community 0 - "Reports.tsx"
Cohesion: 0.06
Nodes (73): DateField(), ACTIVE_STATUSES, Alert, ALERT_TITLES, AlertKind, buildAlerts(), countByStatus(), daysOverdue() (+65 more)

### Community 1 - "CLAUDE.md"
Cohesion: 0.06
Nodes (24): lesson-guard Stop hook, Before ending a session that changed code, graphify-out code map, Where each kind of knowledge lives, Database.transaction(scope, fn) is the only door, Delivery workflow (plan first, sonnet builders, opus reviews), Commercial model (monthly subscription, IP stays with Prince IT), Netpoleon Solutions Philippines (NSPH INC.) client (+16 more)

### Community 2 - "WmsStore"
Cohesion: 0.18
Nodes (6): normaliseCode(), required(), WmsError, WmsStore, Loan, WmsState

### Community 3 - "auth.service.ts"
Cohesion: 0.07
Nodes (19): AuthRepository, SessionRow, INVALID_LOGIN, LIMITS, LINK_INVALID, LoginResult, SYSTEM_SCOPE, toSessionUser() (+11 more)

### Community 4 - "store.ts"
Cohesion: 0.07
Nodes (47): AP_KIT, APPROVERS, BORROWERS, buildLocations(), buildPartners(), buildSeed(), buildUsers(), CATEGORY_SPECS (+39 more)

### Community 5 - "AppError"
Cohesion: 0.18
Nodes (15): AppError, actorOf(), AssetsService, explain(), duplicateAs409(), duplicate(), PartnersService, actorOf() (+7 more)

### Community 6 - "AssetsRepository"
Cohesion: 0.07
Nodes (24): AISLES, KITS, location(), main(), MODELS, PARTNERS, STAFF, createLogger() (+16 more)

### Community 7 - "DemoBackend"
Cohesion: 0.11
Nodes (5): delay(), DemoBackend, fromGrade(), modelId(), Partner

### Community 8 - "@wms/db"
Cohesion: 0.11
Nodes (23): argsSchema, NOT_FOUND, Refusal, LoginCandidate, userColumns, PATHS, TOKEN_TTL_HOURS, parent (+15 more)

### Community 9 - "app.ts"
Cohesion: 0.08
Nodes (23): AppDeps, buildApp(), main(), AuthService, AuthTokens, CatalogRepository, CatalogService, healthRoutes() (+15 more)

### Community 10 - "hooks.ts"
Cohesion: 0.09
Nodes (39): GlobalSearch(), isActive(), NAV, NavItem, PersonMenu(), searchAll(), SearchHit, Shell() (+31 more)

### Community 11 - "auth.test.ts"
Cohesion: 0.11
Nodes (32): apps, db, latestEmail(), newApp(), requestReset(), tokenOf(), urls(), createModel() (+24 more)

### Community 12 - "helpers.ts"
Cohesion: 0.15
Nodes (22): ATTACKS, TABLES, HISTORY_TRIGGERS, RLS_TABLES, SeededStatus, StaffRole, bootstrapperFor(), connect() (+14 more)

### Community 13 - "Inspection.tsx"
Cohesion: 0.07
Nodes (22): missingAccessories(), boot, root, store, Guide, GUIDES, Help(), matches() (+14 more)

### Community 14 - "stock.ts"
Cohesion: 0.05
Nodes (37): Asset, ASSET_SORTS, ASSET_STATUSES, assetCodeParamsSchema, AssetDetail, assetDetailSchema, AssetListQuery, assetListQuerySchema (+29 more)

### Community 15 - "api/package.json"
Cohesion: 0.05
Nodes (36): dependencies, drizzle-orm, fastify, @fastify/helmet, fastify-plugin, @fastify/swagger, fastify-type-provider-zod, pino (+28 more)

### Community 16 - "@wms/contracts"
Cohesion: 0.16
Nodes (29): assetRoutes(), repairedBodySchema, auditRoutes(), Cursor, decode(), accepted, authRoutes(), userResponse (+21 more)

### Community 17 - "package.json"
Cohesion: 0.06
Nodes (36): description, devDependencies, eslint, eslint-config-prettier, @eslint/js, globals, prettier, @types/node (+28 more)

### Community 18 - "Users.tsx"
Cohesion: 0.10
Nodes (30): AuthContext, AuthProvider(), AuthValue, useAuth(), useCurrentUser(), onUnauthorized(), Action, ACTION_LABELS (+22 more)

### Community 20 - "config/src/index.ts"
Cohesion: 0.07
Nodes (28): Composition root (buildApp), No .env* file is ever tracked, CI pnpm audit of production dependencies, CI docker image build (infra/docker/Dockerfile), CI gitleaks full-history secret scan, CI verify job (format, lint, typecheck, test), Reverse proxy decision: existing Nginx site file vs Caddy profile, wms.env server-side secrets file and variable catalogue (+20 more)

### Community 21 - "useSubmit"
Cohesion: 0.09
Nodes (23): BarGroup, BarSeries, Donut(), GroupedBars(), niceCeiling(), percent(), Slice, ActionDialog() (+15 more)

### Community 23 - "Partners.tsx"
Cohesion: 0.11
Nodes (26): LOAN_STATUS_LABELS, MOVEMENT_LABELS, API_MOVEMENTS, ASSET_STATUS_LABELS, FILTER_STATUSES, GRADE_LABELS, GRADE_OPTIONS, movementLabel() (+18 more)

### Community 24 - "client.test.ts"
Cohesion: 0.13
Nodes (13): Database, DatabaseOptions, EXPECTED_MIGRATION_COUNT, observed(), Tx, schema, ActorScope, assertValidScope() (+5 more)

### Community 25 - "db/package.json"
Cohesion: 0.08
Nodes (22): dependencies, drizzle-orm, pg, @wms/config, devDependencies, testcontainers, @testcontainers/postgresql, tsx (+14 more)

### Community 26 - "ui.tsx"
Cohesion: 0.08
Nodes (10): ButtonProps, CATEGORY_IMAGES, Crumb, LOAN_TONES, pageWindow(), STATUS_TONES, TabItem, TableFoot() (+2 more)

### Community 27 - "No double booking (reservations_no_overlap exclusion constraint)"
Cohesion: 0.09
Nodes (18): Forward-only hand-written SQL migrations with checksums, New table checklist (FK indexes, grants, RLS, schema type, EXPECTED_MIGRATION_COUNT), Nothing with movement history is hard-deleted, Conditional state-transition UPDATE, Double-fire test (sequential and concurrent), Frontend in-flight guard and one idempotency key per intent, Unique constraint with recovery outside aborted transaction, ActorScope (staff, partner, system) type (+10 more)

### Community 28 - "platform.test.ts"
Cohesion: 0.15
Nodes (16): redactFields(), OutboxMessage, OutboxTopic, backoffSeconds(), Claimed, KNOWN_TOPICS, MAX_ATTEMPTS, renderEmail() (+8 more)

### Community 29 - "backend/context.tsx"
Cohesion: 0.11
Nodes (9): BackendContext, listeners, Resource, useIntent(), User, K, randomToken(), rotr() (+1 more)

### Community 30 - "contracts/src/index.ts"
Cohesion: 0.14
Nodes (20): changePasswordBodySchema, email, forgotPasswordBodySchema, LoginBody, loginBodySchema, password, SessionUser, sessionUserSchema (+12 more)

### Community 31 - "people.ts"
Cohesion: 0.08
Nodes (21): AuditEntry, auditEntrySchema, auditQuerySchema, Contact, contactBodySchema, contactParamsSchema, contactSchema, editPartnerBodySchema (+13 more)

### Community 32 - "accountability.ts"
Cohesion: 0.13
Nodes (21): assetMovements, assetTransitions, auditLog, notifications, assets, categories, locations, modelAccessories (+13 more)

### Community 33 - "Settings.tsx"
Cohesion: 0.21
Nodes (21): CategoriesSection(), CategoryDialog(), DataSection(), Draft, GeneralSection(), isSectionId(), KIND_LABELS, LabelSection() (+13 more)

### Community 34 - "worker.ts"
Cohesion: 0.15
Nodes (8): OutboxDispatcher, beat(), CLEANUP_JOBS, Job, runExclusive(), LogMailer, MailerUnavailableError, main()

### Community 36 - "demo.ts"
Cohesion: 0.13
Nodes (12): sessionUserOf(), toGrade(), writeSession(), NewModel, PartnerLoan, UnitDetailView, UnitLoan, UnitPage (+4 more)

### Community 37 - "DataTable.tsx"
Cohesion: 0.13
Nodes (18): BatchAction, Changes, Column, compare(), CsvCell, DataTable(), RemoteFoot(), RemotePaging (+10 more)

### Community 38 - "RoleBootstrapper"
Cohesion: 0.14
Nodes (11): APP_ROLE_LIMITS, APP_ROLES, RoleBootstrapper, RoleName, RolePasswords, bootstrap(), COMMANDS, migrate() (+3 more)

### Community 39 - "lifecycle.mjs"
Cohesion: 0.19
Nodes (16): assert(), check(), choose(), { chromium }, dialog(), loanOf(), readState(), require (+8 more)

### Community 41 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, exactOptionalPropertyTypes, forceConsistentCasingInFileNames, isolatedModules, lib, module, moduleResolution, noFallthroughCasesInSwitch (+8 more)

### Community 42 - "harness.ts"
Cohesion: 0.18
Nodes (12): apps, buildProbeApp(), urls, CLOSED_PORT_URL, DatabaseUrls, registerProbeRoutes(), TestApp, TestAppOptions (+4 more)

### Community 43 - "contracts/package.json"
Cohesion: 0.12
Nodes (15): default, types, wms-source, dependencies, zod, exports, ./client, name (+7 more)

### Community 44 - "contracts/src/client.ts"
Cohesion: 0.22
Nodes (13): CLIENT_HEADER, SESSION_COOKIE, Action, ACTIONS, can(), GRANTS, isStaffRole(), PARTNER_ROLES (+5 more)

### Community 45 - "pagination.ts"
Cohesion: 0.14
Nodes (9): RFC-9457, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, Page, pageOf(), PageQuery, pageQuerySchema, Problem (+1 more)

### Community 46 - "Status and history never disagree (movement-trigger, no UPDATE on assets.status)"
Cohesion: 0.14
Nodes (11): Asset status changes only through a recorded movement, Netpoleon WMS product, Promised alerts (overdue, missing accessory, inspection, redeployment), Promised modules (inventory, borrowing, assets, inspection, reports, access), 7-step demo unit lifecycle, Idempotency-Key store, No fire-and-forget side effects (outbox with lease and bounded retry), asset_transitions allowed-lifecycle table (+3 more)

### Community 47 - "MigrationRunner"
Cohesion: 0.21
Nodes (7): Local development start-up procedure, Task 2: migrations, runner, role bootstrap, guarantee tests, Three database roles (wms_migrator, wms_staff, wms_partner), Dev postgres service (loopback 5432), Prod migrate one-shot service (bootstrap roles then migrate), Prod postgres service, MigrationRunner

### Community 48 - "api-mode.mjs"
Cohesion: 0.15
Nodes (6): code(), { chromium }, errors, require, results, tag

### Community 49 - "web/package.json"
Cohesion: 0.17
Nodes (11): name, private, type, version, @fontsource-variable/manrope, qrcode-generator, react-dom, @types/react (+3 more)

### Community 50 - "config/package.json"
Cohesion: 0.15
Nodes (12): dependencies, zod, exports, zod, name, private, scripts, build (+4 more)

### Community 51 - "lending.ts"
Cohesion: 0.19
Nodes (11): bytea, citext, daterange, primaryId(), requestStatus, partnerOrgs, loanExtensions, loanRequestItems (+3 more)

### Community 52 - "identity.ts"
Cohesion: 0.23
Nodes (11): authTokenPurpose, extensionStatus, orgStatus, orgType, reservationStatus, userKind, userRole, userStatus (+3 more)

### Community 53 - "controls.tsx"
Cohesion: 0.21
Nodes (11): CONDITION_OPTIONS, monthTitle, Placement, Popover(), Select(), SelectOption, SK_TABS, SkPageKind (+3 more)

### Community 54 - "store.test.ts"
Cohesion: 0.17
Nodes (5): fileRequest(), MemoryStorage, NOW, PASSING_INSPECTION, TODAY

### Community 55 - "lesson-guard.cjs"
Cohesion: 0.21
Nodes (8): block(), changedFiles(), { execSync }, fs, LESSONS_REL, main(), mtime(), path

### Community 56 - "runner.test.ts"
Cohesion: 0.21
Nodes (5): checksumOf(), MigrationChecksumError, MigrationFile, MigrationResult, MIGRATIONS_DIR

### Community 58 - "Unit"
Cohesion: 0.25
Nodes (7): AssetLabel(), Barcode(), Settings, Unit, Barcode, code128(), PATTERNS

### Community 59 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, customConditions, jsx, lib, module, moduleResolution, noEmit, types (+2 more)

### Community 60 - "UsersRepository"
Cohesion: 0.22
Nodes (4): Raw, toUser(), userColumns, UsersRepository

### Community 61 - "global-setup.ts"
Cohesion: 0.31
Nodes (9): MIGRATIONS_DIR, onServer(), secret(), Server, serverLock(), setup(), startContainer(), useExternalServer() (+1 more)

### Community 62 - "error-handler.ts"
Cohesion: 0.33
Nodes (8): describeError(), describeValidationFailure(), errorHandlerPlugin, FASTIFY_CLIENT_ERRORS, INTERNAL_ERROR, isFastifyClientError(), ProblemDescriptor, toProblem()

### Community 63 - "http.ts"
Cohesion: 0.22
Nodes (5): ApiError, Method, Problem, unauthorizedListeners, Invitation

### Community 64 - "dependencies"
Cohesion: 0.25
Nodes (8): dependencies, @fontsource-variable/manrope, lucide-react, qrcode-generator, react, react-dom, react-router-dom, @wms/contracts

### Community 65 - "plumbing.ts"
Cohesion: 0.25
Nodes (7): outboxStatus, users, counters, idempotencyKeys, outbox, settings, workerHeartbeats

### Community 66 - "api/tsconfig.build.json"
Cohesion: 0.29
Nodes (6): compilerOptions, declaration, outDir, rootDir, extends, include

### Community 67 - "devDependencies"
Cohesion: 0.29
Nodes (7): devDependencies, @types/react, @types/react-dom, typescript, vite, @vitejs/plugin-react, vitest

### Community 68 - "Sk"
Cohesion: 0.52
Nodes (7): Sk(), SkBars(), SkCardHead(), SkFacts(), SkPage(), SkTable(), SkTabs()

### Community 70 - "config/tsconfig.build.json"
Cohesion: 0.29
Nodes (6): compilerOptions, declaration, outDir, rootDir, extends, include

### Community 71 - "contracts/tsconfig.build.json"
Cohesion: 0.29
Nodes (6): compilerOptions, declaration, outDir, rootDir, extends, include

### Community 72 - "db/tsconfig.build.json"
Cohesion: 0.29
Nodes (6): compilerOptions, declaration, outDir, rootDir, extends, include

### Community 73 - "api/tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, customConditions, noEmit, extends, include

### Community 74 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, build, dev, preview, test, typecheck

### Community 75 - "./tsconfig.base.json"
Cohesion: 0.33
Nodes (5): compilerOptions, noEmit, extends, include, ./tsconfig.base.json

### Community 76 - "drift.test.ts"
Cohesion: 0.33
Nodes (3): ColumnShape, schemaExports, tables

### Community 77 - "db/tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, customConditions, noEmit, extends, include

### Community 79 - "data/context.tsx"
Cohesion: 0.50
Nodes (3): StoreContext, useStore(), useWmsState()

### Community 80 - "contracts/tsconfig.json"
Cohesion: 0.40
Nodes (4): compilerOptions, noEmit, extends, include

### Community 81 - ".prettierrc.json"
Cohesion: 0.40
Nodes (4): endOfLine, printWidth, singleQuote, trailingComma

### Community 82 - "tsconfig.json"
Cohesion: 0.40
Nodes (4): compilerOptions, noEmit, extends, include

### Community 85 - "Every change has a written rollback and backup"
Cohesion: 0.67
Nodes (3): No destructive command without explicit yes, Every change has a written rollback and backup, Rollback by pinning previous image digest

## Knowledge Gaps
- **548 isolated node(s):** `MonthlyMovement`, `StatusCounts`, `TabId`, `TabId`, `KpiSpec` (+543 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 739 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `@wms/contracts` connect `@wms/contracts` to `auth.service.ts`, `store.ts`, `AssetsRepository`, `@wms/db`, `app.ts`, `auth.test.ts`, `api/package.json`, `Users.tsx`, `useSubmit`, `Partners.tsx`, `ui.tsx`, `Settings.tsx`, `demo.ts`, `harness.ts`, `web/package.json`, `Unit`, `UsersRepository`, `error-handler.ts`, `http.ts`?**
  _High betweenness centrality (0.304) - this node is a cross-community bridge._
- **Why does `vitest` connect `helpers.ts` to `runner.test.ts`, `harness.ts`, `auth.test.ts`, `drift.test.ts`, `pagination.ts`, `web/package.json`, `config/src/index.ts`, `store.test.ts`, `client.test.ts`, `Unit`, `platform.test.ts`, `global-setup.ts`?**
  _High betweenness centrality (0.175) - this node is a cross-community bridge._
- **Why does `zod` connect `@wms/contracts` to `@wms/db`, `app.ts`, `harness.ts`, `contracts/package.json`, `pagination.ts`, `stock.ts`, `api/package.json`, `config/src/index.ts`, `platform.test.ts`, `contracts/src/index.ts`, `people.ts`?**
  _High betweenness centrality (0.100) - this node is a cross-community bridge._
- **What connects `MonthlyMovement`, `StatusCounts`, `TabId` to the rest of the system?**
  _548 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Reports.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.06383619391749473 - nodes in this community are weakly interconnected._
- **Should `CLAUDE.md` be split into smaller, more focused modules?**
  _Cohesion score 0.059932659932659935 - nodes in this community are weakly interconnected._
- **Should `auth.service.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07450980392156863 - nodes in this community are weakly interconnected._