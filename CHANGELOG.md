# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Calendar Versioning](https://calver.org/) with patern **YY.MINOR.MICRO**.

## [Unreleased]

**Full Changelog**: https://github.com/f-eld-ch/sitrep/compare/main...develop

## v24.10.0
### Features
- **(map)** cleanup icon styling for map - ([8327e53](https://github.com/f-eld-ch/sitrep/commit/8327e5367b4347e90f002e07cd7753cf644f6a40)) - Daniel Aschwanden
- **(map)** improve map drawing synchronization (#447) - ([2ae1a2f](https://github.com/f-eld-ch/sitrep/commit/2ae1a2f4504c959a04eb64ed98d87e4641b6ae6c)) - Dani Aschwanden
- **(ui)** automatically update service worker - ([8879b4c](https://github.com/f-eld-ch/sitrep/commit/8879b4cfd96da98b57df7184231488144c0b19de)) - Daniel Aschwanden

### Bug Fixes
- **(sw)** update service worker - ([2e120d9](https://github.com/f-eld-ch/sitrep/commit/2e120d91d9dcb425bf5226a32ba21c50a4536a2d)) - Daniel Aschwanden
- **(ui)** make darkMode persistent - ([40e4e77](https://github.com/f-eld-ch/sitrep/commit/40e4e77f0bd4f6ad0295d433b4c0aeae8ecfb2e4)) - Daniel Aschwanden


### Miscellaneous Chores
- **(deps)** cleanup resolutions - ([29a664e](https://github.com/f-eld-ch/sitrep/commit/29a664e5132ceb1f1d94b91a6b5794c3784381e2)) - Daniel Aschwanden
- **(deps)** update rollup to 4.22.4 - ([8a7380e](https://github.com/f-eld-ch/sitrep/commit/8a7380e7e32636a6f37323b632e6063e328cfcc6)) - Daniel Aschwanden
- **(deps-dev)** bump the development-dependencies group (#446) - ([ba98b10](https://github.com/f-eld-ch/sitrep/commit/ba98b107dbf5b7462780f5f4ad338d789af80b73)) - dependabot[bot]
- **(deps-dev)** upgrade yarn to 4.5.0 - ([4e41a8d](https://github.com/f-eld-ch/sitrep/commit/4e41a8dfa8c97d1f8b05dd8218c236e9ce450e7d)) - Daniel Aschwanden
- **(deps-dev)** bump the development-dependencies group across 1 directory with 4 updates (#445) - ([72dcec4](https://github.com/f-eld-ch/sitrep/commit/72dcec4e1d0aa0e140311ce6333992383378cacd)) - dependabot[bot]
- adds CODEOWNERS file - ([e1b842d](https://github.com/f-eld-ch/sitrep/commit/e1b842d4a76718651fc211906edf41aa21042cdc)) - Dani Aschwanden
- update Changelog - ([505a014](https://github.com/f-eld-ch/sitrep/commit/505a014a6f0d94024583a174467ea811dbe80637)) - Daniel Aschwanden

**Full Changelog**: https://github.com/f-eld-ch/sitrep/compare/v24.9.0...v24.10.0

## v24.9.0
### What's Changed
- feat(map): also adjust imagery map with new style
- feat(map): improve map loading speed
- feat(map): improve styling of railways and aeroways
- feat(map): switch mapstyle to basemap vector tiles and enable housenumbers
- fix(map): improve map styling
- fix(map): prevent that style switching causes map to not move anymore
- fix(translations): improve French Translations (#442)
- chore(deps): bump @apollo/client from 3.11.4 to 3.11.5 in /ui (#411)
- chore(deps): bump @apollo/client from 3.11.5 to 3.11.6 in /ui (#417)
- chore(deps): bump @apollo/client from 3.11.6 to 3.11.7 in /ui (#419)
- chore(deps): bump @apollo/client from 3.11.7 to 3.11.8 in /ui (#422)
- chore(deps): bump @watergis/maplibre-gl-export in /ui (#407)
- chore(deps): bump dompurify (#435)
- chore(deps): bump i18next from 23.14.0 to 23.15.1 in /ui (#428)
- chore(deps): bump micromatch (#400)
- chore(deps): bump react-i18next from 15.0.1 to 15.0.2 in /ui (#433)
- chore(deps): bump react-router-dom from 6.26.1 to 6.26.2 in /ui (#426)
- chore(deps-dev): bump @eslint/js from 9.9.0 to 9.9.1 in /ui (#401)
- chore(deps-dev): bump @testing-library/jest-dom in /ui (#403)
- chore(deps-dev): bump eslint from 9.9.0 to 9.9.1 in /ui (#402)
- chore(deps-dev): bump jsdom from 24.1.1 to 25.0.0 in /ui (#405)
- chore(deps-dev): bump the development-dependencies group (#409)
- chore(deps-dev): bump the development-dependencies group (#416)
- chore(deps-dev): bump the development-dependencies group (#418)
- chore(deps-dev): bump the development-dependencies group (#431)
- chore(deps-dev): bump the development-dependencies group (#436)
- chore(deps-dev): bump the development-dependencies group across 1 directory with 3 updates (#443)
- chore(deps-dev): bump the development-dependencies group across 1 directory with 4 updates (#424)
- chore(deps-dev): bump the development-dependencies group across 1 directory with 6 updates (#430)
- chore(deps-dev): bump the development-dependencies group across 1 directory with 6 updates (#434)
- chore(deps-dev): bump the development-dependencies group across 1 directory with 7 updates (#415)
- chore(deps-dev): bump the development-dependencies group across 1 directory with 9 updates (#440)
- chore(deps-dev): bump ts-jest from 29.2.4 to 29.2.5 in /ui (#404)
- ci: improve dependabot configuration

### New Contributors
* @sebug made their first contribution in https://github.com/f-eld-ch/sitrep/pull/442

**Full Changelog**: https://github.com/f-eld-ch/sitrep/compare/v24.8.0...v24.9.0

## v24.8.0 
### What's Changed
* chore(deps-dev): bump @testing-library/jest-dom from 6.4.5 to 6.4.6 in /ui by @dependabot in https://github.com/f-eld-ch/sitrep/pull/374
* chore(deps-dev): bump @testing-library/react from 15.0.7 to 16.0.0 in /ui by @dependabot in https://github.com/f-eld-ch/sitrep/pull/370
* chore(deps-dev): bump @types/node from 20.12.11 to 20.14.10 in /ui by @dependabot in https://github.com/f-eld-ch/sitrep/pull/378
* chore(deps-dev): bump @types/node from 20.12.11 to 20.14.11 in /ui by @dependabot in https://github.com/f-eld-ch/sitrep/pull/380
* chore(deps-dev): bump @types/react from 18.2.48 to 18.3.3 in /ui by @dependabot in https://github.com/f-eld-ch/sitrep/pull/371
* chore(deps-dev): bump @types/react from 18.2.48 to 18.3.3 in /ui by @dependabot in https://github.com/f-eld-ch/sitrep/pull/381
* chore(deps-dev): bump @types/react from 18.3.3 to 18.3.4 in /ui by @dependabot in https://github.com/f-eld-ch/sitrep/pull/398
* chore(deps-dev): bump husky from 9.1.4 to 9.1.5 in /ui by @dependabot in https://github.com/f-eld-ch/sitrep/pull/396
* chore(deps-dev): bump jsdom from 24.0.0 to 24.1.0 in /ui by @dependabot in https://github.com/f-eld-ch/sitrep/pull/373
* chore(deps-dev): bump ts-jest from 29.1.2 to 29.2.4 in /ui by @dependabot in https://github.com/f-eld-ch/sitrep/pull/385
* chore(deps-dev): bump vite from 5.4.1 to 5.4.2 in /ui by @dependabot in https://github.com/f-eld-ch/sitrep/pull/395
* chore(deps-dev): bump vite-plugin-checker from 0.6.4 to 0.7.2 in /ui by @dependabot in https://github.com/f-eld-ch/sitrep/pull/375
* chore(deps): bump @watergis/maplibre-gl-export from 2.0.1 to 3.8.2 in /ui by @dependabot in https://github.com/f-eld-ch/sitrep/pull/382
* chore(deps): bump dayjs from 1.11.12 to 1.11.13 in /ui by @dependabot in https://github.com/f-eld-ch/sitrep/pull/391
* chore(deps): bump docker/build-push-action from 5 to 6 by @dependabot in https://github.com/f-eld-ch/sitrep/pull/389
* chore(deps): bump oauth2-proxy/oauth2-proxy from v7.5.1 to v7.6.0 by @dependabot in https://github.com/f-eld-ch/sitrep/pull/347
* chore(deps): bump the npm_and_yarn group across 1 directory with 2 updates by @dependabot in https://github.com/f-eld-ch/sitrep/pull/368
* chore(deps): update to maplibre 4.5.2 by @nimdanitro in https://github.com/f-eld-ch/sitrep/pull/399
* chore(deps): upgrade various dependencies by @nimdanitro in https://github.com/f-eld-ch/sitrep/pull/388

**Full Changelog**: https://github.com/f-eld-ch/sitrep/compare/v24.6.0...v24.8.0


## v24.6.0

### What's Changed
* feat(ui): enable DarkMode in UI by @nimdanitro in https://github.com/f-eld-ch/sitrep/pull/365
* fix(ui): adds missing autocomplete for email receiver details by @nimdanitro in https://github.com/f-eld-ch/sitrep/pull/357
* chore(deps-dev): bump vite from 5.1.4 to 5.1.7 in /ui by @dependabot in https://github.com/f-eld-ch/sitrep/pull/359
* chore(deps): bump ejs from 3.1.8 to 3.1.10 in /ui by @dependabot in https://github.com/f-eld-ch/sitrep/pull/362
* chore(deps): bump tar from 6.1.12 to 6.2.1 in /ui by @dependabot in https://github.com/f-eld-ch/sitrep/pull/360
* chore(deps): upgrade yarn and other dependencies by @nimdanitro in https://github.com/f-eld-ch/sitrep/pull/364
* enable multiplatform builds by @nimdanitro in https://github.com/f-eld-ch/sitrep/pull/363

**Full Changelog**: https://github.com/f-eld-ch/sitrep/compare/v24.2.3...v24.6.0


## v24.2.3

### Highlights
* Map is now fully synchronized with the backend and across subscribed clients from this incident. We consider the map still a beta feature but the basic functionality has been created. At the moment only one layer is supported. 

### What's Changed
* feat(map): sync map to backend by @nimdanitro in https://github.com/f-eld-ch/sitrep/pull/354
* feat(map): improve icon text coloring and alignment by @nimdanitro in https://github.com/f-eld-ch/sitrep/pull/355

**Full Changelog**: https://github.com/f-eld-ch/sitrep/compare/v24.2.2...v24.2.3

## v24.2.2
### What's Changed
* feat(ui): better incident name by @lukastresch in https://github.com/f-eld-ch/sitrep/pull/353
* chore(deps): bump ip from 2.0.0 to 2.0.1 in /ui by @dependabot in https://github.com/f-eld-ch/sitrep/pull/351

**Full Changelog**: https://github.com/f-eld-ch/sitrep/compare/v24.2.1...v24.2.2

## v24.2.1
### What's Changed
* feat(map): add custom style with B612 fonts to map by @nimdanitro in https://github.com/f-eld-ch/sitrep/pull/346
* feat(ui): add dedicated login page to initialize OIDC login flow

**Full Changelog**: https://github.com/f-eld-ch/sitrep/compare/v24.2.0...v24.2.1

## v24.2.0
### What's Changed
* feat(map): improve drawing UI for map, feature remains in beta with only locally synced features
* feat(ui): adds time / date to Navbar
* feat(ui): small improvements on overall design
* fix(map): adds missing icons and improved "Brandzone" and "Zerstört" polygon pattern.
* chore(deps): various dependency updates

**Full Changelog**: https://github.com/f-eld-ch/sitrep/compare/v24.1.1...v24.2.0

## v24.1.1
### What's Changed
* feat(map): improve Map Drawings to properly display start and end icons of lines

**Full Changelog**: https://github.com/f-eld-ch/sitrep/compare/v24.1.0...v24.1.1

## v24.1.0
### What's Changed
* feat(ui): change default font to [B612](https://b612-font.com/)
* feat(ui): adds autoscroll in feed
* chore(deps): upgrade various dependencies to their latest versions

### New Contributors
* @lukastresch made their first contribution in https://github.com/f-eld-ch/sitrep/pull/284

**Full Changelog**: https://github.com/f-eld-ch/sitrep/compare/v23.2.0...v24.1.0

## v23.2.0
This is release containing mainly dependency upgrades and security fixes

### What's Changed
* chore(deps): various dependency upgrades

**Full Changelog**: https://github.com/RedGecko/sitrep/compare/v23.1.0...v23.2.0

## v23.1.0
This is release containing mainly dependency upgrades and security fixes

### What's Changed
* chore(deps): various dependency upgrades

**Full Changelog**: https://github.com/RedGecko/sitrep/compare/v22.11.2...v23.1.0- chore(docker): add selinux compose file
