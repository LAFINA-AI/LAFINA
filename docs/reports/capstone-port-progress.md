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

## Stage 4 — reviewed assistant commands

- Chat, dictation, parser helpers and local-model paths cannot write before review.
  Private five-minute reviews display resolved local timing/timezone, recurrence,
  reminder lead and immediate delivery where applicable. Notes remain literal;
  task completion requires one exact title and a matching local revision.
- Schema 21 adds minimal operation receipts and SQL-triggered revisions, including
  sync writers. Confirm commits the item/reminder/job/outbox/receipt atomically.
  Failed transactions can retry; repeated Confirm does not duplicate an item.
- Source-linked edits refresh reminders atomically; source deletion never guesses
  ownership from titles. Calendar creation now links source and reminder together.
- TypeScript PASS; 106 suites / 876 tests PASS with normal exit; ESLint no errors.
  Command session 98.03% lines; command schema 100%; linked reminders 94.11%;
  review hook 100%; Voice sheet 80.6%; Chat 70.24%.
- Schema-compatible Android build PASS. Existing emulator DB opened and upgraded
  through versions 20 and 21 without reset. Nine native fixture checks PASS after
  installing the compatible build. Final concurrent-call recovery tweak is compiled;
  final installed-build smoke remains part of the closing device checks.

## Stage 5 — editable drafts and loss protection

- Recording ends in an editable draft. Prepare opens the exact review; only Confirm
  saves. Different transcripts and speech-to-Chat handoffs offer Keep/Replace with
  Keep first. Handoff only populates the composer and never sends or confirms.
- Close, Back, tab/tool navigation and clear-history controls protect unsent text.
  Saved items survive draft discard. Capture ownership is retired on close,
  background, account change and unmount; late grants/results cannot change a new
  session. Private reviews also survive React StrictMode setup correctly and retire
  on background/disposal. Drafts remain transient, with no transcript archive added.
- TypeScript PASS; 107 suites / 887 tests PASS with normal exit; ESLint no errors
  (244 warnings). Command session 98.03% lines; speech capture 93.33%; voice pipeline
  94.02%; Voice sheet 80.97%; Chat 78.75%; review hook 100%; draft guard 95.65%.
  Executable changed AI/storage/scheduler modules meet the 80% line requirement.
- Android debug and framework instrumentation builds PASS. Twelve native device
  checks PASS, now including actual PendingIntent hash-collision isolation,
  concurrent-call claim/release and schema-21 compatibility. No test package or
  runtime dependency was added.

## Installed-app emulator evidence and limits

- Existing API 37 x86_64 / 16-KB-page emulator data upgraded in place. Main React
  OP-SQLite and the private framework-SQLite process use the same database path.
  No database reset, reinstall-with-data-clear, downgrade or donor DB import occurred.
- Real keyboard input, the navigation Keep/Discard guard, exact schedule review,
  explicit Confirm and durable saved feedback were inspected in the installed app.
- The voice sheet's typed draft opened its review above the sheet. Android Back
  cancelled review while preserving text. Use draft in Chat populated the composer
  without Send/Confirm, and navigation prompted before discarding that draft.
- Synthetic task `CAPSTONE-Port-QA-Alarm` was explicitly reviewed for 2026-11-03
  07:03 Asia/Manila, with a 15-minute reminder at 06:48 (device clock was GMT).
  Android registered an exact wakeup at the reviewed time. Its notification was
  observed by 06:48:06 in airplane mode. The 06:48:45.539 timeout indicates a native
  claim about 0.54 seconds after the target; this is not an audible-latency measure.
- After posting, the main process was killed without force-stopping the package.
  Only `:reminders` remained. It removed the unanswered notification and registered
  the user's existing ten-minute snooze for 06:58:45.631 with JavaScript still absent.
- After resuming and cold-booting the emulator, the synthetic task was removed
  through its manual editor. It disappeared from the calendar and no LAFINA due or
  timeout alarm remained. Existing student records and chat history were preserved.
- Installed native debug APK SHA-256:
  `E6E87346DDAEC80D4D0BABE90834F8C329F863B8E2EB63F85FFF2E3E00F3EEE7`.
  JavaScript is supplied by the local Metro server; this is not a standalone release APK.
- All nine selected donor source hashes still match the frozen manifest. CAPSTONE
  remains unchanged; USTP remains the maintained base.

Implementation is present for all five items. Release qualification remains open:
no physical phone was connected, and the full reboot/locked-screen/Doze/permission-
revocation/clock-change/update-interruption matrix has not been certified. The
emulator evidence does not establish physical-device or production readiness.
