# Eight CAPSTONE follow-ups into USTP

Date: 2026-11-04, Asia/Manila. Baseline: `92ff7c4`, `LAFINA-USTP`.
Authorization: owner requested this plan followed immediately by implementation.
Classification: Sprint 9 offline reliability, usability and evaluation.
Workflow: `.agents/skills/implement_feature.md`; React component lifecycle,
accessibility and rendering review from the React best-practices skill.

USTP remains the maintained app. CAPSTONE is a read-only reference, not a replacement
schema or UI. Preserve existing data, rich Notes, accounts, sync, model assets,
reminder identities, default Whisper/Kokoro and the fixed NLU JSON contract.
Existing approval covers optional Android speech refinements. No new packages,
models, languages, automatic learning or multi-turn clarification are included.
Never inspect environment files or distribute development signing as production.

## Implementation order

1. **Shared native microphone ownership.** Add an empty-file OS lease shared by
   Whisper capture, optional Android recognition and the meeting recorder service.
   Release on normal completion/error/process death; retain the lease while an
   uncancelled decoder/recorder still owns work. Types: native `MicrophoneLease`.
   Files: narrow Kotlin helper and the three recording entry points; framework-only
   instrumentation/probe. Test competing owners, wrong/duplicate release, failures,
   cancellation and actual cross-process exclusion where the device supports it.

2. **Version-checked Notes edits/deletes.** Reuse schema-21 SQL-triggered local
   revisions so local/sync writers are observed. Add owner-bound edit snapshots and
   transactional checked writes; preserve drafts when records change. Keep legacy
   storage APIs for existing integration callers. Files: notes store/edit hook/tests.
   Types: `NoteEditSnapshot`, `NoteWriteTarget`, recoverable conflict result/error.
   Test other accounts, changed/deleted notes, alert callbacks, rollback, rich-body
   preservation and sync changes. No schema bump is needed for this stage.

3. **Paged Notes and SQL search (item 4).** Add owner/filter/query-bound keyset pages,
   literal wildcard handling and bounded searches. Adapt the existing Notes list,
   filters and editor without dropping rich text, tags, pinning, photos or ordering.
   Drag ordering must only operate with a complete unfiltered ordering context;
   never persist a partial page as the entire collection. Types: `NotesQuery/Page`.
   Test >one page, ties, account/filter changes, edits/deletes and paged drag safety.
   Implementation refinement: additive schema 22 holds a derived normalized rich-text
   search cache, invalidated by SQL triggers on every note update/delete. Normalize
   at most 50 stale notes per UI yield; source content/revisions stay authoritative.
   Native delivery explicitly accepts 20–22 before bundled schema-22 JS is installed.

4. **Overnight events and timezone-safe scheduling (item 5).** Add explicit event end
   dates and named timezone/instant metadata through an additive migration; retain
   old columns/wire compatibility. Validate local-time gaps/folds and date rollovers,
   update Calendar display/window queries, review, linked reminders and import/export.
   Keep model JSON unchanged: richer internal application types carry end metadata.
   Before running the new JS migration on a device, build/install native delivery
   code with an explicitly reviewed compatible schema range. Test legacy upgrades,
   cross-midnight display/moves/reminders, timezone changes, recurrence, sync fallback
   and future-schema refusal. Do not guess ambiguous local times.
   The concrete event migration is schema 23 after Notes cache schema 22. A pure
   backward-compatible backend payload contract is included; backend deployment
   remains separate from this offline app implementation. ADR-004 records semantics.

5. **Speech customization (item 7).** Extend per-account speech settings with explicit
   installed provider, voice, rate/pitch (bounded 0.5–2.0), preserving existing saved
   choices and defaults. Types: versioned speech preferences/inventory. Update native
   installed-English voice selection and provider-bound playback, Preview/Stop and
   reminder adapters. Test unavailable/substituted engines, invalid values, old saved
   preferences, account changes, cancellation and default engine regressions.

6. **Stronger speech readiness/recovery (item 3).** Query installed English on-device
   recognition support where Android provides it; distinguish service existence from
   readiness and unsupported capability queries. Recheck the exact chosen TTS engine
   and voice after settings return and before preview; serialize/coalesce checks and
   fence retained handlers. No downloads, generic recognizer or silent engine changes.
   Test busy return, stale callbacks, revoked permissions, missing language/voice,
   unavailable native support, timeouts and offline failure feedback.

7. **Broader evaluation tools (item 6).** Add versioned synthetic intent/Notes/speech
   fixtures and reproducible runners, redacted native timing/capability diagnostics,
   and an expanded physical-device result matrix. Existing TypeScript/Jest/SQLite and
   Android platform tools only. Record host versus device evidence separately; actual
   audio/WER, audibility, power and latency are unmeasured until collected on a phone.
   Tests validate fixture outcomes, schema/report consistency and isolated databases.

8. **QA-only in-app diagnostics.** Expose isolated SQLite checks only in a dedicated
   development-signed standalone QA variant. Use a separately named synthetic DB,
   never the student DB. Exercise transactions, paired writes, revisions/paging and
   metadata compatibility. Typed result, bounded execution, owner/lifecycle cleanup;
   production shows no diagnostic controls. Test success/failure, isolation, stale
   results and the installed QA screen.

## Gates and delivery

One stage at a time, failing acceptance tests before logic, focused commits. For
each stage run in order: `npx tsc --noEmit`, `npm test -- --maxWorkers=2 --coverage`,
`npx eslint src/`. All must pass with normal test exit; changed critical modules need
80% line coverage and general/UI modules 60%. Native work also requires actual
Android compilation and appropriate instrumentation. No package install is planned.

Finish with architecture checks, both standalone ARM64/x86_64 builds, signature/ABI/
model inspections, data-preserving emulator update and synthetic offline acceptance.
Freeze donor reference hashes and record tests, artifact hashes, deviations and
unrun physical cases. Push verified commits normally to the original repository's
`LAFINA-USTP` branch. Implementation completion does not certify a physical phone or
resolve the existing vendor ONNX 16 KiB warning without separate evidence.


## Implementation status — 2026-11-04

All eight implementation stages and final host/native/offline-emulator checks are
complete. USTP remains the base; no new package, model or cloud dependency was added.
See [implementation evidence](../reports/capstone-eight-progress.md),
[QA artifacts](../reports/capstone-eight-qa-artifacts-2026-11-04.json) and
[offline acceptance](../reports/capstone-eight-emulator-2026-11-04.json).
Physical-phone/audio validation, the existing ONNX ELF warning and deployment of
the backward-compatible backend change remain explicitly separate follow-ups.
