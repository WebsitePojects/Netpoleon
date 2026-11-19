# Deploying to the VPS

> **Status.** Nothing in this document has been run on the production server. Every claim about
> the server (free ports, Nginx, memory, Docker version) must come from the read-only pass in
> section 1, run on the day of the deploy. Notes and old inventories are snapshots, not facts.

The server may host other production apps (PM2 processes, Docker containers, databases, one
Nginx). A careless command here can take those down. The rules in `.claude/rules/vps-safety.md`
apply to every command below: read first, target by exact name, fingerprint before and after,
and every change has its rollback written next to it.

## 1. Read the server first (read-only)

Copy this whole block into a shell already logged in on the server and send back the output.
It changes nothing, and it prints no environment variables, no env files and no container
configuration (those would expose secrets).

```bash
hostname; uptime
echo "--- memory and disk"; free -h; swapon --show; df -h
echo "--- listening ports"; ss -ltnp
echo "--- docker"; docker --version; docker compose version
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
docker images --format 'table {{.Repository}}\t{{.Tag}}\t{{.Size}}'
docker system df
echo "--- pm2"; pm2 ls
echo "--- nginx (filtered)"; nginx -t
nginx -T 2>/dev/null | grep -E '^\s*(server_name|listen)\s'
echo "--- certificates"; certbot certificates 2>/dev/null | grep -E 'Certificate Name|Domains|Expiry'
echo "--- firewall"; ufw status
echo "--- name resolves to this server?"; getent hosts <the-domain-for-this-system>
```

If a command is missing (for example `pm2` on a server without it), skip that line and say so.

## 2. Decide from the output

| Question                                                  | Answer comes from        | Consequence                                                                                   |
| --------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------- |
| Which host port can the web container use?                | `ss -ltnp`               | Set `WEB_PORT` to a port that is not listed. Never reuse a port because it is the default.    |
| Is there already a web server on 80 and 443?              | `ss -ltnp`, `nginx -t`   | Yes: add one new Nginx site file (section 6a), leave the `proxy` service off. No: use Caddy.  |
| Is there enough memory?                                   | `free -h`, `docker ps`   | The stack's limits are in `infra/docker/compose.prod.yml`. Their sum must fit in free memory. |
| Is Docker Compose v2 installed?                           | `docker compose version` | If not, stop and report. Do not install packages without a specific yes from the owner.       |
| Does the domain already point here?                       | `getent hosts`           | Caddy cannot obtain a certificate until it does.                                              |
| Which other apps are running (for the before/after diff)? | `docker ps`, `pm2 ls`    | They form the fingerprint in section 5.                                                       |

## 3. Environment variables

All values live in one file on the server, readable by its owner only. It is never in the
repository and never in the image. The file is named `wms.env` on purpose: the repository ignores
every name beginning with `.env`, and no example env file is tracked anywhere.

Generate each secret with `openssl rand -hex 32`. Hex is required, not a preference: compose
builds the database connection strings from these passwords, and a password containing `@`, `/`
or `:` would corrupt the URL.

### 3a. Set by the operator in `wms.env`

| Variable                      | Used by                | Purpose                                                              | Secret |
| ----------------------------- | ---------------------- | -------------------------------------------------------------------- | ------ |
| `POSTGRES_SUPERUSER_PASSWORD` | postgres, migrate      | Password of the PostgreSQL superuser; only role bootstrap uses it    | yes    |
| `WMS_MIGRATOR_PASSWORD`       | migrate                | Password of `wms_migrator`, the role that owns and alters the schema | yes    |
| `WMS_STAFF_PASSWORD`          | migrate, api           | Password of `wms_staff`, used for staff sessions and background work | yes    |
| `WMS_PARTNER_PASSWORD`        | migrate, api           | Password of `wms_partner`, used for every partner request            | yes    |
| `WMS_IMAGE`                   | migrate, api, worker   | API image, pinned by digest (`ghcr.io/…/netpoleon-wms-api@sha256:…`) | no     |
| `WMS_WEB_IMAGE`               | web                    | Console image, pinned by digest (`…/netpoleon-wms-web@sha256:…`)     | no     |
| `APP_ORIGIN`                  | api, worker            | Public origin (`https://…`); the CSRF check and the links in mails   | no     |
| `WEB_PORT`                    | compose                | Loopback host port the web container is published on (default 8080)  | no     |
| `SMTP_URL`                    | api, worker            | `smtps://user:password@host:465`; unset = mails are only logged      | yes    |
| `MAIL_FROM`                   | api, worker            | Sender, e.g. `Netpoleon WMS <wms@example.com>`; required with SMTP   | no     |
| `POSTGRES_DB`                 | postgres, migrate, api | Database name                                                        | no     |
| `LOG_LEVEL`                   | api                    | Minimum log level                                                    | no     |
| `TRUST_PROXY`                 | api                    | Which proxy addresses may set the client IP header                   | no     |
| `WMS_DOMAIN`                  | proxy                  | Domain Caddy obtains a certificate for; unused with Nginx            | no     |

Required (compose stops with the variable's name if missing): the four passwords, `WMS_IMAGE`,
`WMS_WEB_IMAGE` and `APP_ORIGIN`. `APP_ORIGIN` must be `https://`: production refuses to start
on plain HTTP, because the session cookie would travel in clear text. The rest have defaults; the defaults for application settings are defined in
`packages/config/src/schema.ts`, and those for compose in `infra/docker/compose.prod.yml`.

### 3b. Set by compose, never by hand

| Variable                                          | Set on  | Why it is fixed                                                     |
| ------------------------------------------------- | ------- | ------------------------------------------------------------------- |
| `NODE_ENV`                                        | api     | Turns on production behaviour and the production safety checks      |
| `API_HOST`, `API_IN_CONTAINER`                    | api     | Container-internal bind; exposure is the loopback port mapping      |
| `API_PORT` (inside the container)                 | api     | Always the same internally; the host port is chosen by the operator |
| `DATABASE_URL_STAFF`, `DATABASE_URL_PARTNER`      | api     | Assembled from the role passwords above                             |
| `DATABASE_URL_SUPERUSER`, `DATABASE_URL_MIGRATOR` | migrate | Assembled from the passwords above; only this one-shot job has them |

Pool sizes and the statement timeout (`DB_POOL_STAFF_MAX`, `DB_POOL_PARTNER_MAX`,
`DB_STATEMENT_TIMEOUT_MS`) are application settings that compose does not pass today. Add them
to the `api` service environment if the defaults ever need to change, and keep the pool sizes
well under PostgreSQL's connection limit.

## 4. Prepare the server

Each step names its rollback. Do not run a step before the one above it has been confirmed.

1. **Create the directory and the env file.**

   ```bash
   sudo install -d -m 700 -o "$USER" /opt/wms
   install -m 600 /dev/null /opt/wms/wms.env
   ```

   Fill `/opt/wms/wms.env` with `NAME=value` lines for section 3a, using an editor, not `echo`
   with a value on the command line (shell history keeps it).
   _Rollback:_ `rm /opt/wms/wms.env` (only this file; ask before removing the directory).

2. **Place the compose file and Caddyfile.** Copy `infra/docker/compose.prod.yml` and
   `infra/docker/Caddyfile` to `/opt/wms/`.
   _Rollback:_ delete those two files.

3. **Registry login and image pull.** CI publishes both images to the GitHub Container Registry
   on every green push to `main`; the job summary lists their digests. On the server, log in once
   with a token that can only read packages (`read:packages`), typed at the prompt:

   ```bash
   docker login ghcr.io -u <github-user>          # paste the read-only token when asked
   docker pull ghcr.io/websitepojects/netpoleon-wms-api@sha256:<digest>
   docker pull ghcr.io/websitepojects/netpoleon-wms-web@sha256:<digest>
   ```

   Put those two `@sha256:` references in `WMS_IMAGE` and `WMS_WEB_IMAGE`.
   _Rollback:_ `docker logout ghcr.io`; removing pulled images needs the owner's yes.

4. **Backups.** Copy `infra/scripts/backup.sh` and `infra/scripts/restore-check.sh` to `/opt/wms/`,
   create the encryption key, and add the two cron lines from the scripts' headers:

   ```bash
   install -m 700 backup.sh restore-check.sh /opt/wms/
   openssl rand -base64 48 > /opt/wms/backup.key && chmod 600 /opt/wms/backup.key
   crontab -e        # add the two lines quoted at the top of each script
   ```

   The key must also be stored somewhere off the server (a password manager): without it every
   backup is unreadable. Set `OFFSITE_COMMAND` in the cron line once the owner chooses where
   encrypted copies go (spec open item 9).
   _Rollback:_ remove the two cron lines.

## 5. Start the stack

Fingerprint everything that is not this system, before and after, and compare.

```bash
# Before and after: every line outside the wms project must be identical.
docker ps --format '{{.Names}}|{{.Status}}' | sort > /tmp/fingerprint-docker.txt
pm2 ls > /tmp/fingerprint-pm2.txt
```

Start by project name, never with a bare `docker compose down` or `... up` in a shared folder:

```bash
cd /opt/wms
docker compose -p wms --env-file wms.env -f compose.prod.yml config --quiet   # parses, names any missing variable
docker compose -p wms --env-file wms.env -f compose.prod.yml up -d
docker compose -p wms --env-file wms.env -f compose.prod.yml ps
```

Verify from the server itself (only the web container is published, on loopback):

```bash
curl -fsS http://127.0.0.1:<WEB_PORT>/healthz          # api process is up, through the web container
docker compose -p wms --env-file wms.env -f compose.prod.yml exec api \
  node -e "fetch('http://127.0.0.1:3000/readyz').then(r=>r.text()).then(console.log)"   # database and migrations
docker compose -p wms --env-file wms.env -f compose.prod.yml logs --tail 20 worker      # worker started, jobs ran
```

**First administrator** (once, on a new server). No default account exists anywhere; this
creates one as invited and prints a one-time link to set its password:

```bash
docker compose -p wms --env-file wms.env -f compose.prod.yml run --rm api \
  node apps/api/dist/cli/admin-create.js --username <name> --email <address> --name "<full name>"
```

It refuses if an administrator already exists. `--rm` matters: the printed link must not stay
in a stopped container's log.

_Rollback:_ `docker compose -p wms --env-file wms.env -f compose.prod.yml stop web api worker`. Stopping the
`wms` project only touches containers whose names start with `wms-`. To go back to a previous
version, set `WMS_IMAGE` and `WMS_WEB_IMAGE` to the previous digests and run `up -d` again; migrations are written so
the previous version keeps working. The database volume (`wms_pgdata`) is never removed without
an explicit, specific yes from the owner.

## 6. Reverse proxy

### 6a. The server already runs Nginx (decided from section 1)

Add one new site file for this system and leave every existing file alone. Choose a
`server_name` that no other site uses.

```nginx
server {
    listen 80;
    server_name <the-domain-for-this-system>;

    client_max_body_size 1m;

    location / {
        proxy_pass http://127.0.0.1:<WEB_PORT>;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Test and reload; never restart:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Obtain the certificate the way the server's other sites do (read `certbot certificates` in
section 1 to see how). _Rollback:_ remove the new site file and run `sudo nginx -t && sudo
systemctl reload nginx` again.

### 6b. No web server on 80 and 443

Add `--profile proxy` to the compose commands in section 5 and set `WMS_DOMAIN`. Caddy obtains
the certificate automatically once the domain resolves to the server.

## 7. Still open

- Image vulnerability scanning in CI (a scanner is not chosen yet).
- Where encrypted backups go off the server, and the alert when no good backup exists from the
  last 26 hours (spec section 15).
- External uptime check on `/healthz` and alerting on a stale worker heartbeat
  (`worker_heartbeats.beat_at`) or parked outbox rows (`outbox.status = 'failed'`).
