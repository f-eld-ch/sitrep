# Releasing

SitRep uses **CalVer**: `YY.M.PATCH` — two-digit year, unpadded month, patch counting
releases within that month. `v26.9.2` is the third release of September 2026. The patch
resets to `0` whenever the year or month rolls over.

Releases are cut from `develop`. The `main` branch is not part of the release flow.

---

## One-time setup: a signing key

Release tags are **signed**, and the release workflow refuses a tag that GitHub does not show as
verified. Every maintainer who cuts releases needs a signing key, registered on GitHub:

```bash
# SSH key (simplest if you already use one for git)
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_ed25519.pub

# or a GPG key
git config --global user.signingkey <GPG key id>
```

Then add the same public key at <https://github.com/settings/keys> as a **signing key**
(*New SSH key* → key type *Signing Key*; a GPG key is added under *New GPG key*). The release
script stops with instructions when `user.signingkey` is not set.

To check a tag locally, `git tag -v v26.9.2` (for an SSH key, set `gpg.ssh.allowedSignersFile`
first). GitHub shows a *Verified* badge on the tag and on the release.

---

## Cutting a release

```bash
./scripts/release.sh              # next stable      → v26.9.2
./scripts/release.sh --rc         # next candidate   → v26.9.2-rc.1
./scripts/release.sh --dry-run    # print the plan, change nothing
./scripts/release.sh --version 26.10.0
```

The script refuses to run unless you are on `develop`, the working tree is clean, and the
branch is in sync with `origin/develop`. It then:

1. sets `version` in `ui/package.json` to the tag being cut
2. for a stable release, renames the changelog's `## [unreleased]` section via `git-cliff --tag`
3. commits as `chore(release): prepare release vX.Y.Z`
4. creates the tag and, after confirmation, pushes the branch and the tag

Pushing the tag is the only thing that matters to CI — everything before it is bookkeeping.

### Doing it by hand

```bash
git switch develop && git pull
git-cliff --tag v26.9.2 --output CHANGELOG.md
# edit ui/package.json: "version": "26.9.2"
git commit -am "chore(release): prepare release v26.9.2"
git push
git tag --sign --message "SitRep v26.9.2" v26.9.2 && git push origin v26.9.2
```

---

## What happens after the tag is pushed

`.github/workflows/release.yml` triggers on `v*` and:

1. checks that the tag is an annotated tag whose signature GitHub shows as verified; an unsigned
   or lightweight tag stops the release here
2. builds the UI and uploads it as an artifact
3. downloads it into `ui/build/` so `go:embed` picks it up
4. resolves the changelog range and generates release notes with git-cliff
5. runs `goreleaser release`, which
   - compiles six binaries (linux/windows/darwin × amd64/arm64) with the version linked in
   - produces six `tar.gz` archives, two `.deb` and two `.rpm` packages
   - builds and pushes the container image to `ghcr.io/f-eld-ch/sitrep`
   - creates SBOMs (SPDX JSON, with syft): one per archive and one for the web UI's npm dependencies
   - signs `checksums.txt` with cosign (keyless) and uploads `checksums.txt.sigstore.json`
   - signs the container image manifest with cosign (keyless)
   - creates the GitHub release with every artifact attached
6. creates build-provenance attestations for the archives, packages, SBOMs, `checksums.txt` and the image

The whole run takes a few minutes. Nothing needs to be done by hand afterwards.

---

## Release candidates

Tag a candidate with `--rc`. `prerelease: auto` in `.goreleaser.yaml` recognises the
`-rc.N` suffix, so the GitHub release is marked as a pre-release and does not take the
*Latest* badge.

Container tags follow the same rule: a candidate publishes **only** its exact version
(`v26.9.2-rc.1`). The rolling `latest`, `stable`, `v26` and `v26.9` tags stay on the newest
stable release, so nobody pulls a candidate by accident.

Candidates get **no changelog section** of their own. `cliff.toml` lists `rc` in
`ignore_tags`, meaning candidate tags are not treated as changelog boundaries — their
commits are folded into the eventual stable section instead. So a cycle of
`v26.9.2-rc.1` → `v26.9.2-rc.2` → `v26.9.2` produces one `## [26.9.2]` section covering
everything since `v26.9.1`, not three fragments. The prepare commit for a candidate
therefore only bumps `ui/package.json`.

Use `rc` and nothing else. `cliff.toml` puts `beta` and `alpha` in `skip_tags`, which
discards their commits from the changelog entirely rather than folding them forward.

The release notes on the GitHub release follow the same rule: the workflow ranges from the
last **stable** tag rather than using `--current`, which would otherwise list only what
changed since the previous candidate.

---

## Releasing the Helm chart

The chart has its own SemVer (`helm/Chart.yaml`), independent of the app's CalVer, and its own tag:
`chart-vX.Y.Z`. App tags (`vYY.M.P`) never publish a chart, and chart tags never build the app.

```bash
./scripts/release.sh --chart --dry-run                  # print the plan, change nothing
./scripts/release.sh --chart                            # release the version already in Chart.yaml
./scripts/release.sh --chart --bump patch               # bump patch|minor|major, then release
./scripts/release.sh --chart --version 1.2.0            # explicit chart version
./scripts/release.sh --chart --app-version v26.11.1     # also change the tested app version
```

Same safety checks as an app release (on `develop`, clean tree, in sync with `origin`), plus:

- the app release in `appVersion` must be an existing tag, and the new chart version must be newer
  than the latest `chart-v*` tag and not already tagged;
- `helm lint --strict` and `helm/ci/test.sh` must pass;
- if `Chart.yaml` changed, it is committed as `chore(release): prepare chart release chart-vX.Y.Z`;
  otherwise the current commit is tagged.

The chart tag is signed like an app tag (a signing key is needed, see above). Pushing the tag is what matters: `.github/workflows/helm-workflow.yml` verifies the tag against
`Chart.yaml`, checks the default image exists, refuses to overwrite a published version, then publishes
and signs `ghcr.io/f-eld-ch/charts/sitrep:<version>`.

Chart tags are kept out of the app's version and changelog: `cliff.toml` only matches `^v[0-9]`, and
`git describe` for `/version` and the UI uses `--match 'v[0-9]*'`.

---

## Versions at runtime

The version a running instance reports comes from the git tag, linked into the binary:

```
-X main.version={{ .Version }} -X main.sha={{ .FullCommit }}
```

It is served on `/version` and read by the UI's update prompt. Branch builds use
`git describe` instead (`v26.8.0-64-g136b9bf0`), so an untagged deploy still says exactly
what it is.

`version` in `ui/package.json` is **not** consumed by anything — the UI takes its version
from `/version`. It is kept in step by the release script so the repo doesn't carry a
stale number; nothing breaks if it drifts.

---

## Fixing a botched release

Artifacts are uploaded with `mode: replace`, so re-running against the same tag replaces
them. Move the tag and let CI run again:

```bash
git push origin :refs/tags/v26.9.2 && git tag -d v26.9.2
# fix, commit
git tag --sign --message "SitRep v26.9.2" v26.9.2 && git push origin v26.9.2
```

Container image tags are already published at that point and will simply be overwritten.
If a release is already public and people may have pulled it, prefer cutting a new patch
version over rewriting one.

---

## Rehearsing locally

Exercise the whole pipeline without a tag and without publishing anything:

```bash
goreleaser check                                  # validate the config
goreleaser release --snapshot --clean --skip=ko   # build everything locally
```

The build writes the web UI's SBOM into `kodata/` first (a `before:` hook that runs
[syft](https://github.com/anchore/syft)), so that the container image contains it. Install syft, or
add `before` to `--skip` when you do not need the SBOMs: `--skip=ko,before,sbom`.

Snapshot builds get a timestamped version (`26.9.2-snapshot.20260905083643+b25ff3b1`) so
each run produces a distinct package. Without that, a rebuilt `.rpm` keeps the same
name-version-release and `dnf` refuses to reinstall it.
