# ADR-007: explicit isolated SQLite diagnostics in QA builds

Date: 2026-11-04. Status: accepted within the eight authorized follow-ups.

Only the native build-type gate for the standalone development-signed QA variant
permits allocation and exposes the Profile controls. Missing native support and
production/debug variants fail closed. Reading diagnostics never starts speech or
recording. The UI requires an active account, foreground, current visibility and
current render ticket; closing, switching accounts or backgrounding retires results
and retained actions.

The native module creates one owned UUID-named SQLite file under canonical cacheDir.
It accepts neither caller-selected directories nor student database names. Release
requires ownership and deletes only that fixture and SQLite sidecars. JavaScript
uses its own OP-SQLite connection and injected query executor, without changing the
global application handle. All rows are synthetic; no student SQL or content is
returned. Production schema helpers and Notes queries run against the fixture.

Allocation and release waits have two-second bounds; late allocation is observed
and released. SQL is synchronous with a 200-statement/four-second budget checked
between statements and a one-second SQLite busy timeout. This cannot preempt an
individual native statement; it is a bound on this small fixed fixture, not a
hard real-time watchdog. Connection close and native deletion run in cleanup.
Cleanup failure is visible and never reported as success. Process death can leave
a synthetic cache file for Android cache reclamation; it contains no student data.

Host isolation/failure/lifecycle tests, native authorization/deletion checks and the
installed offline QA screen validate this boundary. Two real emulator runs each
passed 14 checks and confirmed fixture removal. These regressions do not certify
physical-phone speech, energy usage or vendor database performance.
