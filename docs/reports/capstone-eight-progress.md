# Eight CAPSTONE follow-ups — implementation evidence

Date: 2026-11-04, Asia/Manila. Target: original LAFINA-AI/LAFINA, LAFINA-USTP.
Baseline: 92ff7c4. Plan: ../plans/2026-11-04-capstone-eight-followups.md.
Owner authorized planning followed immediately by implementation. Sprint 9, offline.
No new package/model; USTP records, features, schema, speech defaults and fixed NLU
JSON remain the base. Donor provenance: capstone-eight-reference.json.

## 1 — shared native microphone ownership

Added one empty-file OS lease to Whisper capture, Android recognition and meeting
recording. Local ownership is synchronized by canonical file identity. Native worker
finally blocks release only their own lease; cancelled Whisper decode retains its
lease until actual return. The asynchronous meeting worker rechecks after preflight.

A real app_process child probe reproduced an edge case in the initial donor-style
implementation: closing a rejected local contender descriptor released the parent's
OS lock. Added the VM owner registry before opening a second descriptor. The exact
unchanged regression then passed on the existing API37 x86_64 emulator: child blocked
while parent held the lease, acquired after release; stale close did not release a
new owner. Empty-file and failure-path assertions passed with the existing 17 native
checks. No real microphone input, student DB or recording was used by the fixture.
See ADR-002 for the protocol and Android FileLock documentation.

TypeScript PASS; 122 suites / 946 tests PASS with normal exit; ESLint zero errors
(261 warnings). Standalone QA/native-test builds PASS. Updated existing emulator
app in place, without uninstall/data clear. Physical recording quality/interruption
validation remains pending. Stages 2–8 remain in progress.

## 2 — revision-checked Notes editing/deletion

Reused schema-21 SQL-triggered note revisions. Added owner-bound snapshots and
transactional checked create/save/soft-delete operations, including sync outbox and
revision rollback. No schema bump. Editors read a fresh snapshot and retain their
drafts on conflict/storage failure. Retained Delete/Save and delayed editor actions
are fenced by account/editor lifetime; changing accounts remounts Notes. Rich HTML,
checklists, tags, images and legacy integration/sync APIs remain supported.

Reproduced stale editor overwrite and stale delete before integration. Acceptance
checks now cover competing writers, account changes, repeated actions, disk failure
and safe retry, ordinary editing/deletion, rich body preservation and delayed work.
TypeScript PASS; 124 suites / 954 tests PASS; ESLint zero errors (261 warnings).
Checked Notes store 100% line coverage; Notes hook 60.2%, meeting the general gate.
Stages 3–8 remain in progress; this stage has host evidence, not a physical UI claim.

## 3 – paged Notes and normalized SQL search (owner item 4)

Added schema-22 derived search cache with SQL invalidation and owner/revision joins.
Each call normalizes at most 50 stale rich bodies; the UI yields between batches
and labels incomplete results. Literal LIKE wildcards, categories, voice/pinned
filters and stable owner/query-bound keyset pages retain USTP Notes behavior.
Load more and Refresh are explicit. Full collection/revision checks protect drag
ordering; incomplete/filtered pages cannot rewrite global order. No source body is
rewritten. ADR-003 records the schema refinement and compatibility protocol.

TypeScript PASS; 126 suites / 960 tests PASS with normal exit; ESLint zero errors
(262 warnings). Notes query store 100% line coverage, schema 100%, UI hook 61.58%.
Standalone QA/native test builds PASS; data-preserving emulator installation PASS.
Existing 17 native groups plus cross-process microphone probes PASS, including
explicit schema 21/22 acceptance and schema-999 refusal. No student data cleared.
Stages 4–8 remain in progress; physical phone/audio validation remains pending.

## 4 — overnight events and timezone safety (owner item 5)

Added nullable schema-23 event end-date, IANA timezone, UTC instants and repeated-time
choices. Legacy rows remain floating; migration tests preserve original wall values
and timestamps. New event forms, reviewed overnight creation/moves, linked reminder
refresh, bounded Calendar span queries, recurrence day spans and timeline labels
use the metadata. Invalid/repeated DST occurrences get visible repair feedback;
no implicit wall-time roll forward. The fixed model JSON/prompt remain unchanged.

ICS preserves dated ranges, timezone and fold choices. Invalid datetime imports no
longer invent today. Sync validates metadata and preserves it on unchanged legacy
client pulls. Added a pure backend EventPayload contract with standalone tests that
do not import application settings or environment files. Deploy the backend contract
before syncing metadata-enabled events to an older server; local changes remain
durable if an older server rejects optional fields. No backend deployment occurred.
ADR-004 records the detailed compatibility and recurrence semantics.

The frozen 80-command reviewed-pipeline corpus initially caught an existing
'yesterday' -> future scheduling bug (79/80 command expectations). Fixed it without
altering the corpus; all 80 now pass. This is a deterministic command regression,
not an on-device SmolLM2 accuracy/NIEA or recorded-speech measurement. Added the
required test:golden runner. Also normalized four new stage-3 text files to UTF-8.

TypeScript PASS; 128 suites / 1,053 tests PASS with normal exit; ESLint zero errors
(263 warnings). New event-time and migration helpers 100% line coverage; modified
linked reminder/store/query modules exceed 80%; Calendar hooks exceed 60%.
Architecture: 265 modules, zero offline boundary violations/cycles. Pure backend
contract unittest PASS and Ruff clean for the new contract/test; the existing sync
route has unrelated pre-existing Ruff findings and was not claimed wholly clean.
Standalone QA/native test builds PASS; emulator update preserved app data. Existing
17 native groups plus microphone and timezone-source regressions PASS, explicitly
accepting schemas 21/22/23 and refusing 999. Physical-phone behavior remains unrun.
Stages 5–8 remain in progress.

## 5 — optional speech customization (owner item 7)

Versioned per-account speech JSON now supports an installed provider, exact offline
English voice, speed and pitch bounded to 0.5–2.0, with neutral reset. Old saved
choices retain their engines/voice and gain neutral defaults in memory. Provider
browsing does not silently save another voice. Preview/Stop and online/offline
reminder adapters carry the saved customization; unavailable options fail safely.
Whisper/Kokoro defaults, foreground English-only input and shared microphone lease
remain intact. No package, model, network dependency or schema bump was added.

Native validation checks enabled installed services, installed offline English voice,
selected live voice and successful rate/pitch setters. ADR-005 distinguishes requested
provider metadata from actual binder identity: public Android TTS may internally
fall back, so metadata is not proof of provider binding or physical audibility.
Added/froze the additional donor SystemSpeech.kt reference used for this adaptation.

TypeScript PASS; 129 suites / 1,058 tests PASS with normal exit; ESLint zero errors
(265 warnings). Modified speech preference/native adapter/provider modules 100%
line coverage; speech settings UI exceeds 60%. Standalone QA/native builds PASS;
data-preserving emulator update and native instrumentation PASS, including added
invalid-provider/NaN/boundary policy assertions. No actual voice or microphone
quality result is claimed. Stages 6–8 remain in progress.

## 6 — speech readiness and safe recovery (owner item 3)

Distinguished recognition service existence from installed en-US readiness with
Android API-33 support checks. Unsupported queries/API31–32 remain explicitly unknown
and only the on-device recognizer may attempt capture. Missing English, permission
loss, preparation timeout and other failures remain recoverable through text.
Support probes are bounded/destroyed; Stop before readiness cannot start a late
recording. Duplicate readiness callbacks cannot restart capture. Both platform stop
operations are attempted independently; failed stop/destroy retains exclusion.

Coalesced and bounded inventory checks, fresh provider/voice checks before Preview,
owner/foreground/visibility/render fences, bounded busy rechecks and owned preview
cancellation preserve saved choices across transient failures. Malformed saved
preferences now offer an explicit Whisper/Kokoro defaults reset. No silent engine
change, downloads or new dependencies. ADR-006 records the protocol and Android APIs.

TypeScript PASS; 131 suites / 1,066 tests PASS with normal exit; ESLint zero errors
(264 warnings). Modified critical adapters/settings retain 100% line coverage;
settings UI 94.73% line coverage. Native QA and test builds PASS; data-preserving
emulator install and all native groups/policy checks PASS. Timer tests distinguish
React microtasks/opacity animation from application watchdogs and assert zero timers
after cancellation settles. Final delivery will rebundle the completed UI feedback
and defaults reset with both ABIs. Physical audio/permission/interruption matrix is
still unrun. Stages 7–8 remain in progress.

## Event sync compatibility audit follow-up

Found a server normalization edge case after stage 6: default model dumping could
turn omitted old-client metadata into explicit null, then replace the server JSON
and lose timezone data for a fresh device. Added pure omission-aware normalization
and prior-metadata preservation under the existing owner/version lock, before both
stored-content and change-feed writes. Explicit new-client clears send null keys;
legacy Calendar title edits omit them. New event forms require a timezone, while
unchanged legacy editors keep their original floating meaning. No cloud deployment.

Reproduced missing explicit-clear payload and absent server normalizer in regression
tests before implementation. Pure backend contract: 2 tests PASS, new module/test
Ruff clean, without importing settings/environment files. TypeScript PASS; 131
suites / 1,068 tests PASS; ESLint zero errors (264 warnings). This is a separate
corrective commit; stages 7–8 remain in progress.
