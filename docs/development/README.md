# Developer documentation

Start with [Getting Started](GettingStarted.md): it sets up a local environment, lists the checks to run
before a commit and explains the database migrations. Contribution rules are in
[CONTRIBUTING.md](../../CONTRIBUTING.md).

| Document | Read it when you |
| --- | --- |
| [Getting Started](GettingStarted.md) | set up your machine, run the tests, add a migration |
| [Backend Architecture](Backend%20Architecture.md) | work on the Go backend: hexagonal layout, event sourcing, projectors, the PostgreSQL, SQLite and in-memory adapters |
| [RBAC](RBAC.md) | touch roles, permissions, groups or the access checker |
| [Incident Retention](Incident%20Retention.md) | work on automatic closing and archiving of incidents |
| [Feature Flags](FeatureFlag.md) | hide a UI feature behind a flag or remove a flag |
| [Releasing](Releasing.md) | cut a release of the application or the Helm chart (maintainers) |
| [Assurance](Assurance.md) | review the security assurance case: threat model, trust boundaries, known limitations |

Related guides that live next to the code:

- [AGENTS.md](../../AGENTS.md): backend conventions and mandatory gates (formatting, logging, tracing, testing, migrations)
- [ui/AGENTS.md](../../ui/AGENTS.md) and [ui/ARCHITECTURE.md](../../ui/ARCHITECTURE.md): frontend conventions and architecture

Documentation for users and administrators is not kept in this repository. It lives on the website,
<https://sitrep.ch/docs/>, whose source is [f-eld-ch/sitrep.ch](https://github.com/f-eld-ch/sitrep.ch).
