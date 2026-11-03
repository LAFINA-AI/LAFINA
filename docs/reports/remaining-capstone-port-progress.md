# Remaining CAPSTONE port — implementation evidence

Target: original `LAFINA-AI/LAFINA`, `LAFINA-USTP`, baseline `373be8c`.
Plan: `../plans/2026-11-03-remaining-capstone-port.md`.
Owner authorized plan then implementation, including optional Android speech engines
while keeping Whisper/Kokoro defaults. No new package has been installed.

## Stage 0 — account-safe Chat

- Reproduced the shared-session history/attachment leak with three failing tests.
- Default IDs now encode the owner. Messages validate session ownership, reads and
  deletion filter by owner, and attachment sharing rechecks account/session access.
- Legacy rows migrate transactionally only to their recorded owner's session.
  Existing historical messages do not contain trustworthy individual author-account
  metadata; pre-existing mixed content cannot be retrospectively separated by guess.
  Nothing is assigned to a newly active account or silently deleted.
- Failed session creation now throws into the existing recoverable UI path instead
  of returning a fabricated successful session ID.
- TypeScript PASS; 108 suites / 890 tests PASS with normal process exit; ESLint
  zero errors (244 warnings). Chat store line coverage 97.77%.

## Stage 1 — bounded reads

- Added stable owner/filter-bound source cursors (1–50 records) and strict date
  validation. Calendar queries restrict candidates to the visible range/recurrence
  and explicit unfinished backlog; SQL reads use batches of 50.
- Calendar no longer reloads all task history merely to draw its overdue strip.
  Full reads remain for the explicit calendar export workflow. Calendar arrays
  retain the relevant visible/backlog items; no fixed JavaScript-array size or
  measured phone-speed improvement is claimed.
- Chat initially loads the newest 50 records, with an explicit Load earlier messages
  control and stable timestamp/ID cursors. Durable messages/attachments are preserved.
- Real hook regression checks cover recurrence, navigation, visibility and calendar
  import/export; component checks exercise load-earlier behavior.
- TypeScript PASS; 110 suites / 898 tests PASS; ESLint zero errors (244 warnings).
  Calendar hook line coverage 89.05%; source-query and Chat logic exceed 80%.

## Stage 2 — factual local planner conversation

- Task/agenda questions read the owner's actual SQLite records, including completed
  and undated tasks, recurring blocks, today/tomorrow/explicit dates and this week.
  Replies are bounded, indicate more results, and show unavailable rather than model-
  invented records on read failure. Supported replies bypass cloud/model requests.
- Normalized outer polite/greeting request frames without rewriting literal notes
  or quoted titles. Existing USTP date/weekday scheduling grammar is retained.
- Added a selectable command guide. Choosing an example populates a protected draft;
  it does not Send, record or Confirm. Voice preparation uses the same read-only path.
- TypeScript PASS; 111 suites / 907 tests PASS; ESLint zero errors (244 warnings).
  Guide and conversation coverage meet their required line thresholds.

Stages 3–8 remain in progress. Physical-device acceptance is separate from host tests.

### Chat ordering follow-up

An additional failing regression demonstrated that random message-ID ordering could
put a reply before its user message when their timestamps match. Chat now uses the
local SQLite insertion order as the timestamp tie-breaker, with versioned owner-bound
cursors. No messages or timestamps are rewritten. TypeScript PASS; 111 suites /
908 tests PASS; ESLint zero errors. Earlier source pagination keeps its ID ordering.

## Stage 3 — reviewed planner mutations

- Added exact-title, owner/revision-fenced move/delete for tasks, events and blocks;
  recurring-series changes and ambiguous names require manual editing.
- Added undated/date-only tasks, actual events, and explicit named ringing-reminder
  acknowledgement/snooze. Nothing mutates before Confirm. Transactions preserve
  receipts, linked alarm generation, retries and rollback behavior.
- Quoted titles remain literal; compound/negative requests and malformed destinations
  are rejected. The fixed model JSON contract is unchanged. Read-only voice questions
  use the same local planner answers.
- TypeScript PASS; 112 suites / 919 tests PASS; ESLint zero errors (244 warnings).
  Manual undated-task access and guest-history migration follow-ups are tracked next.
Guest sign-in follow-up: a failing regression reproduced hidden transferred history. Default-session consolidation now accepts only sessions explicitly recorded as owned by the signed-in account. TypeScript PASS; 112 suites / 920 tests PASS; ESLint zero errors.
Manual untimed follow-up: a failing real-hook test reproduced accidental noon deadlines on title edits. Explicit deadline/time switches now preserve absent values and an existing different due date. Calendar offers owner-scoped pages of 20 undated tasks for manual editing/deletion. TypeScript PASS; 113 suites / 924 tests PASS; ESLint zero errors; editor line coverage 96.47%.

## Stage 4 — reminder health

Profile now shows native notification/exact/full-screen permissions separately from
owner-scoped queued, blocked, ringing and inexact delivery evidence. At most twenty
redacted jobs are shown; titles and arbitrary native errors are excluded. Settings
return refreshes health; stale account/view results are ignored. Recovery is bounded,
active-account checked and described as a registration request, not proof of delivery.
TypeScript PASS; 115 suites / 928 tests PASS; ESLint zero errors (250 warnings).
Storage/scheduler health line coverage exceeds 80%; UI exceeds 60%.

## Stage 5 — explicit personal preferences

Implemented opt-in, account-local event start/duration preferences, private expiring
reviews, correction, disable, individual/all Forget and expiry. Revision, active-account,
clock and draft-epoch checks reject stale Save/Apply, including after editing a draft.
Only an explicit Apply changes a new draft; existing events remain independent.
Plan refinement: use the existing `local_settings` table with a versioned structured
payload and UTC creation/update timestamps. No schema bump or native compatibility
policy widening is necessary. Preferences do not sync or infer facts from history.
TypeScript PASS; 117 suites / 933 tests PASS; ESLint zero errors (251 warnings).
Memory store line coverage 100%; manager UI exceeds 60%.

## Stage 6 — architecture-specific packaging

Added per-ABI APK splits and a development-signed, non-debuggable QA variant that
bundles JavaScript without Metro. Preserved app ID/signing configuration, INTERNET,
all six model/support assets and database version 21. Version code/name now 9/1.3.4.
Both x86_64 and ARM64 QA builds PASS, including Android release-style lint. Artifact
metadata/hashes/bytes are in qa-x86_64-artifact.json and qa-arm64-artifact.json; no
matched size or phone-speed improvement is claimed. Development certificate SHA-256:
fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c.
The x86_64 build updated the existing version-8 emulator installation without clearing
its data. Airplane-mode launch and undated-list/health/preference-screen smoke checks
PASS. Twelve existing native delivery checks PASS on the updated target. ARM64 physical
install and known vendor ONNX 16 KiB alignment qualification remain unverified.
TypeScript PASS; 117 suites / 933 tests PASS; ESLint zero errors (251 warnings).
Build output directories replace the prior ABI selection; the final build will request
both phone and emulator ABIs together so both final artifacts are retained.

## Stage 7 — optional Android speech

Owner-approved, per-account choices retain Whisper/Kokoro defaults. Added only Android
platform APIs: `createOnDeviceSpeechRecognizer` on API 31+, English en-US input, and
explicit installed offline English system TTS voices. No generic recognizer,
setLanguage/model download, npm/pip package, or silent fallback was added. Capture
ownership retains its original module across setting changes. Native and JS watchdogs,
owned Stop/Cancel, foreground/audio-focus cleanup and stale-account checks bound work.
Missing/malformed capabilities/results retain text and clear settings feedback.

References: Android SpeechRecognizer API
https://developer.android.com/reference/android/speech/SpeechRecognizer and TextToSpeech
https://developer.android.com/reference/android/speech/tts/TextToSpeech / Engine API.
Voice eligibility is metadata, not a claim about any arbitrary engine's audibility.

TypeScript PASS; 119 suites / 939 tests PASS with normal exit; ESLint zero errors
(261 warnings). All added critical modules exceed 80% lines; settings UI exceeds 60%.
Both ABI QA builds and Android compilation PASS. Emulator update/native checks PASS
(17 checks including English installed/offline voice policy). Airplane-mode native
capabilities reported an on-device service and installed English voices; an explicit
system voice preview completed. Original Whisper/Kokoro preferences were restored.
No physical recognition, audibility, quality or latency qualification is claimed.
