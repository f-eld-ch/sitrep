# Governance

This document describes how decisions are made in the SitRep project and who makes them. SitRep is
developed in the open for civil-protection organisations and is backed by the association
[Verein F-ELD](https://f-eld.ch) (the *Verein*), which owns the
[f-eld-ch](https://github.com/f-eld-ch) GitHub organisation. The model is deliberately small: a
maintainer team decides, the board of directors of the Verein is the final authority, and everyone can
propose.

## Roles

### Users and contributors

Anyone who uses SitRep, reports a bug, suggests a feature, improves the documentation or sends a
pull request. Contributors do not need any permission to take part. How to contribute is described
in [CONTRIBUTING.md](CONTRIBUTING.md); everyone is expected to follow the
[Code of Conduct](CODE_OF_CONDUCT.md).

### Maintainers

The maintainers (the core developers) are the members of the GitHub team
[`@f-eld-ch/core-development`](https://github.com/orgs/f-eld-ch/teams/core-development). **Every
core developer must be a member of the Verein F-ELD.** The team is listed as code owner of the whole repository in [CODEOWNERS](.github/CODEOWNERS), so every pull
request needs a review from it. Maintainers:

- review and merge pull requests, and triage issues;
- decide what goes into SitRep and what does not;
- cut releases (see [docs/development/Releasing.md](docs/development/Releasing.md));
- handle vulnerability reports (see the [Security Policy](.github/SECURITY.md));
- act as the community leaders for the [Code of Conduct](CODE_OF_CONDUCT.md).

### The board of directors of the Verein F-ELD

The board of directors (*Vorstand*) of the Verein is accountable for the project as a whole.
It has the final say if the maintainers cannot agree (see *Resolving disagreements*), and it is responsible for the GitHub organisation, its owners and the release infrastructure.
Day-to-day technical decisions are left to the maintainers.

## How decisions are made

- **Everyday changes** (bug fixes, small improvements, documentation, dependency updates) are
  decided in the pull request. One approving review from a maintainer, who is not the author, and a
  green CI are enough to merge.
- **Larger changes** (new features, changes to the architecture, the data model, the GraphQL API,
  the licence or the release process) are discussed in an issue first. Maintainers aim for
  *lazy consensus*: a proposal goes ahead when, after a reasonable time for comment (about one
  week), no maintainer has objected. Objections must say what would have to change.
- **Direction** (the roadmap and priorities) is set by the maintainers, informed by the issues
  and by feedback from the organisations that use SitRep.
- **Security fixes** may be developed privately and released before they are discussed publicly.

All decisions are recorded where they were made: in the issue or pull request, and in the commit
history. The changelog is generated from the commit messages.

## Resolving disagreements

1. The people involved discuss it in the issue or pull request and try to find a solution that
   everyone can accept. A technical argument counts more than a preference.
2. If they cannot agree, the maintainers decide by majority vote of the maintainer team. The author
   of the proposal takes part in the vote if they are a maintainer.
3. Any party, including a contributor who is not a maintainer, can bring an unresolved dispute to
   the board of directors of the Verein F-ELD. Disputes that the maintainers cannot settle (for example a
   tied vote) go there as well. The board decides according to the Verein's statutes.

The decision and its reasons are written down in the issue, and the discussion is closed. Anyone
who disagrees with the outcome can raise it again if there is new information.

Conduct problems are not handled by this process; they follow the enforcement guidelines in the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Becoming a maintainer

Contributors who have made regular, good-quality contributions and who understand the
architecture and conventions of the project can be invited to join the maintainer team,
provided they are (or become) members of the Verein F-ELD. Any maintainer can
propose a new maintainer; the existing maintainers agree by consensus, and an organisation owner
adds the person to the team.

A maintainer who is no longer active, who ends their membership of the Verein, or who repeatedly
violates the Code of Conduct, is removed from the team by the other maintainers or the board.
Maintainers can step down at any time.

## Changing this document

Changes to this document are proposed as a pull request and need the approval of a majority of the
maintainers.
