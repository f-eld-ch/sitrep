#!/usr/bin/env bash
# Approve all open Dependabot PRs whose status checks are all green.
#
# A PR is approved when
#   - it is not a draft and has no merge conflicts,
#   - it has at least one status check, all of them completed and successful
#     (SUCCESS, NEUTRAL or SKIPPED), none failed or still running,
#   - it is not approved yet.
#
# With --merge, auto-merge (squash) is enabled as well, in one run: also on PRs whose checks are
# still running (they are approved too) and on PRs that were approved earlier. GitHub merges them
# as soon as all required checks are green, a failing check keeps the PR open. PRs with failed
# checks are skipped. This does not look at the kind of update: major updates are merged too.
#
# Usage: scripts/approve-dependabot-prs.sh [--dry-run] [--merge] [--repo OWNER/REPO]
set -euo pipefail

dry_run=false
merge=false
repo_args=()
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) dry_run=true ;;
    --merge) merge=true ;;
    --repo) repo_args=(--repo "${2:?--repo needs OWNER/REPO}"); shift ;;
    *) echo "usage: $0 [--dry-run] [--merge] [--repo OWNER/REPO]" >&2; exit 2 ;;
  esac
  shift
done

# Prints "<number>\t<state>\t<title>", state is one of: ready, pending, failing, no-checks,
# draft, conflict, approved.
classify='
  def checks_ok: all(.statusCheckRollup[];
      (.__typename == "CheckRun" and .status == "COMPLETED"
        and (.conclusion | IN("SUCCESS", "NEUTRAL", "SKIPPED")))
      or (.__typename == "StatusContext" and .state == "SUCCESS"));
  def checks_failed: any(.statusCheckRollup[];
      (.__typename == "CheckRun" and .status == "COMPLETED"
        and (.conclusion | IN("SUCCESS", "NEUTRAL", "SKIPPED") | not))
      or (.__typename == "StatusContext" and (.state | IN("FAILURE", "ERROR"))));
  # The rollup also contains older runs of the same check (reruns): only the latest one counts.
  def latest: group_by((.workflowName // "") + "/" + (.name // .context // ""))
    | map(max_by(.completedAt // .startedAt // ""));
  .[] | .statusCheckRollup |= latest | [.number,
    (if .isDraft then "draft"
     elif .mergeable == "CONFLICTING" then "conflict"
     elif .reviewDecision == "APPROVED" then "approved"
     elif (.statusCheckRollup | length) == 0 then "no-checks"
     elif checks_failed then "failing"
     elif checks_ok then "ready"
     else "pending" end),
    .title] | @tsv'

# Fetch first, so that a failing gh/jq call aborts the script instead of silently yielding an
# empty list (a failure inside `< <(...)` is invisible to `set -e`).
prs=$(gh pr list "${repo_args[@]}" --state open --author "app/dependabot" --limit 200 \
  --json number,title,isDraft,mergeable,reviewDecision,statusCheckRollup --jq "$classify") || {
  echo "error: could not list pull requests" >&2
  exit 1
}

approved=0
merged=0
failed=0
# Runs a gh command for one PR; a failure is reported and counted but does not stop the run.
try() {
  local number=$1
  shift
  if ! "$@" >/dev/null; then
    echo "FAILED   #$number: $*" >&2
    failed=$((failed + 1))
    return 1
  fi
}

while IFS=$'\t' read -r number state title; do
  case "$state" in
    ready) ;;
    pending | approved) $merge || { echo "skip     #$number ($state): $title"; continue; } ;;
    *) echo "skip     #$number ($state): $title"; continue ;;
  esac
  if [ "$state" != "approved" ]; then
    if $dry_run; then
      approved=$((approved + 1))
      echo "approve  #$number (dry run): $title"
    elif try "$number" gh pr review "$number" "${repo_args[@]}" --approve; then
      approved=$((approved + 1))
      echo "approved #$number: $title"
    else
      continue
    fi
  fi
  if $merge; then
    if $dry_run; then
      merged=$((merged + 1))
      echo "automerge #$number (dry run): $title"
    elif try "$number" gh pr merge "$number" "${repo_args[@]}" --auto --squash; then
      merged=$((merged + 1))
      echo "automerge #$number enabled: $title"
    fi
  fi
done <<<"$prs"

suffix=""
$dry_run && suffix=" (dry run)"
echo "$approved PR(s) approved, auto-merge enabled on $merged PR(s)$suffix."
if [ "$failed" -gt 0 ]; then
  echo "$failed operation(s) failed, see errors above." >&2
  exit 1
fi
