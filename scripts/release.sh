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
# The Helm chart is released separately (SemVer, tag chart-vX.Y.Z; see helm/Chart.yaml):
#
#   ./scripts/release.sh --chart                          # release the version in Chart.yaml
#   ./scripts/release.sh --chart --bump patch             # bump patch|minor|major, then release
#   ./scripts/release.sh --chart --version 1.2.0          # set an explicit chart version
#   ./scripts/release.sh --chart --app-version v26.11.1   # also change the tested app version
#
set -euo pipefail

RELEASE_BRANCH="develop"
REMOTE="origin"

rc=false
chart=false
bump=""
app_version=""
dry_run=false
assume_yes=false
explicit_version=""

die() {
	printf 'error: %s\n' "$1" >&2
	exit 1
}

usage() {
	sed -n '3,/^set -euo pipefail/{/^set -euo pipefail/!p}' "$0" | sed 's/^# \{0,1\}//'
	exit 0
}

while [[ $# -gt 0 ]]; do
	case "$1" in
	--rc) rc=true ;;
	--chart) chart=true ;;
	--bump)
		bump="${2:-}"
		[[ $bump =~ ^(patch|minor|major)$ ]] || die "--bump needs patch, minor or major"
		shift
		;;
	--app-version)
		app_version="${2:-}"
		[[ -n $app_version ]] || die "--app-version needs an argument"
		shift
		;;
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

if $chart; then
	$rc && die "--rc does not apply to chart releases"
else
	[[ -z $bump && -z $app_version ]] || die "--bump and --app-version only apply with --chart"
fi
[[ -z $bump || -z $explicit_version ]] || die "use either --bump or --version, not both"

run() {
	if $dry_run; then
		printf '  would run: %s\n' "$*"
	else
		"$@"
	fi
}

# ── Preflight ────────────────────────────────────────────────────────────────

if $chart; then
	command -v helm >/dev/null || die "helm is not installed"
else
	command -v git-cliff >/dev/null || die "git-cliff is not installed (https://git-cliff.org)"
fi

branch="$(git rev-parse --abbrev-ref HEAD)"
[[ $branch == "$RELEASE_BRANCH" ]] || die "releases are cut from $RELEASE_BRANCH, not $branch"

[[ -z "$(git status --porcelain --untracked-files=no)" ]] || die "working tree has uncommitted changes"

git fetch --quiet "$REMOTE" "$RELEASE_BRANCH" --tags
[[ "$(git rev-parse HEAD)" == "$(git rev-parse "$REMOTE/$RELEASE_BRANCH")" ]] ||
	die "$branch is not in sync with $REMOTE/$RELEASE_BRANCH — pull or push first"

# ── Chart release ────────────────────────────────────────────────────────────
#
# The chart has its own SemVer, independent of the app. Pushing chart-vX.Y.Z makes
# helm-workflow.yml publish it; the workflow rejects a tag that differs from Chart.yaml.

release_chart() {
	local chart_file=helm/Chart.yaml
	local current current_app version app tag latest changed=false
	local major minor patch

	current="$(sed -n 's/^version: *//p' "$chart_file")"
	current_app="$(sed -n 's/^appVersion: *//p' "$chart_file" | tr -d '"')"
	[[ $current =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "$chart_file version '$current' is not X.Y.Z"

	if [[ -n $explicit_version ]]; then
		version="${explicit_version#chart-v}"
		version="${version#v}"
	elif [[ -n $bump ]]; then
		IFS=. read -r major minor patch <<<"$current"
		case $bump in
		major) version="$((major + 1)).0.0" ;;
		minor) version="$major.$((minor + 1)).0" ;;
		patch) version="$major.$minor.$((patch + 1))" ;;
		esac
	else
		version="$current"
	fi
	[[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "chart version '$version' must be X.Y.Z"

	app="${app_version:-$current_app}"
	[[ $app =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "appVersion '$app' must be a released app tag (vYY.M.P)"
	git rev-parse -q --verify "refs/tags/$app" >/dev/null ||
		die "app release $app is not a tag — release the app first"

	tag="chart-v$version"
	git rev-parse -q --verify "refs/tags/$tag" >/dev/null &&
		die "$tag already exists — bump the version (--bump patch|minor|major)"
	[[ -z "$(git ls-remote --tags "$REMOTE" "refs/tags/$tag")" ]] || die "$tag already exists on $REMOTE"

	latest="$(git tag --list 'chart-v*' --sort=-v:refname | head -n1)"
	latest="${latest#chart-v}"
	if [[ -n $latest && "$(printf '%s\n%s\n' "$latest" "$version" | sort -V | tail -n1)" != "$version" ]]; then
		die "chart version $version is older than the latest release chart-v$latest"
	fi

	local previous="${latest:+chart-v$latest}"
	printf 'Releasing %s (chart %s, appVersion %s; previous chart release: %s)\n' \
		"$tag" "$version" "$app" "${previous:-none}"
	$dry_run && printf '(dry run — nothing will be changed)\n'

	if [[ $version != "$current" ]]; then
		printf 'Setting %s version to %s\n' "$chart_file" "$version"
		run sed -i "s/^version: .*/version: $version/" "$chart_file"
		changed=true
	fi
	if [[ $app != "$current_app" ]]; then
		printf 'Setting %s appVersion to %s\n' "$chart_file" "$app"
		run sed -i "s/^appVersion: .*/appVersion: \"$app\"/" "$chart_file"
		changed=true
	fi

	printf 'Checking the chart\n'
	helm lint helm --strict -f helm/ci/postgres-values.yaml >/dev/null || die "helm lint failed"
	helm/ci/test.sh >/dev/null || die "chart behaviour tests failed (run helm/ci/test.sh)"

	if $changed; then
		run git commit --quiet -m "chore(release): prepare chart release $tag" -- "$chart_file"
	else
		printf '%s already at %s — tagging the current commit.\n' "$chart_file" "$version"
	fi
	run git tag "$tag"

	if ! $assume_yes && ! $dry_run; then
		printf '\nAbout to push %s%s to %s. Continue? [y/N] ' "$($changed && printf '%s and ' "$RELEASE_BRANCH")" "$tag" "$REMOTE"
		read -r reply
		if [[ $reply != [yY] ]]; then
			printf 'Aborted. Undo with: git tag -d %s%s\n' "$tag" "$($changed && printf ' && git reset --hard HEAD~1')"
			exit 1
		fi
	fi

	$changed && run git push --quiet "$REMOTE" "$RELEASE_BRANCH"
	run git push --quiet "$REMOTE" "$tag"

	if $dry_run; then
		printf '\nDry run complete — %s was not created.\n' "$tag"
		return
	fi
	printf '\nPushed %s. The helm workflow publishes and signs the chart:\n' "$tag"
	printf '  https://github.com/f-eld-ch/sitrep/actions/workflows/helm-workflow.yml\n'
}

if $chart; then
	release_chart
	exit 0
fi

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
