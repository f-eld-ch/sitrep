#!/usr/bin/env bash
# Normalise Dependabot PR titles so that they pass the conventional commit check.
#
# The github-actions entry in .github/dependabot.yml uses the prefix "chore(deps-dev):"
# together with `include: scope`, which makes Dependabot add a second scope:
#
#   chore(deps-dev):(deps): bump actions/setup-node from 7.0.0 to 7.1.0
#
# This script keeps only the prefix:
#
#   chore(deps-dev): bump actions/setup-node from 7.0.0 to 7.1.0
#
# Usage:
#   scripts/fix-pr-title.sh "<title>"       print the (possibly unchanged) title
#   scripts/fix-pr-title.sh --all [--dry-run] [--repo OWNER/REPO]
#                                           fix all open Dependabot PRs with `gh`
set -euo pipefail

fix_title() {
  # "<type>(<scope>):(<scope>): ..." or "<type>(<scope>): (<scope>): ..." -> "<type>(<scope>): ..."
  printf '%s\n' "$1" | sed -E 's/^([a-z]+\([a-z-]+\)):[[:space:]]*\([a-z-]+\):[[:space:]]*/\1: /'
}

if [ "${1:-}" != "--all" ]; then
  fix_title "${1:?usage: $0 \"<pr title>\" | --all [--dry-run] [--repo OWNER/REPO]}"
  exit 0
fi
shift

dry_run=false
repo_args=()
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) dry_run=true ;;
    --repo) repo_args=(--repo "${2:?--repo needs OWNER/REPO}"); shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

changed=0
while IFS=$'\t' read -r number title; do
  fixed="$(fix_title "$title")"
  [ "$fixed" = "$title" ] && continue
  changed=$((changed + 1))
  echo "#$number: $title"
  echo "    -> $fixed"
  if ! $dry_run; then
    gh pr edit "$number" "${repo_args[@]}" --title "$fixed" >/dev/null
  fi
done < <(gh pr list "${repo_args[@]}" --state open --author "app/dependabot" --limit 200 \
  --json number,title --jq '.[] | "\(.number)\t\(.title)"')

if $dry_run; then
  echo "$changed PR title(s) would be changed (dry run)."
else
  echo "$changed PR title(s) changed."
fi
