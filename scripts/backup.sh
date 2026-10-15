#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
mkdir -p backups
target="backups/wh-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose exec -T db pg_dump -U wh -d wh_hotel -Fc > "$target"
echo "Backup created: $target"
echo 'Copy backups off the VPS and test restoration in a separate database.'
