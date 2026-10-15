#!/usr/bin/env bash
set -euo pipefail
cd /opt/wh-hotel
release_sha="${1:?Commit SHA required}"
[[ "$release_sha" =~ ^[0-9a-f]{40}$ ]] || exit 1
exec 9>/tmp/wh-hotel-deploy.lock
flock -n 9 || { echo 'Another deployment is running'; exit 1; }
[[ -z "$(git status --porcelain --untracked-files=no)" ]] || { echo 'Tracked files have local edits. Commit or resolve them first.'; exit 1; }
git fetch origin main
git merge-base --is-ancestor "$release_sha" origin/main
previous_sha="$(git rev-parse HEAD)"
printf '%s\n' "$previous_sha" > .previous-release
git checkout --detach "$release_sha"
docker compose up -d --build
for attempt in {1..30}; do
  if docker compose exec -T api node -e "fetch('http://localhost:4000/v1/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
    && docker compose exec -T web node -e "fetch('http://localhost:3000').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    echo "Deployed $release_sha"
    exit 0
  fi
  sleep 5
done
echo 'Health checks failed. Inspect docker compose logs. Previous commit is in .previous-release.'
echo 'No automatic database rollback is performed.'
exit 1
