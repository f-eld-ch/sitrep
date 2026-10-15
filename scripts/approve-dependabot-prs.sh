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

approved=0
merged=0
while IFS=$'\t' read -r number state title; do
  case "$state" in
    ready) ;;
    pending | approved) $merge || { echo "skip     #$number ($state): $title"; continue; } ;;
    *) echo "skip     #$number ($state): $title"; continue ;;
  esac
  if [ "$state" != "approved" ]; then
    approved=$((approved + 1))
    if $dry_run; then
      echo "approve  #$number (dry run): $title"
    else
      gh pr review "$number" "${repo_args[@]}" --approve >/dev/null
      echo "approved #$number: $title"
    fi
  fi
  if $merge; then
    merged=$((merged + 1))
    if $dry_run; then
      echo "automerge #$number (dry run): $title"
    else
      gh pr merge "$number" "${repo_args[@]}" --auto --squash >/dev/null
      echo "automerge #$number enabled: $title"
    fi
  fi
done < <(gh pr list "${repo_args[@]}" --state open --author "app/dependabot" --limit 200 \
  --json number,title,isDraft,mergeable,reviewDecision,statusCheckRollup --jq "$classify")

suffix=""
$dry_run && suffix=" (dry run)"
echo "$approved PR(s) approved, auto-merge enabled on $merged PR(s)$suffix."
