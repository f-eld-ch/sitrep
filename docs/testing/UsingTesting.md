# Installation
For installation see the Guide provided by Playwright. https://playwright.dev/docs/intro

# to run app without authentication
 go run . --config ./config.yaml serve --insecure-local-auth
# Configured test scripts
yarn run test:e2e //runs all test in folder test
yar run test:smoke // runs all test with tag @smoke



# Most useful commands
Run all tests
yarn playwright test

Run tests in ui mode
yarn playwright test --ui

run in a speciffic browser
yarn playwright test --project=chromium

run in headed mode to see in the ui
npx playwright test --headed

run a specific file
npx playwright test tests/example.spec.ts

run last failed tests
npx playwright test --last-failed

using code generator
npx playwright codegen http://localhost:3000/incident/list

--debug

Show HTML Test report
yarn playwright show-report