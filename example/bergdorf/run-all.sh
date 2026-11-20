#!/usr/bin/env bash
# Take all documentation screenshots, for every language, each on a freshly seeded database.
#
#   ./run-all.sh                 de, fr and it
#   ./run-all.sh de              one language
#   SECTIONS="base editor" ./run-all.sh de     only some sections (see screenshots/shots.ts)
#   REBUILD=1 ./run-all.sh                     rebuild the server binary first (after code changes;
#                                              run 'yarn build' in ui/ before when the UI changed)
#
# Output: screenshots/out/<lang>/<category>/<name>.webp
set -euo pipefail

cd "$(dirname "$0")"
export SEED_DATE="${SEED_DATE:-$(date +%F)}"   # today: the map labels then show only the time
export SHOT_DIR="${SHOT_DIR:-$PWD/screenshots/out}"
LANGS=("${@:-de fr it}")
read -ra LANGS <<< "${LANGS[*]}"
SECTIONS="${SECTIONS:-base editor triage results mittelExtras lagebild ereignis}"

REBUILD_FLAG=()
[[ "${REBUILD:-0}" == "1" ]] && REBUILD_FLAG=(--rebuild)

for lang in "${LANGS[@]}"; do
  echo "=== $lang (seed date $SEED_DATE)"
  ./start.sh --reset "${REBUILD_FLAG[@]}"
  REBUILD_FLAG=()   # only the first language needs the build
  # shellcheck disable=SC2086
  (cd screenshots && node shots.ts "$lang" $SECTIONS)
done
./start.sh stop
