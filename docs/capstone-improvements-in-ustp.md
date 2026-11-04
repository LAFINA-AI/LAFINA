# CAPSTONE Improvements Implemented in LAFINA-USTP

- Updated: **2026-11-05, Asia/Manila**
- Repository: **LAFINA-AI/LAFINA**
- Maintained branch: **LAFINA-USTP**
- Inventory baseline: **4a08ffe**; app/tooling implementation through **ea6358e**.

## Scope and status

USTP remains the application base. CAPSTONE was a read-only reference. The thirty
numbered areas cover adapted behavior, USTP-specific corrections, and
packaging/testing work added during the integration.

Core scheduling, local storage, and on-device AI remain offline-first. Whisper and
Kokoro remain the default speech engines; speech input remains English-only. The
fixed NLU JSON contract and existing USTP records were preserved.

**Implemented** means the code or tool exists and has the recorded host/emulator
verification. It does not mean physical-phone acceptance or production release is
complete. Backend deployment and live integration are explicitly deferred at the
owner's request; resume only when the owner asks.

## Implemented app and tooling improvements

### 1. Safer database saves and recovery

**Technical:** Hardened transaction ownership, rollback failure handling, atomic
schema upgrades, integrity checks, and rejection of unsupported future schemas.
Production storage failures cannot report a successful durable save; damaged
connections are quarantined instead of reused.

**Simple:** The app is less likely to damage records or tell you something was saved
when it was not. Storage failures now have a safer recovery path.

### 2. Persistent native reminder delivery

**Technical:** Added durable delivery jobs and a native Android coordinator.
Reminder transitions, delivery claims, and sync-outbox writes commit together;
registration failures leave recoverable work. The main JavaScript process is not
required for every delivery transition.

**Simple:** Reminders have a stronger recovery mechanism, including when the main
app process is no longer running. Real-phone delivery still needs acceptance tests.

### 3. Duplicate and stale-alarm protection

**Technical:** Alarm identities include account, reminder, occurrence, generation,
and operation. Full URI identities and notification tags avoid hash-only collisions.
Edits, snoozes, and deletions retire old actions; source links use IDs rather than
guessing ownership from titles.

**Simple:** An old notification or repeated button press should not change the
wrong reminder or interfere with a newer version of it.

### 4. Review and confirmation before assistant writes

**Technical:** Typed, dictated, and local-model commands produce private, expiring
reviews before mutation. Confirmation atomically saves the item, linked reminder,
delivery work, outbox entry, and operation receipt. Repeated confirmation does not
duplicate the operation.

**Simple:** You can check what LAFINA understood before it changes your planner.
Pressing Confirm twice should not create two copies.

### 5. Broader reviewed commands and untimed tasks

**Technical:** Added undated/date-only tasks, events, exact-target moves/deletions,
completion, and named ringing-reminder acknowledgement/snooze. Owner/revision checks
reject stale or ambiguous targets. Manual deadline controls preserve absent times;
recurring-series changes and ambiguous names require manual editing.

**Simple:** More planner actions work through Chat, including tasks without a
deadline. LAFINA does not invent a reminder time or guess which item to delete.

### 6. Editable speech drafts and protection against lost text

**Technical:** Recognition produces an editable draft. Prepare opens its review;
only Confirm saves. Keep/Replace and navigation guards protect unsent text. A
speech-to-Chat handoff fills the composer without sending. Cancellation, background,
account changes, and unmount retire stale work and clean up watchdogs.

**Simple:** You can correct what LAFINA heard, keep an existing draft, and move text
into Chat without accidentally submitting or losing it.

### 7. Shared microphone ownership

**Technical:** Whisper, Android recognition, and meeting recording share an OS
file-lock lease with synchronized local ownership. A rejected contender or stale
cleanup cannot release another worker's lock. Cancelled decode retains ownership
until native work actually returns.

**Simple:** Voice features should not fight over the microphone or unexpectedly
start another recording while earlier work is still active.

### 8. Account-separated Chat and attachment access

**Technical:** Default sessions encode ownership; message reads, writes, deletion,
and attachment sharing validate account/session access. Guest transfers retain
recorded ownership. Ambiguous historical mixed content is not reassigned by guess.

**Simple:** Switching accounts should not expose another account's conversations or
files. Existing history is preserved rather than silently moved to the wrong user.

### 9. Paged Chat history and stable ordering

**Technical:** Chat initially loads the newest 50 messages and supports loading
earlier pages with owner-bound cursors. SQLite insertion order breaks equal-time
ties so replies do not appear before their user messages.

**Simple:** Long conversations load in sections, and messages keep a sensible order.

### 10. Factual offline planner replies and command guide

**Technical:** Supported agenda/task questions query the account's actual SQLite
records, including completed, undated, recurring, and date-scoped items. Replies are
bounded and report unavailable data instead of inventing records. Tested guide
examples populate protected drafts without Send or Confirm.

**Simple:** LAFINA answers supported planner questions using what you really saved.
Examples help you prepare a command without automatically executing it.

### 11. Bounded Calendar queries and undated-task access

**Technical:** Calendar reads focus on the visible date range, relevant recurrence,
and unfinished backlog, using bounded SQL batches. Undated tasks have paged manual
access. Full reads remain available for explicit workflows such as export.

**Simple:** Displaying the Calendar no longer requires loading all task history, and
tasks without deadlines remain accessible for editing or deletion.

### 12. Revision-checked Notes editing and deletion

**Technical:** Owner-bound snapshots and transactional revision checks protect save
and soft-delete operations. Editors retain drafts on conflicts or storage failures;
account/editor lifetime checks reject delayed stale actions. Rich content remains
supported.

**Simple:** An old editor should not overwrite a newer note or delete something
that changed while the editor was open.

### 13. Paged Notes, normalized search, and safe ordering

**Technical:** Added a derived search cache with revision/owner checks and SQL
invalidation, bounded rich-body normalization, literal wildcard handling, filters,
and stable keyset pages. Incomplete or filtered collections cannot rewrite global
drag order. Source note bodies are not rewritten for search.

**Simple:** Large note collections load in sections and formatted notes are easier
to search. Searching or viewing one page should not scramble the full collection.

### 14. Overnight events and timezone-safe timing

**Technical:** Added nullable end dates, IANA timezones, UTC instants, and repeated-time
choices while preserving legacy floating events. Calendar spans, recurrence, linked
reminders, and ICS import/export use the metadata. Invalid/ambiguous times receive
repair feedback. A regression that moved "yesterday" into the future was fixed.

**Simple:** Events can cross midnight and retain clearer timing information.
LAFINA asks for repair instead of silently inventing a replacement date or time.

### 15. Reminder health and recovery controls

**Technical:** Profile separates Android notification/exact/full-screen permissions
from owner-scoped queued, blocked, ringing, and inexact delivery evidence. Settings
return refreshes health; recovery is bounded and stale-account results are ignored.

**Simple:** You can see possible reasons reminders are blocked and request recovery.
The app distinguishes requesting registration from proving that a reminder rang.

### 16. Explicit local scheduling preferences

**Technical:** Added opt-in, per-account event start-time/duration defaults with
reviewed saving, explicit Apply, correction, expiry, disable, and Forget controls.
Revision/draft checks reject stale actions. Guest transfer preserves existing
destination choices; preferences do not infer facts from history or alter saved events.

**Simple:** You can save and apply your preferred event settings yourself. LAFINA
does not silently learn them or change events you already created.

### 17. Optional Android offline speech engines

**Technical:** Added owner-approved Android on-device English recognition on
supported versions and explicit installed offline English system TTS choices using
platform APIs. No generic network recognizer, silent download, or automatic engine
switch was added. Whisper/Kokoro remain defaults.

**Simple:** Supported phones have extra offline speech options while retaining the
original speech setup.

### 18. Voice selection, speed, pitch, Preview, and Stop

**Technical:** Versioned per-account preferences support installed providers and
voices, speed/pitch within 0.5-2.0, neutral reset, and owned Preview/Stop. Native
validation checks eligible installed offline English voices and requested settings.
Provider metadata is not proof of actual Android binding or audibility.

**Simple:** You can choose an available offline English voice and try its speaking
settings before using them. Actual sound quality still needs a phone test.

### 19. Speech readiness checks and safe recovery

**Technical:** Distinguished recognizer-service existence from installed English
readiness. Support probes, initialization, busy rechecks, and cancellation are
bounded. Late callbacks cannot restart cancelled work. Missing capabilities retain
typing and provide recovery feedback, including an explicit defaults reset.

**Simple:** LAFINA gives clearer feedback when speech is unavailable and lets you
continue by typing instead of becoming stuck or silently switching engines.

### 20. Truthful Profile statistics

**Technical:** Removed fabricated voice totals and inference from note flags/text.
Account-owned task/note totals use aggregate SQL; read failures remain unavailable.
Historical voice use displays "Not tracked" rather than a guessed number.

**Simple:** Profile statistics reflect recorded information rather than made-up
activity.

### 21. Standalone phone and emulator QA builds

**Technical:** Added ARM64 and x86_64 APK splits and a non-debuggable,
development-signed QA variant with bundled JavaScript and six model/support assets.
Package/signature compatibility was checked, and the emulator updated in place
without clearing saved data.

**Simple:** Dedicated phone and emulator test builds can run without the development
server. These are QA builds, not a production release.

### 22. Native-library audit and approved ONNX correction

**Technical:** Added bounded ELF32/64 inspection, independent of APK ZIP alignment.
The approved ONNX Runtime Android upgrade from 1.19.2 to 1.22.0 corrected the observed
PT_LOAD alignment failures. Both APKs pass 16/16 packaged-library load checks and
ZIP alignment; actual Silero frames and Kokoro synthesis passed on the emulator.

**Simple:** We identified and fixed an AI-runtime compatibility issue. Passing file
checks does not replace testing the phone build on actual hardware.

### 23. Offline architecture and dependency checks

**Technical:** Added AST checks for direct, transitive, and dynamic cloud/network
imports in offline modules, plus runtime dependency cycles. An existing TTS/storage
barrel cycle was corrected. The latest scan covers 268 source modules with no
detected violations or cycles.

**Simple:** Automated checks help stop future code changes from accidentally making
the offline core depend on the internet or circular module loading.

### 24. Reproducible regression fixtures and benchmarks

**Technical:** Added frozen command, rich-Notes, and speech-contract fixtures,
fingerprint validation, bounded query benchmarks, and fresh reports that refuse
overwrite. Evidence includes 80 command expectations, large synthetic query/page
fixtures, and speech metadata contracts; these are not model-accuracy measurements.

**Simple:** We can repeat the same checks after future changes and keep earlier
results for comparison instead of changing the test to hide a regression.

### 25. Isolated in-app QA and redacted diagnostics

**Technical:** QA builds expose an isolated 14-check SQL screen using owned
temporary databases, real query helpers, and explicit cleanup. Production builds
cannot allocate these fixtures. Native timing diagnostics expose bounded metadata
without audio, transcripts, or request identities.

**Simple:** Test builds can check important behavior without experimenting on your
student records or collecting private recordings.

### 26. Repeatable offline emulator scenarios

**Technical:** Added explicit emulator/APK/offline gates and tests for four screens,
SQL diagnostics, cancelled review, untimed-task confirmation, exact deletion, and
scoped cleanup. Seventeen host safety cases cover ownership, drafts, CLI gates,
result parsing, and partial-input failure. Uncertain cleanup cannot be reported as
confirmed, and earlier failed runs remain recorded.

**Simple:** Important app workflows can be repeated automatically without clearing
your data, deleting unrelated tasks, or hiding a failed test.

### 27. Real speech-recognition collection and scoring

**Technical:** Added bounded word-level edit scoring, complete empty/error accounting,
fresh/shared-context timing, and model/APK/corpus fingerprints. A QA-only collector
feeds six Kokoro-generated English samples into actual Whisper decoding twice,
without microphone, playback, or scheduling. The final cohort returned text for
all 12 attempts: 8 edits / 72 reference words, or 11.11% WER. Source WAVs were removed;
raw synthetic hypotheses remain outside Git.

**Simple:** We now measure real transcription mistakes rather than only checking
whether a speech function returns. This generated-audio emulator result does not
establish real microphone, accent, noise, or phone performance.

### 28. Read-only development setup checker

**Technical:** Added `npm run doctor` to check the project's actual Node, Java,
Android SDK, NDK, CMake, and Gradle requirements. It does not install tools, read
environment files, or expose signing material. The recorded host had 11 ready checks.

**Simple:** Another development computer can be checked for missing tools without
automatically changing its setup.

## Backend code prepared locally; deployment and integration deferred

These two areas have implementation and isolated tests. They are not delivered
live-backend capabilities. The owner deferred all backend-related work on
2026-11-05 because the friend with access is unavailable.

### 29. Backward-compatible event metadata synchronization

**Technical:** Added omission-aware payload normalization and preservation of prior
timezone metadata. Older-client edits that omit metadata differ from explicit
new-client null clears. Local contract tests pass without importing application
settings or connecting to a database.

**Simple:** The prepared server changes help prevent an older app from accidentally
removing an event's timing information. Deployment and real sync tests are pending.

### 30. Backend build identity and verification tooling

**Technical:** Added public build/contract identity support, a bounded HTTPS health
probe, and deployment/recovery instructions. The supplied Vercel address returned
HTTP 401; the connected account could not access its deployment. No deployed
revision was verified and the mobile host was not replaced.

**Simple:** We have tools to check that the correct backend version is running, but
could not finish that check. This work stays paused until the owner resumes it.

## Pending work, separate from implemented code

| Pending area | Technical requirement | Simple explanation | Current status |
| --- | --- | --- | --- |
| Real microphone and speaker acceptance | Whisper/Android capture, accent/noise accuracy, audible Kokoro/system TTS, focus loss, interruptions, and competing capture | Use and listen to the voice features on an actual phone | NOT RUN; real phone required |
| Physical reminder reliability | Locked-screen, reboot/unlock, Doze, permission changes, timezone changes, and manufacturer battery restrictions | Check reminders while the phone is locked, restarted, or saving battery | NOT RUN; real phone required |
| ARM64 installation and native compatibility | In-place phone update, actual native runtime/RELRO behavior, supported Android versions and page sizes | Confirm the phone build installs, preserves data, and runs on hardware | NOT RUN; host alignment checks already pass |
| Phone performance and resource use | Cold/warm response time, memory, battery, and actual audio quality | Measure speed, stability, sound, and battery use on a phone | NOT RUN; emulator timings are not phone measurements |
| Backend deployment and live synchronization | Correct project access, deployed identity, confirmed API base, controlled test-account sync, and mobile host replacement | Finish connecting and testing the server | DEFERRED at owner request; resume only on request |
| Production release and pilot acceptance | Production signing/distribution and final real-user acceptance | Qualify the app for actual release | PENDING; QA APKs are development-signed |

Use [the phone checklist](phone-qa.md) and
[the blank acceptance template](templates/phone-acceptance-v1.json) for PH01-PH14.
Physical cases remain NOT RUN until observed; passing host/emulator checks must not
be substituted for those results.

## Latest recorded verification

- TypeScript: **PASS**, zero errors.
- Jest with coverage: **143 suites / 1,100 tests PASS**, normal process exit.
- ESLint: **zero errors**, 267 existing warnings.
- Architecture: **268 modules**, zero detected offline-boundary violations/cycles.
- Full offline emulator scenario: **12 checks PASS**, cleanup confirmed; the isolated
  **14 SQL checks passed twice** with fixture removal and close/reopen.
- Native instrumentation: **17 legacy groups plus added policy/probe checks PASS**.
- Both QA ABIs: builds, expected signatures/assets, ZIP alignment, and **16/16 ELF
  load checks PASS**; physical ARM64 qualification remains pending.
- Approved runtime smoke: ONNX **1.22.0**, real Silero frames, and Kokoro WAV synthesis
  **PASS**; no physical audibility claim.
- Final synthetic Whisper cohort: **12 results**, zero empty/errors, **11.11% WER**.
  Fresh-context median: **7,093.13 ms**; shared-context median: **6,795.07 ms** on the
  emulator. These are not phone latency targets or scheduling-intent accuracy.

These results belong to their recorded artifacts and environments. This document
is an implementation inventory, not a claim of complete production certification.

## Implementation reports and evidence

- [Initial high-priority port](reports/capstone-port-progress.md): storage, native
  reminder delivery, command review, and draft protection.
- [Remaining feature port](reports/remaining-capstone-port-progress.md): account
  isolation, planner queries/conversation, preferences, speech options, packaging,
  statistics, and architecture checks.
- [Eight follow-up improvements](reports/capstone-eight-progress.md): microphone
  lease, Notes revisions/search, event timing, speech customization/readiness,
  evaluation, and in-app QA. Its older ONNX warning is superseded by the next report.
- [Final validation/tooling and current deferrals](reports/remaining-validation-progress.md):
  approved ONNX correction, actual model inference, speech scoring, emulator
  automation, setup checker, and the latest backend deferral.
- [Offline emulator report](reports/emulator-suite-final-2026-11-04.json).
- [Final speech collection](reports/stt-emulator-final-2026-11-04.json) and
  [word-error report](reports/stt-sef280d0051fe.json).
- [Approved ONNX QA artifact receipt](reports/onnx-122-qa-artifacts-2026-11-04.json).
- [Speech evaluation method](stt-evaluation.md), [emulator runner](emulator-qa.md),
  and [deferred backend verification](backend-deployment-verification.md).
