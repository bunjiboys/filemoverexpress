# Research: BBolt replacement evaluation for the CLI local store

Status: research only (no code change proposed yet)
Date: 2026-10-04
Scope: `src/cli` local persistence (the `checksum-cache.db` BBolt store)

## Motivation

The CLI uses BBolt (`go.etcd.io/bbolt v1.5.0`) for local persistence. The choice
has not been reviewed in ~6 years. The concern raised: BBolt takes an exclusive
OS file lock, which prevents multiple daemons / processes from sharing the store
and complicates concurrency and management. This document records what BBolt is
actually used for, what the realistic alternatives are, and a prototype
benchmark of the leading candidate (`modernc.org/sqlite` in WAL mode) against
BBolt.

## How BBolt is used today

Only two files touch BBolt:

- `src/cli/types/databasetypes/database.go`
- `src/cli/types/checksumtypes/checksumtypes.go`

One file (`checksum-cache.db`) with five buckets, all pure key/value with
JSON-marshalled values:

| Bucket            | Access pattern                                                 | Hot? |
|-------------------|----------------------------------------------------------------|------|
| `checksum_cache`  | Get/Put/Delete by abs-path key; age-pruned (>175h) every 30min | Yes  |
| `objects`         | Get/Put/Delete by SHA256 key; download dedup cache             | Warm |
| `uploads`         | append-only via NextSequence, capped at 30, pruned every 2min  | Low  |
| `downloads`       | append-only via NextSequence, capped at 30, pruned every 2min  | Low  |
| `list_timestamps` | declared, barely used                                          | Cold |

Concurrency control today: a single process-global `sync.Mutex` (`DBLock`)
layered on BBolt's own single-writer transaction model, plus `.Batch()`
coalescing and `BulkStoreObjects` for batched writes. The code already treats
writes as expensive and actively avoids contention.

Key property: **every value in this store is a cache or an ephemeral record.**
Nothing is a source of truth. Checksums can be recomputed from the file; the
object cache can be rebuilt by re-listing S3; transfer records are capped and
pruned. This makes migration risk low: a new store can start empty and
repopulate, with no data-migration step.

## The core distinction

The original concern bundles two different problems. Only one is a real limit:

1. **Threads within one process.** BBolt handles this correctly: one writer at a
   time, unlimited concurrent readers via MVCC. The `DBLock` mutex is largely
   redundant with BBolt's own locking here. This is not a BBolt weakness; it is
   the correct design for an embedded store.
2. **Multiple daemons (separate processes on one file).** BBolt takes an OS
   `flock`, so a second process blocks (the 5s `Timeout`, then `Fatal`). **This
   is not fixable by swapping the KV engine.** BadgerDB, Pebble and LevelDB all
   take an exclusive directory lock too; it is the defining property of an
   embedded database. SQLite is the only common exception, and only in WAL mode.

So the honest framing: if the goal is a better-maintained single-process
embedded store, BBolt is already a good fit. If the goal is genuinely concurrent
daemons sharing state, only SQLite/WAL (or an architectural change to a store
service) delivers it.

## BBolt maintenance status

BBolt is **not abandoned, but deliberately frozen.** The v1.4 and v1.5
changelogs state there has been no production code change since v1 / v1.4.0-beta.
It is maintained by SIG-etcd (it is the storage engine under etcd/Kubernetes),
with a stable API and fixed file format, used at up to 1TB scale. "No change in
6 years" is maturity, not rot. This weakens the "it is old" motivation; it does
not weaken the concurrency motivation.

## Candidate comparison

| Option                         | Multi-process?             | In-process concurrency      | Pure Go       | Fit for cache use                              | Migration cost |
|--------------------------------|----------------------------|-----------------------------|---------------|------------------------------------------------|----------------|
| Stay on BBolt                  | No (flock)                 | 1 writer / N readers (MVCC) | Yes           | Excellent                                      | Zero           |
| BadgerDB (dgraph-io)           | No (dir lock)              | 1 writer / N readers (LSM)  | Yes           | OK; faster writes, higher RAM/disk, compaction | Medium         |
| Pebble (cockroachdb)           | No (dir lock)              | LSM, concurrent             | Yes           | Overkill; tuned for CockroachDB, heavier       | Medium-High    |
| SQLite (modernc, pure Go)      | Yes (WAL: N readers + 1 W) | WAL: readers never block W  | Yes (no cgo)  | Good; adds multi-process + queryability        | High           |
| SQLite (mattn/go-sqlite3)      | Yes (WAL)                  | WAL                         | No (cgo)      | Good; cgo complicates cross-compile            | High           |
| Plain files / JSON per key     | Partial                    | OS-dependent                | Yes           | Poor for the hot checksum path                 | High           |

The two that move the needle:

- **Stay on BBolt** if the motivation is maintenance + single-process ergonomics.
  Swapping to Badger/Pebble buys nothing on the multi-daemon front and adds LSM
  compaction, higher memory, and value-log GC to tune: a net operational
  increase for a checksum cache.
- **`modernc.org/sqlite` in WAL mode** is the only candidate that delivers
  concurrent multi-process access, and it is pure Go (no cgo), which matters for
  the project's Windows/Linux/macOS cross-compilation requirement.

## Prototype benchmark

A standalone benchmark modelled FME's checksum-cache access pattern (key = abs
file path, value = JSON ChecksumRecord ~345 bytes) against BBolt v1.5.0 and
`modernc.org/sqlite` v1.60.1 in WAL mode (`synchronous=NORMAL`,
`busy_timeout=5000`, `mmap_size=256MiB`, `cache_size=64MiB`). SQLite reads use
one dedicated connection + prepared statement per reader goroutine.

Phases (all time-bounded so no phase can hang): single-write latency (capped
sample, one txn per key), 2s concurrent reads (N readers), 2s mixed (N readers +
1 writer simultaneously), and a prune (delete ~half the records by age).

Hardware: Apple Silicon (arm64), Go 1.26, 8 readers.

### Results, n=50000

| store                | single-write | pure read   | mixed-read  | mixed-write | prune   |
|----------------------|--------------|-------------|-------------|-------------|---------|
| BBolt v1.5.0         | 99 w/s       | 781,095 r/s | 685,536 r/s | 107 w/s     | 64.0 ms |
| modernc sqlite (WAL) | 34,131 w/s   | 258,515 r/s | 106,282 r/s | 3,638 w/s   | 83.5 ms |

Ratios were confirmed stable from n=2000 to n=50000.

### Interpretation

- **Writes: SQLite WAL wins by ~345x on single writes and ~34x in the mixed
  phase.** BBolt fsyncs a B+tree per transaction; SQLite WAL appends a frame.
  This is the decisive axis for the stated concern (lock contention,
  serialization). SQLite does not need the global `DBLock` to stay fast under
  write pressure, and WAL readers never block the writer.
- **Reads: BBolt wins by ~3x** (781k vs 259k r/s). BBolt returns a zero-copy
  mmap'd slice; SQLite pays `database/sql` + the pure-Go VM per lookup. Both are
  far above FME's actual hot-path floor, which is file I/O (reading the media to
  hash it), so read speed is not the bottleneck for either store.
- **Prune: converges at scale** (~64-84 ms, both sub-100ms, off the hot path).
- **Dataset-independence:** the single-write and pure-read ratios barely moved
  across a 25x size increase, so the comparison is reproducible, not an artifact
  of a particular dataset.

## What the prototype did NOT test

The single-process benchmark cannot demonstrate the actual multi-daemon
scenario, which is the real question behind "exclusive locks preventing multiple
daemons." That requires a two-process test on the same DB file: BBolt is expected
to flock-block / timeout, SQLite WAL is expected to let both proceed. That test
would prove or disprove the premise directly.

## Recommendation

1. **Decide the goal first.** The pains listed (multi-daemon, management,
   concurrency) are inherent to embedded KV stores, not specific to BBolt.
   - If the goal is "better single-process store": BBolt is already the right
     answer. Keep it. Consider dropping the redundant `DBLock` where BBolt's own
     transaction locking suffices.
   - If the goal is "concurrent daemons sharing state": `modernc.org/sqlite` in
     WAL mode is the only drop-in-ish candidate that changes the concurrency
     story, and it stays pure-Go for the three target platforms.
2. If pursuing SQLite, run the two-process test next to confirm the multi-daemon
   premise, then prototype the real `checksum_cache` hot path end to end.
3. Migration risk is low regardless: all cached data is reconstructable, so a new
   store can start empty and repopulate without a data-migration step.

## Appendix: benchmark reproduction

The prototype lives outside the tracked tree (it is a throwaway module, not part
of the build). It was a standalone `go` module depending only on
`go.etcd.io/bbolt@v1.5.0` and `modernc.org/sqlite@v1.60.1`, run as:

```
go run . -n 50000 -readers 8 -serial-writes 1000
```

Harness notes for anyone rebuilding it:

- Every phase is time- or count-bounded; an earlier unbounded read phase and an
  unbounded one-txn-per-key write phase caused multi-minute hangs at large n.
- Create the SQLite DB file inside a normal writable directory, not `$TMPDIR`,
  when running under a sandbox whose `$TMPDIR` the modernc VFS cannot open
  (observed error 14 SQLITE_CANTOPEN; a harness artifact, not a SQLite limit).
- SQLite reads must use one connection + prepared statement per reader goroutine;
  a single shared `*sql.Stmt` serializes readers and understates read throughput
  by ~40%.
