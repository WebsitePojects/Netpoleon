# Runbook

Operational procedures. A heading marked "written when the feature lands" is a placeholder: do
not improvise the procedure from guesswork. Deploying is covered by `docs/DEPLOY-vps.md`.

## Local development start-up

Prerequisites: Node 24 (see `.nvmrc`), Docker Desktop running, and Git Bash or PowerShell.
pnpm is not installed globally; always call it through corepack: `corepack pnpm <command>`.

No env file exists in this repository, by design. Configuration for local runs lives in your
shell session only, and the values below are throwaway.

1. **Install dependencies.**

   ```bash
   corepack pnpm install
   ```

2. **Generate throwaway secrets for this shell session.** Hex keeps them safe to place inside
   connection URLs.

   Git Bash:

   ```bash
   export POSTGRES_PASSWORD=$(openssl rand -hex 16)
   export WMS_MIGRATOR_PASSWORD=$(openssl rand -hex 16)
   export WMS_STAFF_PASSWORD=$(openssl rand -hex 16)
   export WMS_PARTNER_PASSWORD=$(openssl rand -hex 16)
   ```

   PowerShell:

   ```powershell
   function New-Secret { $b = New-Object byte[] 16; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); -join ($b | ForEach-Object { $_.ToString('x2') }) }
   $env:POSTGRES_PASSWORD = New-Secret
   $env:WMS_MIGRATOR_PASSWORD = New-Secret
   $env:WMS_STAFF_PASSWORD = New-Secret
   $env:WMS_PARTNER_PASSWORD = New-Secret
   ```

   A new shell needs new values, and a database volume created with the old values will not
   accept them: run step 3 with `down -v` first if you start over.

3. **Start the local database.** It listens on `127.0.0.1:5432` only.

   ```bash
   docker compose -f infra/docker/compose.dev.yml up -d --wait
   ```

   To discard the local database entirely: `docker compose -f infra/docker/compose.dev.yml down -v`.

4. **Create the database roles and apply migrations.** Both commands print file names and counts,
   never a connection string.

   ```bash
   export DATABASE_URL_SUPERUSER="postgres://postgres:${POSTGRES_PASSWORD}@127.0.0.1:5432/wms"
   export DATABASE_URL_MIGRATOR="postgres://wms_migrator:${WMS_MIGRATOR_PASSWORD}@127.0.0.1:5432/wms"
   corepack pnpm --filter @wms/db bootstrap
   corepack pnpm --filter @wms/db migrate
   ```

   In PowerShell, assign the same two variables with `$env:NAME = "..."` and the same values.

5. **Start the API.**

   ```bash
   export NODE_ENV=development
   export APP_ORIGIN=http://localhost:5173
   export DATABASE_URL_STAFF="postgres://wms_staff:${WMS_STAFF_PASSWORD}@127.0.0.1:5432/wms"
   export DATABASE_URL_PARTNER="postgres://wms_partner:${WMS_PARTNER_PASSWORD}@127.0.0.1:5432/wms"
   corepack pnpm --filter @wms/api dev
   ```

   If a required variable is missing or malformed, the process exits with the variable's
   **name** and never its value.

6. **Check it.** `http://127.0.0.1:3000/healthz` answers `{"status":"ok"}` as soon as the process
   is up. `http://127.0.0.1:3000/readyz` answers `{"status":"ready"}` only when the database is
   reachable and every migration is applied.

### Running the checks

```bash
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
```

Database and API tests start their own throwaway PostgreSQL through Testcontainers, so Docker
must be running. They need no secrets and no env file.

## Restore from backup

Written when the feature lands (build order step 9).

## Rotate a secret

Written when the feature lands.

## Create the first administrator

Written when the feature lands (build order step 4, auth).
