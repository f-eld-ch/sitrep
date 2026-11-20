#!/usr/bin/env bash
# Copy the screenshots of screenshots/out/<lang>/ into the documentation repository (../sitrep.ch).
#
#   ./install-screenshots.sh [path-to-sitrep.ch]
#
# German goes to static/images/docs/<category>/<name>.webp (the existing paths); French and
# Italian to static/images/docs/<lang>/<category>/<name>.webp. Nothing is committed.
set -euo pipefail

cd "$(dirname "$0")"
SITE="${1:-$(cd ../../.. && pwd)/sitrep.ch}"
OUT="screenshots/out"

[[ -d "$SITE/static/images/docs" ]] || { echo "not the sitrep.ch repository: $SITE" >&2; exit 1; }

for dir in "$OUT"/*/; do
  lang=$(basename "$dir")
  if [[ "$lang" == "de" ]]; then target="$SITE/static/images/docs"; else target="$SITE/static/images/docs/$lang"; fi
  (cd "$dir" && find . -name '*.webp' -print0) | while IFS= read -r -d '' f; do
    mkdir -p "$target/$(dirname "$f")"
    cp "$dir/$f" "$target/$f"
  done
  echo "$lang -> $target ($(find "$dir" -name '*.webp' | wc -l) images)"
done
