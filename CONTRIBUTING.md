# Contributing to SitRep

Thank you for your interest in SitRep. It is used by civil-protection organisations during live
incidents, so we ask contributors to keep changes small, tested and easy to review.

By taking part you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to contribute

- **Report a bug or suggest a feature:** open an
  [issue](https://github.com/f-eld-ch/sitrep/issues/new/choose) and fill in the template.
- **Report a security problem:** do **not** open a public issue. Follow the
  [Security Policy](.github/SECURITY.md) and use GitHub's private vulnerability reporting.
- **Improve the documentation:** the developer documentation lives in
  [`docs/development`](docs/development). The administrator and user documentation is a separate
  repository, [f-eld-ch/sitrep.ch](https://github.com/f-eld-ch/sitrep.ch) (published at <https://sitrep.ch/docs/>).
- **Change the code:** see below.

## Before you start

For anything beyond a small fix, open an issue first (or comment on an existing one) so we can agree
on the approach before you spend time on it. Small, focused pull requests are reviewed faster than
large ones: one change per pull request.

## Set up your environment

[docs/development/GettingStarted.md](docs/development/GettingStarted.md) describes the local
environment (Docker Compose for Postgres and the OIDC provider, the Go server, the UI dev server).
Please also read the guide for the part you are changing. They hold the conventions below in full:

- Backend (everything outside `ui/`): [AGENTS.md](AGENTS.md) and
  [Backend Architecture](docs/development/Backend%20Architecture.md)
- Frontend (`ui/`): [ui/AGENTS.md](ui/AGENTS.md) and [ui/ARCHITECTURE.md](ui/ARCHITECTURE.md)

## Requirements for acceptable contributions

A pull request is accepted when it meets all of these.

### 1. It passes the checks

CI runs exactly these checks and rejects a pull request that fails any of them. Run them locally
before you push, in this order, because the formatter rewrites files:

**Backend (Go)**

```bash
golangci-lint fmt ./...
golangci-lint run ./...
go test ./...
```

**Frontend (`ui/`)**

```bash
yarn fmt && yarn lint && yarn typecheck && yarn test --run
```

Use these tools and not others (for example, not `gofmt` or Prettier). The rules are in
[`.golangci.yaml`](.golangci.yaml), [`ui/.oxfmtrc.jsonc`](ui/.oxfmtrc.jsonc) and
[`ui/.oxlintrc.jsonc`](ui/.oxlintrc.jsonc).

The repository ships [pre-commit](https://pre-commit.com) hooks that run the same gates. To install
them:

```bash
pre-commit install --hook-type pre-commit --hook-type commit-msg
```

### 2. It follows the coding standards and the architecture

- **Backend:** a Go application with hexagonal architecture, event sourcing and CQRS. `internal/core/`
  must not import infrastructure packages (this is enforced by the linter). Follow the conventions in
  [AGENTS.md](AGENTS.md): command signatures, typed `slog` attributes, OpenTelemetry spans on service
  methods, idempotent projection handlers (and a `Version()` bump when a handler changes), and
  compile-time interface assertions.
- **Frontend:** a React and TypeScript application. Views never import `@apollo/client` directly;
  they go through the anti-corruption layer in `ui/src/api/` (enforced by the linter). See
  [ui/AGENTS.md](ui/AGENTS.md).
- **GraphQL schema:** edit [`api/schema.graphql`](api/schema.graphql), then regenerate the code
  (`go generate ./internal/adapter/inbound/graphql/...` and `yarn codegen` in `ui/`). Never edit
  generated files by hand.
- **Database migrations:** add a new migration, never change one that was already released. Postgres
  and SQLite must stay in sync: a schema or data change needs a migration for both
  (`migrations/postgres/` and `migrations/sqlite/`).
- **Translations:** user-facing text is available in German, French, Italian and English. Add every
  new text to all four files in `ui/src/i18n/locales/`. Do not hard-code user-facing strings.
- **Dependencies:** keep new dependencies to a minimum and explain why they are needed in the pull
  request. Do not edit lock files by hand (`go.sum`, `ui/yarn.lock`). The dependencies must be
  compatible with the [AGPL-3.0](LICENSE) licence.

### 3. It is tested

- A new feature or a bug fix comes with tests that fail without the change. The tests use
  [testify](https://github.com/stretchr/testify) (`assert` and `require`) in Go and
  [Vitest](https://vitest.dev) in the UI.
- The backend tests do not need a database: they use the in-memory stack. See the *Testing* section
  of [AGENTS.md](AGENTS.md).
- Tell us in the pull request how you checked a change in the running application when the tests
  cannot show it (for example a map or layout change).

### 4. It is documented

- Update the developer documentation in [`docs/development`](docs/development) when you change the
  architecture or the development process, and the administrator and user documentation in
  [f-eld-ch/sitrep.ch](https://github.com/f-eld-ch/sitrep.ch) when you change behaviour, configuration or
  deployment (including the Helm chart in [`helm/`](helm/)). Open a matching pull request there.
- Do not edit [CHANGELOG.md](CHANGELOG.md): it is generated from the commit messages at release time.

### 5. It does not contain sensitive data

SitRep handles information about real incidents. Do not commit real incident data, personal data,
database dumps, credentials, certificates or your local `config.yaml`. Use made-up data in tests and
examples.

## Commit messages and pull request titles

We use [Conventional Commits](https://www.conventionalcommits.org), scoped by area:

```
feat(incident): add ChangeLocation command
fix(map): preserve rotated popup positioning
docs(admin): describe the map tile options
chore(migrations): add 00006_drop_readmodel_fks
```

The pull request **title** is checked in CI and must follow the same format. The commit messages and
titles are used to generate the changelog, so describe the change from the user's point of view.

Reference the issue the change belongs to in the description (for example `Closes #123`).

## Submitting a pull request

1. Fork the repository and create a branch from **`develop`** (not `main`), for example
   `fix/triage-division-translation`.
2. Make your change and run the checks above.
3. Open a pull request against `develop`. Describe what changed and why, how you tested it, and what
   you could not test.
4. Keep the branch up to date with `develop` and answer review comments. A maintainer from the core
   development team ([CODEOWNERS](.github/CODEOWNERS)) reviews every pull request. It is merged when
   CI is green and the review is approved.

Maintainers cut releases from `develop`, see [docs/development/Releasing.md](docs/development/Releasing.md).

## Use of AI assistants

You may use AI coding assistants. You are responsible for every line you submit: read it, run the
checks, and make sure you understand the change and are allowed to contribute it.

## Licence of your contribution

SitRep is licensed under the [GNU Affero General Public License v3.0 or later](LICENSE). By
submitting a contribution you agree that it is licensed under the same terms.

## Questions

If something here is unclear, open an issue or start a discussion in the pull request. We are happy
to help you get your first contribution merged.
