#!/usr/bin/env bash
#
# Cuts a SitRep release.
#
# Versions are CalVer: YY.M.PATCH — two-digit year, unpadded month, patch reset
# to 0 whenever the year or month rolls over.
#
#   ./scripts/release.sh                 # next stable, e.g. v26.9.2
#   ./scripts/release.sh --rc            # next candidate, e.g. v26.9.2-rc.1
#   ./scripts/release.sh --version 26.10.0
#   ./scripts/release.sh --dry-run
#
set -euo pipefail

RELEASE_BRANCH="develop"
REMOTE="origin"

rc=false
dry_run=false
assume_yes=false
explicit_version=""

die() {
	printf 'error: %s\n' "$1" >&2
	exit 1
}

usage() {
	sed -n '3,13p' "$0" | sed 's/^# \{0,1\}//'
	exit 0
}

while [[ $# -gt 0 ]]; do
	case "$1" in
	--rc) rc=true ;;
	--dry-run) dry_run=true ;;
	--yes | -y) assume_yes=true ;;
	--version)
		explicit_version="${2:-}"
		[[ -n $explicit_version ]] || die "--version needs an argument"
		shift
		;;
	-h | --help) usage ;;
	*) die "unknown argument: $1" ;;
	esac
	shift
done

run() {
	if $dry_run; then
		printf '  would run: %s\n' "$*"
	else
		"$@"
	fi
}

# ── Preflight ────────────────────────────────────────────────────────────────

command -v git-cliff >/dev/null || die "git-cliff is not installed (https://git-cliff.org)"

branch="$(git rev-parse --abbrev-ref HEAD)"
[[ $branch == "$RELEASE_BRANCH" ]] || die "releases are cut from $RELEASE_BRANCH, not $branch"

[[ -z "$(git status --porcelain --untracked-files=no)" ]] || die "working tree has uncommitted changes"

git fetch --quiet "$REMOTE" "$RELEASE_BRANCH" --tags
[[ "$(git rev-parse HEAD)" == "$(git rev-parse "$REMOTE/$RELEASE_BRANCH")" ]] ||
	die "$branch is not in sync with $REMOTE/$RELEASE_BRANCH — pull or push first"

# ── Work out the version ─────────────────────────────────────────────────────

latest_stable="$(git tag --list 'v*' --sort=-v:refname | grep -vE -- '-(rc|alpha|beta)' | head -n1)"

if [[ -n $explicit_version ]]; then
	version="${explicit_version#v}"
else
	year="$(date +%y)"
	month="$(date +%-m)"

	IFS=. read -r last_year last_month last_patch <<<"${latest_stable#v}"
	if [[ $last_year == "$year" && $last_month == "$month" ]]; then
		version="$year.$month.$((last_patch + 1))"
	else
		version="$year.$month.0"
	fi
fi

tag="v$version"

if $rc; then
	# A candidate for a version that already shipped would sort below it.
	git rev-parse -q --verify "refs/tags/$tag" >/dev/null &&
		die "$tag already exists — a candidate for it would be older than the release"

	last_rc="$(git tag --list "$tag-rc.*" --sort=-v:refname | head -n1)"
	if [[ -n $last_rc ]]; then
		next_rc=$((${last_rc##*-rc.} + 1))
	else
		next_rc=1
	fi

	tag="$tag-rc.$next_rc"
fi

git rev-parse -q --verify "refs/tags/$tag" >/dev/null && die "$tag already exists locally"
[[ -z "$(git ls-remote --tags "$REMOTE" "refs/tags/$tag")" ]] || die "$tag already exists on $REMOTE"

printf 'Releasing %s (previous stable: %s)\n' "$tag" "${latest_stable:-none}"
$dry_run && printf '(dry run — nothing will be changed)\n'

# ── Prepare ──────────────────────────────────────────────────────────────────

pkg_version="${tag#v}"
files=(ui/package.json)

printf 'Setting ui/package.json version to %s\n' "$pkg_version"
run sed -i "0,/\"version\": \"[^\"]*\"/s//\"version\": \"$pkg_version\"/" ui/package.json

if $rc; then
	# cliff.toml ignores rc tags, so a candidate gets no changelog section of its
	# own: its commits are folded into the eventual stable release instead.
	printf 'Candidate release — leaving CHANGELOG.md to the final release.\n'
else
	printf 'Naming the unreleased changelog section %s\n' "$tag"
	run git-cliff --tag "$tag" --output CHANGELOG.md
	files+=(CHANGELOG.md)
fi

if ! $dry_run; then
	[[ -n "$(git status --porcelain -- "${files[@]}")" ]] ||
		die "${files[*]} unchanged — is $tag already prepared?"
fi

run git commit --quiet -m "chore(release): prepare release $tag" -- "${files[@]}"

run git tag "$tag"

# ── Push ─────────────────────────────────────────────────────────────────────

if ! $assume_yes && ! $dry_run; then
	printf '\nAbout to push %s and %s to %s. Continue? [y/N] ' "$RELEASE_BRANCH" "$tag" "$REMOTE"
	read -r reply
	if [[ $reply != [yY] ]]; then
		printf 'Aborted. Undo with: git tag -d %s && git reset --hard HEAD~1\n' "$tag"
		exit 1
	fi
fi

run git push --quiet "$REMOTE" "$RELEASE_BRANCH"
run git push --quiet "$REMOTE" "$tag"

printf '\nPushed %s. The release workflow builds and publishes it:\n' "$tag"
printf '  https://github.com/f-eld-ch/sitrep/actions/workflows/release.yml\n'
