// Package sqlite is the SQLite-backed implementation of the event store ports
// and repository adapters. It provides EventStore, Transactor, Notifier,
// ProjectorLock, NoopSnapshotStore, WallClock, IDs, MessageCounter,
// IncidentHierarchyGuard, AccessGuard, IncidentAccessChecker,
// GlobalAccessChecker, and IncidentRetention.
//
// # Single-writer correctness
//
// SQLite permits at most one write transaction per database file (in WAL mode
// readers still proceed concurrently). This has two direct consequences:
//
//  1. Write transaction order equals commit order exactly. There is no
//     Postgres-style commit-visibility race (where a higher seq can commit
//     while a lower one is still in flight). The projector's catch-up loop
//     uses WHERE seq > ? ORDER BY seq and never skips an event that later
//     becomes visible — the single-writer constraint makes that impossible.
//
//  2. No commit-visibility watermark (pg_snapshot_xmin) is needed. The seq
//     column is strictly monotonic and never reused as long as AUTOINCREMENT
//     is used on eventsourcing_events (see migrations/sqlite/00001_eventsourcing.sql).
//
// NEVER enable BEGIN CONCURRENT: it breaks the single-writer invariant and
// reintroduces the commit-visibility gap that makes the watermark necessary.
//
// # MaxOpenConns(1) is load-bearing
//
// The writer database handle is configured with SetMaxOpenConns(1). This is
// not an optimisation — it is what enforces the single-writer contract in
// code that calls db.BeginTx outside a Transactor.WithinTx block. Without it,
// two goroutines can both obtain a connection and attempt to begin a write
// transaction; the second blocks in SQLite's busy loop, which is fine, but it
// also means the advisory-mutex workaround in service/incident.go and
// service/access.go (where guards are released with defer before tx.Commit)
// cannot provide its isolation guarantee. One connection closes that race
// structurally.
package sqlite
