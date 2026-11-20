# Example incident "Unwetter Bergdorf – Murgang Dorfbach"

A fictional operation used for the documentation screenshots on sitrep.ch. Not committed
to the repository on purpose.

```
./start.sh            # build if needed, start on http://localhost:4181, seed when empty
./start.sh --reset    # wipe the SQLite database and attachments, then start and seed
./start.sh stop
```

- `config.yaml`: local configuration, SQLite database `bergdorf.sqlite3` in this folder,
  no login (`insecure-local-auth`).
- `seed.go`: creates the incident through the GraphQL API. Written in Go on the generated
  GraphQL models of the backend, so a schema change breaks it at compile time
  (`go run seed.go -h` for the flags). It has the build tag `ignore` and stays out of
  `go build ./...` and the linter. Messages 1 to 10 are triaged, message 11 is pending. Besides the main incident it creates a cantonal incident above two regional ones (the main one and a small second one) and a closed incident, for the incident list and the documentation of parent incidents. The
  documentation tutorials create messages 12 and 13 themselves.
- `features.json`: what is drawn on the Nachrichtenkarte (messages 1 to 9), replayed by the
  seed after the triage of each message. Created once by drawing by hand in the running
  instance and then exporting with `go run export-features.go` (reads `bergdorf.sqlite3`).
  To change the drawing: `./start.sh --reset`, draw in Lagebild → Nachrichtenkarte, export,
  and keep `features.json`.
- `screenshots/`: TypeScript and Playwright (system Chromium) for the documentation
  screenshots, one language at a time, see `screenshots/shots.ts`. Needs `npm install` in
  that folder once. The sections play the tutorials, so each language starts on a freshly
  seeded database.
- `run-all.sh`: resets the database and takes all screenshots for de, fr and it (about
  3 minutes per language). Seeds with today's date, so the map labels show only the time:
  `./run-all.sh` or `./run-all.sh fr`, `SECTIONS="base editor" ./run-all.sh de`.
- `install-screenshots.sh`: copies `screenshots/out/<lang>/` into `../sitrep.ch` (German to
  `static/images/docs/`, French and Italian to `static/images/docs/<lang>/`). Nothing is
  committed.
- Untranslated on purpose: Ressort names and message texts come from the seed (German).
- The UI is embedded in the binary: `cd ui && yarn build` first when the UI changed, then
  `./start.sh --rebuild`.
