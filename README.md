# SitRep
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/10863/badge)](https://www.bestpractices.dev/projects/10863)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/f-eld-ch/sitrep/badge)](https://scorecard.dev/viewer/?uri=github.com/f-eld-ch/sitrep)


## Turn Crisis Into Clarity

Sitrep is a real-time situation management software for command staffs. Track, coordinate, and communicate during emergencies with a unified digital platform built for high-pressure decision-making. SitRep is build to not stand in your way by having to keep yet another system updated. It aims to simplify and digitize tedious manual processes and stream line message flow within a command center. It's build for civil protection services and not aiming towards military use. 

### Journal and Audit Logging

The central piece of SitRep is it's Journal. All incoming and outgoing messages and communications are logged into SitReps journal. Writing messages digital is proven to be faster and less error prone nowadays than writing messagesheets by hand. After the message logging a centralized triage person is triagin all messages to the approporate command staff recipiens - also this can be achieved fully digitalized - or messagesheets can be easily printed and multiplied. 

![Jornal](docs/images/Journal.png?raw=true "Journal-Editor")
![Triage](docs/images/Triage.png?raw=true "Triage")

### Digital Crisis Map

SitRep offers basic functionality to draw crisis maps aimed to inform command staff about the current situation. This is only an initial version and we aim to fully include this in the improve message routing flow through SitRep. It supports a basic subset of symbols available from the [Federal Office for Civil Protection FOCP](https://www.babs.admin.ch/en).

![Lage](docs/images/Map_Drawing.png?raw=true "Lage")
![Lagekarte](docs/images/Map_tilted.png?raw=true "Lagekarte")
![Satelliten](docs/images/Map_Sat.png?raw=true "Sateliten Karte")
![Gefahrenkarten](docs/images/Map_Gefahrenkarte.png?raw=true "Gefahren-Karte")

## Feedback & Feature Requests

All feedback and feature requests are welcome. Please check the [discussions](https://github.com/f-eld-ch/sitrep/discussions) and [open issues](https://github.com/f-eld-ch/sitrep/issues) first.


## Demo-Environment

The current develop version is automatically deployed to: [https://demo.sitrep.ch](https://demo.sitrep.ch)
The data is automatically cleaned periodically - don't use this environment to run your crisis!

Login is possible with your Github account or sign-up for a new account.

## Backed by F-ELD

SitRep is open-source software developed and stewarded by [F-ELD](https://f-eld.ch) - is a Swiss Non-Profit association. Their main purpose is to develop, improve SitRep and educate command staffs around Switzerland how to best leverage digital tools for Civil Protection purposes. 

### SitRep As A Service

[F-ELD](https://f-eld.ch) is offering SitRep as a managed service for organizations which are members of the F-ELD association.
The managed services are hosted on a secure infrastructure in Switzerland and are operated by the F-ELD team.
The hosting partner is [VSHN](https://www.vshn.ch). For further information, please reach out to [info@f-eld.ch](mailto:info@f-eld.ch).

## Translations

To correct or add **translations** we invite you to help us out [on Transifex](https://explore.transifex.com/f-eld/sitrep/).
We currently support the following languages:

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

## Partners and Supporters

<img src="https://www.szsv-fspc.ch/images/logos/logo_szsv_freigestellt.png" height="96px" alt="SZSV / FSPC"/>

<img src="ui/src/assets/vshn.svg" height="64px" alt="VSHN"/>
