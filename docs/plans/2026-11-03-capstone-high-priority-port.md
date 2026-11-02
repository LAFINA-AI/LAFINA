# CAPSTONE high-priority improvements into LAFINA-USTP

Date: 2026-11-03 (Asia/Manila)  
Status: Proposed implementation plan; implementation has not started  
Classification: Sprint 9 offline-core reliability and interaction hardening  
Target: `LAFINA-AI/LAFINA`, branch `LAFINA-USTP`, baseline `e84a96e2643636124932cba830c19ddd7068df3b`  
Reference: local `LAFINA-CAPSTONE`, HEAD `a53ea93f76021db1f0589e0e18fe68421815c0e8`, plus its reviewed uncommitted working-tree changes

## Objective and scope

Keep USTP as the maintained application and adapt these five previously identified high-priority improvements:

1. Review and confirm assistant commands before saving.
2. Durable alarm recovery and duplicate protection.
3. Collision-resistant Android alarm identities.
4. Safer database failure handling.
5. Editable speech drafts and protection against lost text.

Deliver small, independently verified changes in dependency order. CAPSTONE is a reference implementation, not a branch to merge wholesale. The current phase-based CAPSTONE database, package IDs, native reminder UI and project rules are not USTP migration inputs.

## Compatibility constraints

- All core behavior remains offline. No network dependency or cloud imports in `src/ai/`, `src/storage/` or `src/scheduler/`.
- Preserve USTP's Android application ID, signing/update compatibility, existing user IDs, database filename, records, column names and existing features.
- Preserve Whisper.cpp, Silero VAD, SmolLM2 and Kokoro. No model/library replacement, package installation, system speech recognizer or system-TTS migration is included.
- Preserve the required NLU JSON schema. Command proposals, reviews and delivery metadata use separate application types.
- Preserve the current reminder status vocabulary and soft deletion. Delivery/job status is separate; acknowledging a reminder never completes its task.
- Preserve existing explicit manual controls and USTP's answered-call voice behavior. The new Chat/scheduling review is not an extra confirmation dialog on every call ACK/snooze.
- Adapt USTP's existing sync and Last-Write-Wins behavior. Local generations and native registration metadata are device-local; a remote payload cannot supply an authoritative local alarm identity.
- Every new table must have UTC `created_at` and `updated_at`. Schema additions must upgrade installed USTP data; never copy CAPSTONE's database or downgrade an installation.
- Keep both repositories' unrelated changes intact. Do not read `.env` files.

## Stage 0 — Freeze references and record a baseline

Before implementation:

- Confirm the target branch is tracking the original repository's `upstream/LAFINA-USTP`, and record its current HEAD/status.
- Record hashes of only the selected CAPSTONE source and test files, including the uncommitted versions. Preserve a reviewed, non-sensitive donor snapshot outside the application runtime; do not commit donor databases, audio, build outputs or entire repository history.
- Inventory every USTP command execution route: typed Chat, voice sheet, direct offline voice pipeline, and existing note/task-completion commands. Identify routes that currently write before review.
- Inventory reminder creation/edit/delete/snooze/ACK, recurrence, guest migration, account switches, sync imports, native receivers and update restoration.
- Verify what the existing generic `job_queue_items` table owns. Leave it intact; dedicated delivery tables below avoid conflating reminder execution with unrelated queue work.
- Record the current schema version (18 at this plan's baseline), test results, APK/package/signature, available device/API/ABI and existing delivery limitations.
- Reproduce and isolate the Jest speech-capture timer/open-handle problem. A normal test-process exit is an acceptance gate; `--forceExit` is not a fix. If reproduced, address it as a separate focused prerequisite before implementation stages.

Exit: reviewed donor-file manifest, baseline evidence, complete entry-point inventory and no ambiguous ownership of command writes or alarm dispatch.

## Stage 1 — Harden USTP storage

Adapt CAPSTONE's `core/storage/plannerDatabase.ts` transaction guards and `openLocalDatabase.ts` initialization behavior to USTP's existing database API.

Expected USTP changes:

- `src/storage/database.ts`, `src/storage/dbInit.ts`, storage exports and focused resilience tests.
- A small typed storage-health contract, with recoverable startup/save messaging in the existing app/error UI.

Behavior:

- Report durable storage unavailable when native SQLite cannot open. Restrict the in-memory compatibility engine to an explicitly identified test/development path; production must never claim its writes are durable.
- Quarantine a connection after rollback failure. All later reads/writes through that connection must fail safely until successful controlled reopen or app restart.
- Reject async callbacks/thenables and unsupported nested use in synchronous transactions. Do not apply CAPSTONE's synchronous-only API blindly: USTP currently has an async migration transaction, which must first be audited and safely adapted or serialized.
- Ensure migration version/DDL/data commit atomically. Reject unsupported future schemas without resetting or deleting data.
- Run alarm, audio-cache and sync wakeup side effects only after successful commit. Do not tell the UI a save succeeded when required local rows were not committed.

Tests: open failure, migration failure/retry, write/commit failure, rollback failure followed by another operation, nested/async misuse, post-commit callbacks, existing preferences/guest/sync behavior, and recovery messaging.

Exit: failed durable writes cannot produce a success response, schedule an alarm or leave a reusable damaged connection; existing installed-data tests remain green.

## Stage 2 — Introduce delivery identities and durable job metadata

Adapt CAPSTONE's `ReminderIdentityKey.kt`, reminder models and atomic store-transition concepts to USTP records.

Expected USTP changes:

- Additive migrations in `src/storage/dbInit.ts` and typed delivery-store modules under `src/storage/`.
- Dedicated local `reminder_delivery_jobs`, `native_alarm_registrations` and bounded `native_alarm_events` tables; exact DDL, constraints and indexes are reviewed before coding.
- Native identity/policy helpers under `android/app/src/main/java/com/lafina/`, plus adapters in `src/scheduler/reminderAlarm.ts`.

Contract:

- Delivery identity includes user scope, reminder/job ID, occurrence key, generation and operation. Use losslessly encoded URI data plus notification tags; hash codes alone are not unique identities.
- Snooze, reschedule, cancellation/deletion and relevant accepted sync changes invalidate old identities. Late due/timeout/notification actions cannot mutate the replacement occurrence.
- Add stable source links for newly created task/event/time-block reminders. Legacy reminders without a reliable source ID remain explicitly standalone; never infer ownership by matching a title.
- Keep reminder-domain state, job execution state and delivery evidence distinct. Define a legal transition matrix using USTP's current statuses.
- Registration metadata survives source deletion/generation changes until old platform effects are cancelled. Bound diagnostics and omit titles, transcripts and audio.
- New metadata remains internal until cutover; do not enable competing native and JS dispatchers.

Tests: colliding Java string hashes, identical titles, overlapping occurrences, multiple users, stale generation/action/timeout, duplicate actions, migration from supported USTP fixtures, rollback during paired transitions and rejected future schema.

Exit: identity and persistence tests prove old platform actions cannot change newer jobs; existing reminder records and sync wire formats are preserved.

## Stage 3 — Cut over to recoverable native delivery

Adapt selected CAPSTONE `ReminderStore`, `ReminderRuntime` and registration-policy behavior. Keep USTP's incoming-call screens and speech pipeline.

Expected USTP changes:

- `LafinaReminderModule.kt`, `LafinaReminderReceiver.kt`, `MainApplication.kt`, `AndroidManifest.xml`, and narrowly scoped new delivery coordinator/store/transport files.
- `src/scheduler/reminderAlarm.ts`, `reminderActions.ts`, `reminderScheduler.ts`, `callDispatcher.ts`, relevant storage mutations, and `src/sync/syncWorker.ts` integration points.

Architecture and sequencing:

- Use the same USTP SQLite file as durable authority. If native Android SQLite is adopted, isolate its coordinator/store in a private `:reminders` process, following CAPSTONE's separation from the main-process OP-SQLite runtime. React must not initialize there.
- Record an ADR for the actual SQLite versions, journal mode, locking, busy timeout and startup/schema-readiness protocol. Test cross-process access before enabling native writes; do not copy a journal setting without checking USTP's current configuration.
- Use a narrow same-UID transport. Native code must reject unrecognized schemas and perform no JS schema migration.
- Commit a valid due claim before notification work. Record posting success/failure separately and reconcile interruption between those steps. Retry uses the same identity; exactly-once audible delivery is not promised.
- Preserve manual ACK/snooze, strict spoken-call handling and audio/session ownership. Capture the current delivery identity in the call session and revalidate it before applying a result.
- Make native status changes participate correctly in USTP's existing sync outbox, in the same durable transaction where required. Online transmission stays in `src/sync/`.
- Accepted sync edits/tombstones invalidate affected local generations and request post-commit reconciliation. Reject stale remote replay that would revive a terminal/deleted local occurrence under the established conflict policy.
- Define finite late-delivery grace, ringing deadline and retry policy explicitly in the ADR; preserve current USTP preferences unless a documented change is approved. Do not blindly copy CAPSTONE's timeout/snooze constants.
- Recover on app start, process restart, reboot/unlock, clock/timezone changes, app update and permission changes. Report permission-blocked or inexact delivery truthfully.

Legacy upgrade:

1. Read the existing USTP SharedPreferences alarm registry through a controlled migration adapter after SQLite is ready.
2. Build idempotent durable job records, preserving known pending work and classifying expired/terminal entries under the reviewed policy.
3. Capture all legacy alarm/notification identities needed for cancellation.
4. Reconcile registrations with one dispatch owner. Keep migration progress durable so interruption can resume without losing work or ringing twice.
5. Remove a legacy registry entry only after its durable replacement and platform cleanup are accounted for.

Tests: crash before/after claim and notification posting, duplicate broadcasts, concurrent alarms, old snooze actions, source edits/deletion, denied/revoked permissions, reboot/update restoration, migration interruption, sync-originated changes and native actions later synced online.

Exit: matched emulator and representative physical-phone scenarios demonstrate recovery and stale-action rejection. Native delivery must work with the JS process absent; force-stop limitations are documented accurately.

## Stage 4 — Add reviewed assistant commands

Adapt CAPSTONE's private, expiring `commandSession.ts` review lifecycle while preserving USTP's parser capability and NLU JSON shape.

Expected USTP changes:

- New typed proposal/session/executor modules under `src/ai/nlu/`.
- Refactor mutation entry points in `parser.ts`, `scheduler.ts`, `src/ai/index.ts`, `src/ai/native/voicePipeline.ts`, `ChatScreen.tsx` and `VoiceModal.tsx`.
- Add a small reusable command-review component and a durable `command_operation_receipts` store for idempotent execution.

Proposed contracts, separate from NLU output:

- `CommandProposal`: validated action, owner, resolved date/time/recurrence, reminder lead, exact target IDs and captured revisions where applicable.
- `CommandReview`: opaque ID/token, expiry and the exact summary displayed to the student.
- Session operations: propose, confirm, cancel and dispose. Only confirm reaches the mutation executor.
- `CommandExecutionResult`: committed outcome and separate alarm-registration availability; a saved item is not proof of alert delivery.

Behavior:

- Parsing and model inference create proposals only. Require review/Confirm for assistant-triggered mutations; queries/help remain immediate. Existing mutation helpers must not provide an accidental bypass, including note/task-completion paths reached through the assistant.
- Show the exact title, resolved local date/time/timezone, recurrence and reminder lead. Missing/ambiguous or conflicting input asks for clarification without writing.
- Use a five-minute review lifetime initially. Cancel on input replacement, account change, app background or session disposal. Revalidate clock/timezone, preferences and targets before Confirm.
- Use local revision checks or equivalent transactional compare-and-update checks across every relevant writer, including sync; do not rely on title matching or timestamp precision alone.
- In one transaction, apply the item/reminder/job writes and the operation receipt. Repeated Confirm/retry uses the same token and produces one durable result.
- Retain only minimal receipt metadata required for idempotency; do not copy raw commands, speech transcripts or superseded personal content into receipts/logs.
- Display success immediately after durable commit. Kokoro/audio-cache work must not delay the written result and begins only after commit.

Tests: zero writes before Confirm, cancel/expiry, duplicate tap/retry, failed commit/retry, changed/deleted/synced target, duplicate titles, account switch, changed reminder preferences, background/late model result and every inventoried execution route. Preserve USTP date/weekday/title and recurrence regressions.

Exit: assistant mutation routes share the reviewed executor; no NLU schema change or loss of existing scheduling grammar.

## Stage 5 — Integrate editable speech drafts and loss protection

Adapt CAPSTONE's `SpeechInputPanel.tsx`, `useSpeechInputSession.ts`, Chat draft guards and their behavioral tests to USTP's current UI components.

Expected USTP changes:

- `VoiceModal.tsx`, `ChatScreen.tsx`, their app navigation integration, and a small draft/session hook if justified.
- Reuse USTP's existing native capture IDs, cancellation and microphone-ownership mechanisms.

Flow: deliberate recording -> editable transcript -> prepare command -> exact review -> Confirm -> durable result.

- Releasing the scheduling microphone transcribes into a draft; it does not immediately schedule or auto-close as success.
- Editing a transcript cancels its previous proposal. Ask before replacing different nonblank typed text or copying over a Chat draft; keeping the current text is the safe default.
- Ask before navigation/close/clear would discard unsent text or an unconfirmed review. An already saved item is never undone by discarding its draft.
- Stop/cancel capture when the panel closes or backgrounds. Late permission grants, transcripts and retained handlers cannot update a newer session or perform a mutation.
- Speech handoff only populates the editable composer. It does not silently Send or Confirm.
- Keep drafts transient for this scope; no new transcript archive or automatic recording. Manual typing remains available on speech failure.
- Test Back, keyboard and accessible focus/labels on device. Keep the answered-reminder call flow distinct from scheduling dictation.

Tests: transcript correction, replace/keep, close/discard/keep, navigation with pending review, same-text handoff, cancellation before permission resolves, late result after reopening/background/account switch, microphone contention and successful reviewed scheduling.

Exit: speech text cannot silently overwrite another draft or commit a schedule before explicit confirmation.

## Verification and delivery gates

After each stage, run these commands in the required project order:

1. `npx tsc --noEmit`
2. `npm test` with a normal successful process exit
3. `npx eslint src/`

Then run coverage using the available approved package manager (`yarn test --coverage`, or the equivalent existing npm script), requiring at least 80% line coverage for changed AI/storage/scheduler paths and 60% for general modules. Baseline warnings are not proof of newly introduced errors being acceptable.

For native stages, also compile/build the affected Android variants and run real SQLite/Android identity, delivery and recovery checks. If a new native test harness requires packages, list them and obtain approval before installing. JS mocks do not replace native/device evidence.

Use synthetic/consented fixtures and isolated test profiles. Preserve real app data; do not clear storage, uninstall or force a downgrade to make an upgrade test pass. Test airplane mode, locked/background states, duplicate/concurrent alarms, process death, reboot, permission changes, clock/timezone changes, account switches and upgrade interruption. Record actual API/ABI, device, artifact hash, measured trigger drift and untested cases. Use the existing +/-30-second trigger target only under conditions where exact delivery is available.

Capture results and changed files per stage. A stage with only automated checks is reported as awaiting device validation where device checks are required. Do not declare the entire migration complete from passing Jest results.

## Commit, rollout and recovery approach

- One focused change set per stage, with prerequisite fixes kept separate. Implement on the USTP line; do not merge CAPSTONE history.
- During development, new delivery metadata is inert until its coordinator is ready. The cutover must have exactly one dispatch owner and a recoverable migration checkpoint.
- Preserve USTP's existing online features, account data, update behavior and manual planning as regression coverage throughout.
- Document schema minimums. Recovery after an installed migration uses a schema-compatible forward fix or explicitly compatible build; reverting Git alone is not a database rollback.
- Retain CAPSTONE's reference snapshots and provenance so later work can reuse its tests without reconstructing the same analysis.
- Implementation, package additions, commits and pushes are not performed by this planning task. Future implementation follows the project's plan-review workflow.

## Explicitly deferred

Personal memory, system TTS/STT alternatives, model changes, new offline conversation features, calendar pagination, general UI redesign, ABI/package-size work, new cloud features and a broad CI/architecture rewrite remain outside this five-item migration. Reuse focused CAPSTONE tests needed by the five items without turning this into a full CAPSTONE port.

## Planning validation

This plan is based on targeted source inspection and CAPSTONE graph queries. No implementation, dependency installation, schema migration, build, emulator action or repository publication is part of this planning task. Any commands run to validate the existing USTP baseline are reported separately; proposed device outcomes above are acceptance criteria, not completed tests.
