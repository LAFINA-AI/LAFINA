# Remaining CAPSTONE validation and tooling on the USTP base

Date: 2026-11-04, Asia/Manila. Sprint 9. Baseline: ebf646c.
Owner authorization: plan all remaining items, then implement everything feasible;
continue in ChatGPT Work cloud because the local PC will shut down shortly.
Keep original LAFINA-AI/LAFINA branch LAFINA-USTP as the application base.

Execution update: the owner requested continuation in the original local chat after
the cloud opening failed. Local execution supersedes the attempted cloud handoff.
No cloud implementation or verification has been established.

## Existing completed work and evidence

All eight previous implementation stages are complete. Read
../reports/capstone-eight-progress.md, capstone-eight-reference.json,
capstone-eight-emulator-2026-11-04.json and the final QA artifact receipt.
Last app-source gates passed: TypeScript; 137 Jest suites / 1,084 tests with coverage;
ESLint zero errors (267 warnings). Both QA ABIs built, native checks passed, and
installed x86_64 airplane-mode UI passed 14 isolated SQL checks twice. These results
belong to that baseline, not future changes. No physical audio claims.

## Constraints and working protocol

Read AGENTS.md and .agents/skills/implement_feature.md fully. The owner's explicit
plan-then-proceed request authorizes implementation within this scope. No new
packages, model changes, NLU JSON changes, iOS or additional speech languages.
Never read any .env file, signing credential, private transcript or student data.
Whisper/Kokoro stay defaults. No cloud imports in offline core. No subagents.
One stage at a time, failing meaningful tests first, types before logic. After each
code stage run in order: npx tsc --noEmit; npm test -- --maxWorkers=2 --coverage;
npx eslint src/. Critical line coverage >=80%, general/UI >=60%. Normal test exit.
Use existing installed tools; do not install dependencies without owner approval.
Keep focused commits; normal push to original upstream LAFINA-USTP, never force.
If cloud lacks repository/native tools, complete independent feasible work and
report exactly what cannot run. Do not claim an emulator or build exists remotely.

## Priority 1: physical-phone acceptance preparation and evidence

Expand docs/phone-qa.md with a compact result template and exact synthetic-case IDs
for locked reminders, reboot/unlock, Doze, permissions, account switches, concurrent
recording, installed-English recognition and voice Preview/Stop. Record APK hash,
API/ABI/page size, anonymous device tier, outcomes and cleanup. Mark NOT RUN until
observed on actual hardware. Do not collect unique device IDs or private audio.
Real phone required: microphone/noise/accent quality, audible TTS, interruptions,
locked/reboot alarm delivery, battery/RAM and ARM64 in-place update.

## Priority 2: audit and address 16 KiB native compatibility where feasible

Extend scripts/inspect-apk.py or a separate Python standard-library audit to inspect
ELF PT_LOAD alignment for every packaged native library in each ABI, independently
of ZIP alignment. Types/report: library path, ABI, segment alignment, pass/fail/error,
artifact SHA and evidence limitations. Tests: synthetic ELF32/ELF64, little/big
endianness, truncated/invalid headers, bounds, aligned/misaligned segments and ZIP.
Never label ZIP alignment as ELF compatibility. Inspect available final APKs and
trace failing binaries to existing build configuration/dependency versions without
reading credentials. Fix first-party CMake/linker configuration only if justified
and within the existing toolchain. Existing ONNX Runtime 1.19.2 is a known warning;
if correction requires replacing/upgrading a library, provide exact proposed change
and request approval under AGENTS.md before doing it. Rebuild/reinspect if possible.
Phone validation still required even after host inspection passes.

## Priority 3: actual STT evaluation tooling

Adapt CAPSTONE behavior into host-only scripts using existing Node/Jest tools:
word normalization and Levenshtein substitutions/deletions/insertions, WER with
explicit empty-reference behavior, exact transcript match and cold/warm p50/p95.
Strict versioned input schema with bounded samples, unique case IDs, validated finite
nonnegative timings, fixed reference hashes, engine/model identity and provenance
(direct synthetic PCM vs real microphone). No raw/private recordings committed.
Report runner must refuse overwrite and reject paths outside allowed workspace.
Tests: exact/substitution/insertion/deletion, punctuation/numbers, empty references,
malformed/missing/duplicate samples, timing percentiles and report provenance.
Add documented fixture manifest and synthetic self-tests. Do not invent measured
recognition outcomes. Native direct-PCM integration only via QA gate, isolated from
scheduler/student DB, after reviewing current native API; no automatic microphone.
Cloud without Android may implement scoring/report validation, leaving actual
capture/native runs explicitly NOT RUN. Model accuracy needs separate evidence.

CAPSTONE local reference (may be unavailable in cloud): scripts/stt-metrics.cjs,
evaluate-stt.cjs, generate-stt-synthetic-corpus.ps1 and phase08-emulator-audio.mjs.
These are references, not drop-in USTP code. Existing USTP evaluation runners cover
command/Notes/metadata regressions and must remain available.

## Priority 4: backend deployment preparation and live verification

Existing change: backend/app/api/event_payload.py and sync route preserve omitted
old-client event metadata, distinguishing omission from explicit null. First run
pure backend/tests/test_event_time_contract_isolated.py without settings/env imports.
Prepare a deployment/rollback and read-only version/health verification guide using
existing public deployment configuration only. Never deploy to a guessed service.
Owner update: Render was cancelled; Neon is the database and Vercel is the possible
API host. Discover the actual configured API project before changing a URL. Exact service,
accessible authorization and safe staging/test-account validation are required.
If unavailable, record owner input: API project/public URL and deployment access.
Avoid mutating live student data; use explicitly authorized synthetic staging rows
for old-client title edits, timezone preservation and explicit clear tests.

## Priority 5: broader repeatable emulator scenarios

Adapt the approach of CAPSTONE phase08-emulator-suite.py to USTP package/schema/UI,
not its DB names or schema. Use standard-library Python and existing ADB; commands
must be explicit and bounded. Begin with read-only baseline, QA diagnostics and main
screen checks. Add opt-in synthetic scheduling review/Confirm/cancel/delete scenarios
with exact fixture namespace and scoped cleanup; no real-record edits. Never clear
app data/uninstall, guess account IDs, dump private rows, auto-record audio, or change
radios/permissions/time/battery state silently. Report environment/artifact hashes,
PASS/FAIL/NOT RUN and cleanup outcomes; refuse overwrite. Unit-test parsing, bounds,
fixture ownership, command safety and timeout/error reports before any device run.
A missing emulator is NOT RUN, not a fabricated success. Longer notification/audio
scenarios require actual device tools and dedicated consented conditions.

## Priority 6: development setup checker

Add a read-only scripts/doctor.mjs using built-in Node APIs and package script.
Report Node/Java/SDK component availability and supported versions from this USTP
project, not CAPSTONE hardcoded values. Do not read .env, dump environment variables,
install tools, inspect signing files or expose sensitive paths. Validate behavior
with fake tool/version results. Gracefully explain missing native tools in cloud.

## Delivery, remaining input and cloud handoff

Implement as many stages as available access/tooling permits; each requires its own
gates/evidence. Update a progress report with exact commands/outcomes and remaining
items. Push focused commits to original LAFINA-USTP normally. Keep this plan updated.
Owner/device dependencies: physical Android phone; any required library upgrade
approval; confirmed API project/access and staging verification; optional synthetic/consented
English recordings for genuine speech evaluation. Local emulator/SDK and donor
working tree disappear when the PC is off; cloud work cannot claim access to them.
The cloud continuation must first verify GitHub access and exact baseline. If it
cannot edit the private repo, request repository connection and continue designing
portable artifacts rather than claiming implementation is complete.

## Local delivery status, 2026-11-04

All six feasible tooling/preparation workstreams are implemented on USTP. The
owner-approved ONNX 1.22.0 correction was built for both ABIs and verified by ELF/
ZIP inspection plus actual Silero/Kokoro inference. Offline UI passed 12 checks,
and actual direct synthetic Whisper collection returned 12 results with 11.11%
WER. Final ordered gates passed: TypeScript, 143 Jest suites / 1,100 tests with
coverage, and ESLint zero errors. Detailed evidence and limitations are in
../reports/remaining-validation-progress.md. No successful cloud execution is
claimed; local execution is authoritative and the emulator has been stopped.

External acceptance remains open: PH01-PH14 on a real phone and confirmation of
the actual API host/project plus authorized staging verification. Render is
retired; no replacement mobile URL or deployment was guessed. Physical acceptance
and production distribution are not marked complete by these development QA runs.
