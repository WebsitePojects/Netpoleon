#!/usr/bin/env bash
# Proves the newest backup restores (spec section 15: "a backup that has never been restored
# is not a backup"). Decrypts it into a throwaway database inside the running postgres
# container, counts the rows that matter, and drops the throwaway database. The live database
# is never touched.
#
# Weekly cron (as the deploy user), Sunday 03:30 Asia/Manila:
#   30 3 * * 0 /opt/wms/restore-check.sh >> /opt/wms/backups/restore-check.log 2>&1
set -euo pipefail

WMS_DIR="${WMS_DIR:-/opt/wms}"
BACKUP_DIR="${BACKUP_DIR:-$WMS_DIR/backups}"
KEY_FILE="${BACKUP_KEY_FILE:-$WMS_DIR/backup.key}"
COMPOSE=(docker compose -p "${WMS_PROJECT:-wms}" --env-file "$WMS_DIR/wms.env" -f "$WMS_DIR/compose.prod.yml")
SCRATCH_DB=wms_restore_check
FILE="${1:-$(ls -1t "$BACKUP_DIR"/wms-*.dump.enc | head -1)}"

psql() { "${COMPOSE[@]}" exec -T postgres psql -U postgres -v ON_ERROR_STOP=1 -tA "$@"; }

echo "$(date -u +%FT%TZ) checking $(basename "$FILE")"
psql -d postgres -c "DROP DATABASE IF EXISTS $SCRATCH_DB"
psql -d postgres -c "CREATE DATABASE $SCRATCH_DB"
trap 'psql -d postgres -c "DROP DATABASE IF EXISTS '"$SCRATCH_DB"'" >/dev/null' EXIT

# --no-owner: the throwaway copy does not need the app roles to own anything.
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass "file:$KEY_FILE" -in "$FILE" \
  | "${COMPOSE[@]}" exec -T postgres pg_restore -U postgres -d "$SCRATCH_DB" --no-owner --exit-on-error

for table in assets asset_movements loan_requests loans audit_log users schema_migrations; do
  printf '%-18s %s\n' "$table" "$(psql -d "$SCRATCH_DB" -c "SELECT count(*) FROM $table")"
done
echo "$(date -u +%FT%TZ) restore check passed"
