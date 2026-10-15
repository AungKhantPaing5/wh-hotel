#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v docker >/dev/null || { echo 'Install Docker Engine and Docker Compose first.'; exit 1; }
docker compose version >/dev/null
if [[ ! -f .env ]]; then
  cp .env.example .env
  echo 'Created .env. Set POSTGRES_PASSWORD and WEB_ORIGIN, then run this script again.'
  exit 0
fi
if grep -q 'CHANGE_ME_RANDOM_PASSWORD' .env; then
  echo 'Replace POSTGRES_PASSWORD in .env first.'
  exit 1
fi
mkdir -p secrets
docker compose up -d --build
docker compose ps
echo 'Local endpoint: http://127.0.0.1:3000 (or configured WEB_PORT). Use Nginx HTTPS on a VPS.'
