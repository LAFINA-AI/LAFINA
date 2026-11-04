# Remaining validation and tooling evidence

Date: 2026-11-04, Asia/Manila. Base: USTP b248cf8. The owner resumed local
implementation; no successful cloud execution is claimed. See the associated
remaining-validation-and-tooling plan. The owner explicitly approved the existing
ONNX Runtime upgrade below; no additional packages/models were introduced.

## 1 - physical acceptance preparation

Added PH01-PH14 synthetic scenarios, privacy/scoped-cleanup instructions and a
versioned blank result template. No physical cases were run; every case is NOT RUN
and unknown measurements remain null. Real microphone, audibility, ARM64 install,
OEM alarm/battery behavior and actual phone performance require hardware.

Stage 1 gates: TypeScript PASS; 137 suites / 1,084 tests with coverage PASS; ESLint zero errors (267 warnings). No app code changed.


## 2 - native-library compatibility audit

Added a bounded standard-library ELF32/64 auditor, explicit fresh-report CLI and
Jest integration for 11 synthetic Python cases. Failing tests preceded the new
auditor and exposed an additional NOTE-versus-LOAD memory-size edge case before
correction. Imports/style pass Ruff. Both real QA APKs contain 16 libraries; 14 per
ABI pass PT_LOAD alignment, while the two ONNX libraries use 4096-byte alignment.
The first-party Whisper library already uses 16384-byte alignment. No speculative
linker change was made; it would not repair prebuilt vendor binaries.

Candidate-only Maven AAR inspection: ONNX Android 1.22.0 has aligned PT_LOAD mappings
for all four ARM64/x86_64 libraries. Its independent hash/report is recorded; it was
not installed or used. The owner was asked for dependency-upgrade approval under
AGENTS.md. Until approval and runtime/model validation, the compatibility fix remains
pending. RELRO observations, ZIP alignment and physical-device results stay separate.

Stage 2 final gates: TypeScript PASS; 138 suites / 1,085 Jest tests with coverage PASS (including 11 Python auditor cases); ESLint zero errors (267 warnings). Both recorded APK findings match the corrected final auditor.

## 3 - speech accuracy evaluation tools

Added typed cohort/report contracts, bounded word-level edit scoring, cold/warm summaries, fixed public six-command corpus/hash manifest and a strict explicit CLI. Empty/error attempts are included; malformed, incomplete and duplicate cohorts are rejected. Raw transcript inputs stay in ignored .local/stt; reports contain scores and fingerprints, not hypotheses. Fresh canonical report paths prevent overwrite/symlink escape. Eight Jest cases cover metrics, invalid inputs, provenance, CLI and filesystem behavior. A clearly labelled 12-pair scorer self-test ran without a model or audio; it is not recognition accuracy evidence. Actual native PCM collection is a separate follow-up.

Stage 3 gates: TypeScript PASS; 139 suites / 1,093 tests with coverage PASS; ESLint zero errors (267 warnings). No application scheduling or speech defaults changed.


## 2 follow-up - approved vendor correction and actual model inference

Owner explicitly approved ONNX Android 1.19.2 -> 1.22.0. Retained both prior APKs
under ignored .local/artifacts/ebf646c. Cached the exact approved Maven artifact,
then built both QA ABIs and instrumentation offline. The initial online build was
cancelled while awaiting metadata; native validation ran serially after memory
pressure was observed. Final native build PASS, host TypeScript/139 suites/1,093
tests with coverage/ESLint zero errors (267 warnings) PASS. No app JS/default change.

Both new APKs have expected certificate, package/version, bundled JS/six models,
ZIP alignment and 16/16 PT_LOAD checks PASS. The x86_64 APK updated the saved app
without data clear. Native 17-group regressions PASS. Explicit installed-QA model
operation: ONNX version 1.22.0, Silero two real frames PASS, production Kokoro WAV
132,044 bytes with nonzero PCM PASS, output removed. No microphone or playback.
The instrumentation checks the installed native QA gate rather than an inlined
BuildConfig from its debug-compiled test APK. Historical evidence is preserved.
Physical ARM64/audio/RELRO-device qualification remains NOT RUN.

Deployment steering: owner reports Render was cancelled and the database moved to
Neon, possibly hosted through Vercel. Do not deploy to Render or guess an API URL.
Discover actual Vercel project/host before deployment or changing the mobile URL.


## 4 - deployment identity and verification preparation

Owner clarified Render is cancelled and Neon/Vercel may be the replacement. The
connected Vercel team has a lafina-wiki project by name, no original-repository
filter match, and no local .vercel/project.json in root/backend. The API host and
its authorized staging flow remain unconfirmed. No guessed deployment, new cloud
resource, database mutation or mobile URL change was made; the old Render URL is
explicitly documented as needing replacement once the API is verified.

Added backward-compatible public health identity (validated Vercel Git SHA or null,
provider and event-contract version), a read-only bounded TLS/identity probe with
safe offline/old-version states, and deployment/rollback/test-account instructions.
Four isolated backend cases (including the previous event contract) and four fake
transport probe cases PASS without settings, credentials, database or real network.
New Python modules/tests are Ruff clean; whole legacy backend style is not claimed.
Stage 4 gates: TypeScript PASS; 140 suites / 1,095 tests with coverage PASS; ESLint
zero errors (267 warnings). Actual deployment and live sync remain pending input.

Resource-aware execution: finish the read-only setup checker before the emulator
scenario runner so heavy host checks finish before the final device boot.


## 6 - read-only development setup checker (before final emulator work)

Added npm run doctor and public JSON output from actual USTP Node/Android/CMake/
Gradle requirements, including the installed React Native Java toolchain policy.
Only Java version is executed, with timeout/bounded capture. Named SDK/JDK path
variables are used internally; no environment files, signing material, absolute
paths or raw command output are exposed. Missing tools/config stay missing/unknown;
no installation or network occurs. Four fake-inventory Node cases run through Jest.
Actual host receipt: READY, 11 checks; Node 24.19.0, Java 25.0.2, SDK34/build-tools36,
NDK27.1 and CMake3.22.1 present. This is setup evidence, not a device certificate.
Stage 6 gates: TypeScript PASS; 141 suites / 1,096 tests with coverage PASS; ESLint
zero errors (267 warnings).

## 5 - repeatable emulator scenarios and actual synthetic speech

Added an explicit standard-library ADB runner with emulator/installed-APK/offline
gates, fresh reports, draft/review preservation, exact synthetic task ownership and
scoped cleanup. No data clear, uninstall, OS setting change, private database dump,
microphone or playback. The final full UI observation passed all 12 checks: four
offline screens, native QA gate, 14 SQL checks twice with removed fixtures and
close/reopen, cancelled retained draft with no saved task, confirmed untimed task,
reviewed deletion and exact no-match verification. Cleanup confirmed. Earlier
blocked/failed runs and the separate owned-fixture recovery remain unaltered.

The test-APK-only collector uses production Kokoro synthesis and actual bundled
English Whisper decoding. It hashes six generated source WAVs, validates/resamples
PCM, removes the sources, and collects six fresh-context plus six shared-context
observations under the pipeline lease. No parser, schedule, student DB or playback
is invoked. Three native PCM parser checks PASS; all 12 requests returned text.
Measured WER: 8 edits / 72 words = 11.11%, normalized exact 6/12, verbatim exact 0/12.
Fresh-context median/p95: 6,946.92/7,443.51 ms; shared: 6,934.43/7,150.44 ms.
Six observations per condition, synthetic PCM and x86_64 emulator only; this does
not establish microphone/accent/noise/Android-recognizer/physical-phone performance.
Raw synthetic hypotheses stay ignored; committed reports contain fingerprints and
scores. The first native result reader rejected CRLF cleanup fields; its failed
report is retained. LF/CRLF regression checks and a fresh successful retry verified
source removal, not a relabelled success. Native harness build and 17 legacy
regression groups also passed; main APK hashes remain the approved ONNX receipt.

Seventeen Python fake-transport safety cases run through Jest. A real command-session
test verifies quoted literal titles, including the word cancel, propose untimed
tasks without saving. Added actual CLI/report contract regressions rather than
relying only on subprocess coverage. Final review added a failing partial-input
regression: uncertain input is preserved and cleanup cannot be falsely confirmed.
The corrected final runner passed a fresh actual STT collection (again 12 text
results, 11.11% WER and cleanup confirmed). Final runner line coverage is 67.50%
combined unit/native-integration with exact source fingerprints; unit-only 44.61%
is exposed separately, and all earlier-source traces are excluded. No app TypeScript behavior,
speech defaults, frozen NLU schema or donor files were changed by this stage.

Evidence: emulator-suite-final-2026-11-04.json; emulator-suite-owned-cleanup-2026-11-04.json;
stt-emulator-verified-2026-11-04.json; stt-sba04186ad432.json;
emulator-runner-final-coverage-2026-11-04.json; stt-emulator-final-2026-11-04.json;
stt-sef280d0051fe.json. Earlier coverage/cohorts remain historical. Final fresh/shared
context median/p95 were 7,093.13/7,317.23 ms and 6,795.07/7,004.13 ms respectively.
Runbooks: ../emulator-qa.md and
../stt-evaluation.md. Emulator stopped after verification, saved data retained.

Stage 5 final ordered gates: TypeScript PASS; 143 suites / 1,100 tests with coverage
PASS; ESLint zero errors (267 existing warnings). Yarn is not installed; the
existing npm test command ran the same Jest/Istanbul coverage toolchain without
installing another package manager. General helper line coverage: STT metrics
95.71%, scorer CLI 87.09%, evidence helper 100%, architecture checker 96.87%.
Architecture: 268 modules, zero violations/cycles. Final new Python files are Ruff
clean; isolated backend/probe tests pass 4 + 4. All 15 donor fingerprints, four
working/committed frozen corpora, both main APK receipts and the instrumentation
APK/runner fingerprints still match. No private data, audio or APKs are committed.
The pure backend identity helper and health probe measured 84.62% and 60.00% line
coverage respectively under standard-library tracing, without settings or a network.

## Remaining external acceptance

- Physical PH01-PH14 remain NOT RUN: real microphone/accent/noise, audible speech,
  focus/interruption/concurrent capture, installed Android engines, locked/reboot/
  Doze alarm delivery, permission recovery, battery/RAM and ARM64 update/runtime/
  RELRO qualification. Use the blank phone template; do not infer PASS from host QA.
- Confirm the API's actual Vercel dashboard/public HTTPS address and an authorized
  synthetic staging/test-account flow. Render is retired; Neon alone is a database,
  not an API address. Deployment, mobile host replacement and live sync verification
  remain pending that input. No guessed host or unrelated wiki project was modified.
- Production signing/distribution and pilot acceptance remain separate from the
  development-signed QA APKs. No real student audio or records were used.

## 2026-11-05 deployment follow-up (Asia/Manila)

The prior approval-review usage interruption cleared; commit ea6358e was normally
pushed to original upstream LAFINA-USTP and its remote full SHA matched locally.
The owner supplied lafina-backend-git-main-nblancs-projects.vercel.app. Public health
verification returned UNAVAILABLE / HTTP 401, without a deployed identity. Both
connected Vercel lookup and authenticated fetch returned 404 / no project access;
no existing local Vercel CLI was available. Receipt: backend-health-2026-11-05.json.
The project/team connection or public production API URL is now the required input,
followed by an authorized synthetic staging flow. No host replacement or deployment
was made. The attached environment file was not opened. Physical acceptance stays
NOT RUN. See ../backend-deployment-verification.md for the precise access state.

Owner then explicitly deferred all backend-related work because the friend with
access is unavailable. Stop deployment/access work until the owner resumes it;
do not hold completed app improvements open for that dependency. The local/offline
implementation and its successful verification remain delivered independently.
Documentation follow-up gates: TypeScript PASS; 143 suites / 1,100 tests with
coverage PASS; ESLint zero errors (267 existing warnings). No app code changed.
