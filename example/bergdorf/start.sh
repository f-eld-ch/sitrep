#!/usr/bin/env bash
# Start sitrep with a local SQLite database next to this script and seed the example
# incident "Unwetter Bergdorf – Murgang Dorfbach".
#
#   ./start.sh            start (build if needed), seed if the database is empty
#   ./start.sh --reset    wipe the database and the attachments first, then start and seed
#   ./start.sh --rebuild  rebuild the binary first
#   ./start.sh stop       stop the server
#
# SEED_DATE=YYYY-MM-DD sets the day of the operation (default 2026-11-04, must be in the past).
# With today's date the map labels show only the time, like on a real operation day.
set -euo pipefail

cd "$(dirname "$0")"
ROOT=$(cd ../.. && pwd)
PORT=4181
URL="http://localhost:${PORT}"

stop() {
  if [[ -f sitrep.pid ]] && kill -0 "$(cat sitrep.pid)" 2>/dev/null; then
    kill "$(cat sitrep.pid)"
    while kill -0 "$(cat sitrep.pid)" 2>/dev/null; do sleep 0.2; done
    echo "stopped"
  fi
  rm -f sitrep.pid
}

RESET=0
REBUILD=0
for arg in "$@"; do
  case "$arg" in
    stop) stop; exit 0 ;;
    --reset) RESET=1 ;;
    --rebuild) REBUILD=1 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

stop

if [[ $RESET -eq 1 ]]; then
  rm -rf bergdorf.sqlite3 bergdorf.sqlite3-shm bergdorf.sqlite3-wal attachments
  echo "database reset"
fi

if [[ $REBUILD -eq 1 || ! -x sitrep ]]; then
  if [[ ! -f "$ROOT/ui/build/index.html" ]]; then
    echo "ui/build is missing: run 'cd ui && yarn install && yarn build' first" >&2
    exit 1
  fi
  (cd "$ROOT" && go build -o example/bergdorf/sitrep .)
  echo "built"
fi

nohup ./sitrep serve --config config.yaml > sitrep.log 2>&1 &
echo $! > sitrep.pid

for _ in $(seq 1 60); do
  if curl -fsS "${URL}/api/v2/health" > /dev/null 2>&1; then break; fi
  if ! kill -0 "$(cat sitrep.pid)" 2>/dev/null; then
    echo "server exited, see sitrep.log" >&2
    exit 1
  fi
  sleep 0.5
done

go run seed.go -url "$URL" -date "${SEED_DATE:-2026-11-04}" -if-empty
echo "sitrep is running on ${URL} (log: example/bergdorf/sitrep.log, stop: ./start.sh stop)"
