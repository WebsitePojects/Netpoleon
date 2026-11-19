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

3. **Start the local database.** It listens on loopback only, port 5432 unless
   `WMS_DEV_DB_PORT` says otherwise (use 5433 if another Postgres already holds 5432).

   ```bash
   docker compose -f infra/docker/compose.dev.yml up -d --wait
   ```

   To discard the local database entirely: `docker compose -f infra/docker/compose.dev.yml down -v`.

4. **Create the database roles and apply migrations.** Both commands print file names and counts,
   never a connection string.

   ```bash
   export DATABASE_URL_SUPERUSER="postgres://postgres:${POSTGRES_PASSWORD}@127.0.0.1:${WMS_DEV_DB_PORT:-5432}/wms"
   export DATABASE_URL_MIGRATOR="postgres://wms_migrator:${WMS_MIGRATOR_PASSWORD}@127.0.0.1:${WMS_DEV_DB_PORT:-5432}/wms"
   corepack pnpm --filter @wms/db bootstrap
   corepack pnpm --filter @wms/db migrate
   ```

   In PowerShell, assign the same two variables with `$env:NAME = "..."` and the same values.

5. **Load the demo data** (development only; it refuses in production). It creates the four
   demo users (`lara` admin, `tina` manager, `marco` warehouse, `audit` auditor) with the demo
   password from the web plan, about 480 units and transactions in every stage.

   ```bash
   NODE_ENV=development corepack pnpm --filter @wms/api seed:dev
   ```

6. **Run the API, the worker and the console**, each in its own shell with the same variables:

   ```bash
   export NODE_ENV=development APP_ORIGIN=http://localhost:5173
   export DATABASE_URL_STAFF="postgres://wms_staff:${WMS_STAFF_PASSWORD}@127.0.0.1:${WMS_DEV_DB_PORT:-5432}/wms"
   export DATABASE_URL_PARTNER="postgres://wms_partner:${WMS_PARTNER_PASSWORD}@127.0.0.1:${WMS_DEV_DB_PORT:-5432}/wms"
   corepack pnpm --filter @wms/api dev        # API on 127.0.0.1:3000
   corepack pnpm --filter @wms/api worker     # outbox and scheduled jobs
   corepack pnpm --filter @wms/web dev        # console on http://localhost:5173 (proxies /api)
   ```

   A missing or malformed variable stops the process with the variable's **name**, never its
   value. Open `http://localhost:5173`, not `127.0.0.1:5173`: the CSRF check compares the
   browser's origin with `APP_ORIGIN` exactly.

7. **Check it.** `http://127.0.0.1:3000/readyz` answers `{"status":"ready"}` only when the
   database is reachable and every migration is applied.

## Running the checks

```bash
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
```

Database and API tests start their own throwaway PostgreSQL through Testcontainers, so Docker
must be running. They need no secrets and no env file.

## Restore from backup

Backups are written nightly by `/opt/wms/backup.sh`, encrypted with `/opt/wms/backup.key`. The
weekly `restore-check.sh` proves the newest one restores; run it by hand before trusting a
backup you are about to need:

```bash
/opt/wms/restore-check.sh /opt/wms/backups/wms-<timestamp>.dump.enc
```

To restore over the live database (data since the backup is lost — confirm with the owner):

1. Fingerprint the server (`docs/DEPLOY-vps.md` section 5) and stop the app containers only:
   `docker compose -p wms --env-file wms.env -f compose.prod.yml stop web api worker`.
2. Restore into a fresh database, then swap names:
   ```bash
   C="docker compose -p wms --env-file wms.env -f compose.prod.yml"
   $C exec -T postgres psql -U postgres -c "CREATE DATABASE wms_restored"
   openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass file:/opt/wms/backup.key \
     -in /opt/wms/backups/wms-<timestamp>.dump.enc | $C exec -T postgres pg_restore -U postgres -d wms_restored --exit-on-error
   $C exec -T postgres psql -U postgres -c "ALTER DATABASE wms RENAME TO wms_before_restore" \
                                         -c "ALTER DATABASE wms_restored RENAME TO wms"
   ```
3. `$C up -d` (migrate re-applies role grants and any newer migration), then check `/healthz`,
   sign in, and compare the fingerprint. Keep `wms_before_restore` until the owner says it can go.

## Rotate a secret

The three app-role passwords (`WMS_MIGRATOR_PASSWORD`, `WMS_STAFF_PASSWORD`,
`WMS_PARTNER_PASSWORD`): generate a new hex value, edit `/opt/wms/wms.env`, then
`docker compose -p wms … up -d`. The `migrate` service re-runs role bootstrap, which sets each
role's password to the new value before the app services restart with it.
`POSTGRES_SUPERUSER_PASSWORD` is only read when the database volume is first created, so change
it inside the database first (`… exec postgres psql -U postgres -c "\password postgres"`), then
put the same value in `wms.env`. `SMTP_URL`: edit and
`up -d`. The backup key: create a new key file, keep the old one until every backup encrypted
with it has aged out of retention.

## Create the first administrator

See `docs/DEPLOY-vps.md` section 5. Locally, with the variables from step 6:
`corepack pnpm --filter @wms/api admin:create -- --username <name> --email <address> --name "<full name>"`.
After that, administrators invite everyone else from **Users → Add user**, which gives a
one-time link to hand over (or mails it once SMTP is configured).
