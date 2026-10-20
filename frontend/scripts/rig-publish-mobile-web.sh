#!/bin/sh
# Publishes the bundle that scripts/rig-mobile-bundle.mjs left in live/ to the server, where the
# Android app (1.0.2+) picks it up the next time it opens (src/lib/live-update.js).
# Files go first, latest.json last (the previous one is kept as latest.json.prev): a phone never
# reads a manifest whose files are not there yet. Roll back: scripts/rig-publish-mobile-web.sh --rollback
set -eu
HOST="${RIG_HOST:-oracle}"
DEST=/var/www/rigquiro-app/web
cd "$(dirname "$0")/.."
if [ "${1:-}" = "--rollback" ]; then
  ssh "$HOST" "cd $DEST && test -f latest.json.prev && cp latest.json latest.json.rolledback && mv latest.json.prev latest.json && cat latest.json | head -c 120; echo"
  exit 0
fi
ID=$(node -e "process.stdout.write(require('./live/latest.json').id)")
ssh "$HOST" "mkdir -p $DEST/$ID"
rsync -a --delete "live/$ID/" "$HOST:$DEST/$ID/"
scp -q live/latest.json "$HOST:$DEST/latest.json.new"
ssh "$HOST" "cd $DEST && { [ -f latest.json ] && cp latest.json latest.json.prev || true; } && mv latest.json.new latest.json"
curl -fsS "https://gym.rigdigital.cl/app/web/latest.json" | head -c 80; echo
curl -fsS -o /dev/null -w "index.html %{http_code}\n" "https://gym.rigdigital.cl/app/web/$ID/index.html"
