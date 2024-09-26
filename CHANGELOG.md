# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Calendar Versioning](https://calver.org/) with patern **YY.MINOR.MICRO**.

## [Unreleased]

**Full Changelog**: https://github.com/f-eld-ch/sitrep/compare/main...develop

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
