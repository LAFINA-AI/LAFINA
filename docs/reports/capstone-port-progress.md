# CAPSTONE high-priority port — implementation evidence

Target: original LAFINA repository, `LAFINA-USTP`. Scope: the five items in
`docs/plans/2026-11-03-capstone-high-priority-port.md`.

## Prerequisite / Stage 0

- Preserved nine selected donor working-tree files in a temporary reference snapshot;
  SHA-256 provenance is in `capstone-port-reference.json`. CAPSTONE was not modified.
- Fixed cancelled captures leaving their 90-second watchdog alive when native results
  never settle, and synchronous native start errors retaining microphone ownership.
- Fixed meeting-provider tests leaving mounted providers and interval timers alive.
- TypeScript passed; 100 Jest suites / 838 tests passed with normal process exit
  (`npm test -- --maxWorkers=2`); ESLint passed with warnings only.
- No physical phone or emulator was connected during these checks. No device outcome
  is inferred from these host tests.

## Stage 1 — storage

- Test-only volatile fallback; production failures cannot claim durable saves.
- Quarantined rollback failures, expiring transaction handles, nested/async sync-callback
  guards, and async-transaction ownership checks.
- Synchronous atomic schema setup; session DDL moved out of import-time execution;
  unsupported future schemas and failed integrity checks stop before schema writes.
- Startup shows recovery guidance rather than proceeding with unsafe storage.
- TypeScript PASS; 101 suites / 846 tests PASS with normal exit; ESLint no errors.
  Database line coverage 90.86%; schema initializer 98.47%.

## Stage 2 — delivery metadata and identity

- Schema 19 adds local jobs, retained platform registrations and bounded redacted events.
  SQLite triggers pair reminder changes with delivery work for every writer, including sync.
- Generations retire on snooze/edit/delete; due claims retain their identity; cache-only
  updates do not invalidate calls. Legacy rows remain standalone until explicitly linked.
- Full URI identities include user, reminder, occurrence, generation and operation.
- TypeScript PASS; 102 suites / 854 tests PASS; ESLint no errors; Kotlin compile PASS.
  Focused delivery-store line coverage 94.44%; delivery-schema coverage 100%.
- The configured API 37 x86_64 emulator is booted. Native delivery cutover is not yet active.

## Stage 3 — native delivery cutover

- Schema 20, a private `:reminders` SQLite coordinator, full-URI alarms and tagged
  notifications replace the preference-registry dispatcher. Claims, status changes
  and sync outbox entries commit together; delivery receipts remain separate.
- Captured delivery identities fence voice results, ACK/snooze, late UI events and
  cleanup. Registration failures preserve committed work for recovery.
- TypeScript PASS; 104 suites / 862 tests PASS with normal exit; ESLint no errors.
  Changed coordinator adapters/actions exceed 80% line coverage.
- Debug APK and framework-only instrumentation APK built and installed in place on
  API 37 x86_64. Nine isolated real-SQLite native checks PASS: claim, duplicate and
  stale claims, receipt/reopen, bounded retry state, source invalidation, rollback,
  and future-schema refusal. The fixture never opens or clears the student DB.
- Android's default compatibility WAL initially conflicted with the reviewed DELETE
  journal protocol; explicit OpenParams fixed it. ADR-001 records the protocol.
- Main app and isolated reminder process launch after the update. Full application
  migration/notification smoke and representative physical-phone QA remain pending;
  passing fixture checks do not certify those scenarios.

Stages 4–5: pending implementation and verification. No new packages or model changes.
