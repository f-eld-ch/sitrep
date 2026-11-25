# SitRep

[![Release](https://img.shields.io/github/v/release/f-eld-ch/sitrep)](https://github.com/f-eld-ch/sitrep/releases/latest)
[![License: AGPL v3](https://img.shields.io/github/license/f-eld-ch/sitrep)](LICENSE)
[![Go version](https://img.shields.io/github/go-mod/go-version/f-eld-ch/sitrep)](go.mod)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/10863/badge)](https://www.bestpractices.dev/projects/10863)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/f-eld-ch/sitrep/badge)](https://scorecard.dev/viewer/?uri=github.com/f-eld-ch/sitrep)

## Turn Crisis Into Clarity

SitRep is real-time situation management software for command staffs. Track, coordinate and
communicate during emergencies on one digital platform built for high-pressure decision-making.

SitRep stays out of your way: it replaces tedious manual processes instead of adding yet another
system to keep updated, and it streamlines the flow of messages within a command centre. It is built
for civil protection services and is not aimed at military use.

![Dashboard with message list, situation map, people overview and resources](docs/images/dashboard.webp?raw=true "Dashboard")

## Features

### Journal and audit log

The Journal is the central piece of SitRep. Every incoming and outgoing message, whether by phone,
radio, e-mail or in person, is logged in it. Entering messages digitally is faster and less error-prone
than writing message sheets by hand, and every change is kept in an audit trail.

![Journal](docs/images/journal.webp?raw=true "Journal")

### Triage and message flow

A central triage person routes each message to the appropriate members of the command staff. This can be
done fully digitally, or message sheets can be printed and distributed. Triage also records the people
affected and the resources deployed, which feed the people and resource overviews on the dashboard.

![Triage](docs/images/triage.webp?raw=true "Triage")

### Digital crisis map

Draw crisis maps to keep the command staff informed about the current situation. Features are tied to
messages and take effect at the message's time, so a timeline lets you replay how the situation developed.
The map supports symbols from the [Federal Office for Civil Protection FOCP](https://www.babs.admin.ch/en)
and can be exported for printing.

![Situation map](docs/images/map.webp?raw=true "Situation map")

## Documentation

- **Users and administrators:** <https://sitrep.ch/docs/> covers using SitRep, installation, configuration,
  Helm deployment, access control and verifying releases.
- **Developers:** see [docs/development](docs/development), starting with
  [Getting Started](docs/development/GettingStarted.md), and [CONTRIBUTING.md](CONTRIBUTING.md).

## Try it

- [demo.sitrep.ch](https://demo.sitrep.ch) always runs the latest SitRep release. Its data is cleaned
  periodically and potentially visible to everyone, so don't use it to run a real incident. Log in with your
  GitHub account or sign up for a new account.
- dev.sitrep.ch runs the current state of the `develop` branch. It is not publicly available: only selected users can log in.

## Feedback and feature requests

All feedback and feature requests are welcome. Please check the
[discussions](https://github.com/f-eld-ch/sitrep/discussions) and
[open issues](https://github.com/f-eld-ch/sitrep/issues) first.

## Backed by F-ELD

SitRep is open-source software developed and stewarded by [F-ELD](https://f-eld.ch), a Swiss non-profit
association. Its purpose is to develop and improve SitRep and to teach command staffs across Switzerland how
to make the best use of digital tools in civil protection.

### SitRep as a service

F-ELD offers SitRep as a managed service to organisations that are members of the F-ELD association.
The service is hosted on secure infrastructure in Switzerland and operated by the F-ELD team. The hosting
partner is [VSHN](https://www.vshn.ch). For more information, reach out to [info@f-eld.ch](mailto:info@f-eld.ch).

## Translations

To correct or add **translations**, help us out [on Transifex](https://explore.transifex.com/f-eld/sitrep/).
Please don't edit the translation files directly: Transifex opens pull requests that update
`ui/src/i18n/locales/<lang>/translations.json`.
Supported languages:

- German (de)
- English (en)
- Italian (it)
- French (fr)

## License

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published
by the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
[GNU Affero General Public License](LICENSE) for more details.

## Partners and supporters

<img src="https://www.szsv-fspc.ch/images/logos/logo_szsv_freigestellt.png" height="96px" alt="SZSV / FSPC"/>

<img src="ui/src/assets/vshn.svg" height="64px" alt="VSHN"/>
