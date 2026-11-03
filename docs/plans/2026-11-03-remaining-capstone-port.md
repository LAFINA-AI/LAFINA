# Remaining CAPSTONE improvements into USTP

Date: 2026-11-03, Asia/Manila
Authorization: owner requested a plan followed immediately by implementation.
Baseline: `373be8c`, original `LAFINA-AI/LAFINA` branch `LAFINA-USTP`.
Classification: Sprint 9 offline reliability, usability and evaluation follow-up.

USTP remains the application, schema and feature base. CAPSTONE is a read-only
reference. Preserve accounts, cloud features, existing records, reminder identities,
models, recurrence grammar and the fixed NLU JSON contract. No new npm/pip package
is planned. No `.env` contents may be inspected. No automatic personal learning,
unrestricted conversational memory or multi-turn clarification is included: these
were identified as unimplemented research, not reusable CAPSTONE features.

The owner explicitly approved optional native Android on-device STT and installed
offline system TTS, retaining Whisper/Kokoro as defaults. English remains the speech
language. No generic/network recognizer or silently downloaded voice is allowed.

## Dependency order and scope

### 0 — Account-safe Chat history

Give each account its own default session. Validate ownership on reads, writes,
attachment lookup and clearing. Preserve the existing shared session only for its
recorded owner; never reassign old messages to a newly active user. An ambiguous or
missing legacy owner is not guessed. UI asynchronous work must retain account scope.

Files: `src/storage/chatStore.ts`, Chat callers/tests and a focused migration test.
Types: owner-scoped Chat session/message operations. Dependencies: existing SQLite.
Tests: two accounts, legacy history preservation, forged session ID, clear/share
isolation, switching accounts and database write errors. No destructive data reset.

### 1 — Bounded planner and Chat queries

Add typed, owner-scoped task/event/block pages and date-window reads. Expand only
recurrences needed by the visible calendar range. Add cursor-based Chat history
loading while preserving durable history and generated attachments. Existing full
reads remain available for explicit export/analytics compatibility.

Files: new `src/storage/plannerQueries.ts`, `chatStore.ts`, calendar data hook,
`ChatScreen.tsx`, storage/UI regression tests.
Types: `PlannerPage`, `PlannerQuery`, `ChatPage`, stable cursors with ID tie breakers.
Tests: >one page, equal timestamps, multiple users, completed/undated items, recurring
and overlapping items, boundary dates, malformed cursors, and pagination UI.

### 2 — Planner-aware offline Chat and command guide

Answer supported task/agenda questions from the actual local database. Add bounded
whole-message greetings/help/thanks and polite request normalization without
consuming a greeting followed by a planner request. Supply a tested guide of
selectable examples. Read-only replies do not create reviews or call the model.

Files: new `src/ai/nlu/plannerConversation.ts`, request normalization/guide data,
Chat integration, a guide component, parser/session tests.
Types: separate application-level query/reply types; leave NLU JSON unchanged.
Tests: live saved data, today/tomorrow/explicit date, completed/open tasks, empty and
truncated results, unsupported/negative input, mixed greeting/request, quoted titles,
online/offline Chat routes and guide-example parity.

### 3 — Broader reviewed commands and untimed tasks

Extend the private reviewed executor to create undated/date-only tasks and real
events, and move/delete one exact task/event/block target. Keep existing reviewed
notes, completion and timed task/block behavior. Add explicitly named ringing
reminder ACK/snooze through the same durable delivery fences. Never infer a target
from similarity. No bulk delete or automatic recurring-series mutation.

Files: `commandSession.ts`, command parsing/types, existing stores, delivery actions,
review UI/guide and focused tests. Add source-store transaction parameters only as
needed. Model output is still a proposal and cannot invoke a mutation directly.
Types: private discriminated command actions, exact target ID/revision snapshots.
Tests: no writes before Confirm; cancel/expiry, duplicate retry, changed/deleted
target, same-title ambiguity, rollback, linked reminder refresh/cancellation, account
switch, missing time when a reminder is requested, and no alarm for an untimed task.

### 4 — Reminder health and recovery controls

Expose existing native permission helpers and bounded local delivery diagnostics in
Profile. Show notification/exact/full-screen access, queued/blocked/inexact work and
safe recovery actions. Refresh after Android settings returns. Missing native support
must display unavailable rather than a fabricated healthy state.

Files: new storage/scheduler health adapters and `ReminderHealth` UI, Profile/native
bridge where necessary, Jest and native checks.
Types: `ReminderHealthSnapshot` with permission availability separate from delivery
evidence. Tests: denied/revoked/unavailable access, inexact registration, recovery
failure, account changes, stale refresh and navigation to settings.

### 5 — Explicit local personal memory

Add opt-in, per-account event-draft start-time/duration preferences, with review,
correction, disable and Forget controls. Values are structured/allowlisted and may
expire. Only offer defaults for a new event draft; applying an offer edits the draft,
not saved events. Existing event edits and reminders are independent. Never infer
facts from Chat, Notes, onboarding, snoozes or accepted defaults.

Files: new storage memory schema/store, memory session/service, Profile manager,
event form offer and tests; additive `dbInit` migration and explicit compatible
native schema policy update. All new tables include UTC creation/update timestamps.
Types: `PersonalMemory`, `MemoryControl`, reviewed token, epoch/revision, exact offer.
Tests: persistence, account isolation, correction, expiry/clock invalidity, disabling,
Forget, retained stale Save/Apply, rollback, schema upgrade and native rejection of
future versions. Forget does not claim forensic erasure or delete independent events.

### 6 — Architecture-specific Android packaging

Create per-ABI APKs for existing supported phone/emulator architectures, preserving
`com.lafina`, signing configuration, model assets and installed-data compatibility.
Provide a documented build command and artifact inspection/hash/size report. Do not
promise a size/speed gain until comparing matching builds. Keep the release network
capability required by USTP's existing online features.

Files: Android Gradle configuration, existing scripts/package scripts and build docs.
Tests: Gradle configuration/compilation, APK ABI/model/JS inspection, signature/package
checks and compatible emulator update. Physical ARM64 install is pending a phone.

### 7 — Optional Android speech engines

Add typed native engine capability checks and English on-device recognition only
where Android supports it. Add optional installed offline system TTS with explicit
voice selection/preview/Stop, bounded initialization/utterance timeouts and audio
ownership. Persist per-account engine choices; defaults remain Whisper and Kokoro.
Unavailable selections retain typing/text and clear setup feedback. No silently
changed engine, cloud speech, model download or background recording.

Files: narrow Android Kotlin bridges, `src/ai/native`/`src/ai/tts` adapters, speech
settings/Profile UI and tests. Dependencies: Android platform APIs only.
Types: `SpeechEnginePreference`, capabilities, structured result/error, owned request.
Tests: unavailable/offline/network-only voices, timeout/cancel, stale callbacks,
account/background changes, capture contention, malformed native results and default
engine regressions. APK compile and emulator capability/UI checks; real audibility,
microphone quality and phone speed require actual hardware evidence.

### 8 — Truthful statistics and repeatable verification tools

Replace the artificial voice-command `+3` with real recorded evidence or an explicit
unavailable value. Add local architecture-boundary and guide consistency checks,
synthetic SQLite/query benchmarks, APK inspection and a concrete phone QA checklist.
Do not run benchmarks against real student data or label host timing as phone timing.

Files: Profile/statistics storage adapter, scripts, package scripts, reports/checklists,
focused tests. Use installed TypeScript/Jest/SQLite tools; no package installation.
Tests: genuine zero/nonzero counts, read failure, account isolation, known forbidden
offline import fixture, benchmark schema/result consistency and current architecture.

## Gates, commits and delivery

For each stage, write failing acceptance tests before implementing its logic. Run
`npx tsc --noEmit`, `npm test`, then `npx eslint src/` in that order, with normal test
exit. Run coverage via the existing npm equivalent of `yarn test --coverage`:
changed critical AI/storage/scheduler logic >=80% lines, UI/general logic >=60%.
Fix failures before starting the next stage. Keep one focused commit per stage.
Native changes also require Android compilation and appropriate real native tests.

After all stages, verify installed-app flows in airplane mode using synthetic data,
clean up only those fixtures, preserve existing app data, and record actual results
and untested cases. Publish verified commits to the original `LAFINA-USTP` branch
without force push. Implementation/automation completion is separate from physical
phone/release qualification. Do not claim physical QA or speed gains without evidence.
