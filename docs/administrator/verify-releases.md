# Verifying releases

Every SitRep release is signed, and the build is attested, so you can check that what you
downloaded was built by the project's release workflow from the tagged source and was not
changed afterwards. The signatures are *keyless* ([Sigstore](https://www.sigstore.dev)): there is
no project key to distribute. The signer's identity is the release workflow in this repository,
which is recorded in a public transparency log.

| What | How it is protected | Check with |
| --- | --- | --- |
| Release files (`.tar.gz`, `.deb`, `.rpm`) | `checksums.txt` is signed, and the checksums cover every file | `cosign verify-blob`, then `sha256sum` |
| Container image `ghcr.io/f-eld-ch/sitrep` | signed image and build-provenance attestation | `cosign verify`, `gh attestation verify` |
| Helm chart `ghcr.io/f-eld-ch/charts/sitrep` | signed chart | `cosign verify` |
| Git tag `vYY.M.P` | signed tag | GitHub's *Verified* badge, or `git tag -v` |

You need [cosign](https://docs.sigstore.dev/cosign/system_config/installation/) (version 3 or
newer for the bundle format used below) and, for attestations, the
[GitHub CLI](https://cli.github.com) `gh`. The commands use `v26.11.3` as an example; replace it
with the version you are checking.

## Release files

Download `checksums.txt` and `checksums.txt.sigstore.json` from the
[GitHub release](https://github.com/f-eld-ch/sitrep/releases) next to the file you want, then:

```bash
# 1. the checksum file was signed by the release workflow for this tag
cosign verify-blob checksums.txt \
  --bundle checksums.txt.sigstore.json \
  --certificate-identity "https://github.com/f-eld-ch/sitrep/.github/workflows/release.yml@refs/tags/v26.11.3" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com

# 2. your download matches the signed checksums
sha256sum --check --ignore-missing checksums.txt
```

Both commands must succeed. `Verified OK` from cosign and `OK` for your file from `sha256sum` mean
the file is the one the release workflow produced.

The build provenance records which commit and workflow produced a file:

```bash
gh attestation verify sitrep_26.11.3_linux_amd64.tar.gz --repo f-eld-ch/sitrep
```

## Software bill of materials (SBOM)

Each release also contains SBOMs in SPDX JSON format: `<archive>.sbom.json` lists the Go modules in
a binary, and `sitrep-ui_<version>.sbom.json` lists the npm packages shipped in the web UI. Both
carry the license of each package where it is known. They are listed in `checksums.txt`, so the
check above covers them.

The container image also contains the UI's SBOM as `/var/run/ko/sitrep-ui.spdx.json`. The npm
packages are compiled into the single binary, so image scanners such as Trivy read that file to see
them, in addition to the Go modules they find in the binary itself.

The container image carries its own SBOM in the registry, as an image tagged
`sha256-<digest of the image>.sbom` in the same repository. It is not covered by a separate
signature; the image itself is (see below).

## Container image

```bash
cosign verify ghcr.io/f-eld-ch/sitrep:v26.11.3 \
  --certificate-identity "https://github.com/f-eld-ch/sitrep/.github/workflows/release.yml@refs/tags/v26.11.3" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com

gh attestation verify oci://ghcr.io/f-eld-ch/sitrep:v26.11.3 --repo f-eld-ch/sitrep
```

Tags such as `latest` and `v26` move; verify the version tag, or pin the image by digest
(`image.digest` in the Helm chart) and verify that digest. Run the checks before you deploy, for
example in your CI or with an admission controller that enforces cosign signatures.

## Helm chart

The chart has its own tags and is signed by the chart workflow:

```bash
cosign verify ghcr.io/f-eld-ch/charts/sitrep:1.2.0 \
  --certificate-identity-regexp '^https://github.com/f-eld-ch/sitrep/\.github/workflows/helm-workflow\.yml@refs/tags/chart-v' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

## Git tags

Release tags are signed by the maintainer who cut the release. GitHub shows *Verified* on the tag
and on the release page. To check locally, fetch the tags and run `git tag -v v26.11.3`; for that,
git needs the maintainer's public key (GPG keyring, or `gpg.ssh.allowedSignersFile` for SSH keys).

## If a check fails

Do not install the file or deploy the image. Report it privately, following the
[Security Policy](../../.github/SECURITY.md).
