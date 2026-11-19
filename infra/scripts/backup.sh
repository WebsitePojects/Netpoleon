#!/usr/bin/env bash
# Nightly backup of the Netpoleon WMS database (spec section 10).
#
# The dump is encrypted before it touches the disk, so a copied or stolen backup file is
# ciphertext. Keeps 14 daily and 8 weekly files. If OFFSITE_COMMAND is set, it is run with the
# file path as its argument to copy the backup off the server (destination: spec open item 9).
#
# Cron (as the deploy user), 02:30 Asia/Manila:
#   30 2 * * * /opt/wms/backup.sh >> /opt/wms/backups/backup.log 2>&1
set -euo pipefail

WMS_DIR="${WMS_DIR:-/opt/wms}"
BACKUP_DIR="${BACKUP_DIR:-$WMS_DIR/backups}"
KEY_FILE="${BACKUP_KEY_FILE:-$WMS_DIR/backup.key}"
COMPOSE=(docker compose -p "${WMS_PROJECT:-wms}" --env-file "$WMS_DIR/wms.env" -f "$WMS_DIR/compose.prod.yml")
DAILY_KEEP=14
WEEKLY_KEEP=8

umask 077
[ -r "$KEY_FILE" ] || { echo "backup key $KEY_FILE is missing or unreadable" >&2; exit 1; }
mkdir -p "$BACKUP_DIR"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="$BACKUP_DIR/wms-$stamp.dump.enc"
partial="$out.partial"

# pipefail: a failed pg_dump fails the whole pipeline, so a truncated file is never kept.
"${COMPOSE[@]}" exec -T postgres pg_dump -U postgres -d wms --format=custom \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass "file:$KEY_FILE" -out "$partial"
[ -s "$partial" ] || { echo "backup is empty" >&2; rm -f "$partial"; exit 1; }
mv "$partial" "$out"
echo "$(date -u +%FT%TZ) wrote $out ($(stat -c %s "$out") bytes)"

if [ -n "${OFFSITE_COMMAND:-}" ]; then
  $OFFSITE_COMMAND "$out"
  echo "$(date -u +%FT%TZ) copied off the server"
fi

# Retention: the newest DAILY_KEEP files, plus the newest file of each of the last
# WEEKLY_KEEP ISO weeks. Everything else is removed.
mapfile -t files < <(ls -1t "$BACKUP_DIR"/wms-*.dump.enc 2>/dev/null)
declare -A keep=()
for f in "${files[@]:0:$DAILY_KEEP}"; do keep["$f"]=1; done
declare -A weeks=()
for f in "${files[@]}"; do
  name="$(basename "$f")"
  week="$(date -u -d "${name:4:4}-${name:8:2}-${name:10:2}" +%G-%V)"
  if [ -z "${weeks[$week]:-}" ] && [ "${#weeks[@]}" -lt "$WEEKLY_KEEP" ]; then
    weeks["$week"]=1
    keep["$f"]=1
  fi
done
for f in "${files[@]}"; do
  [ -n "${keep[$f]:-}" ] || { rm -f "$f"; echo "removed old backup $(basename "$f")"; }
done
