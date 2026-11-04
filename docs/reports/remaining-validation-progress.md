# Remaining validation and tooling evidence

Date: 2026-11-04, Asia/Manila. Base: USTP b248cf8. The owner resumed local
implementation; no successful cloud execution is claimed. See the associated
remaining-validation-and-tooling plan. No new packages/models are authorized.

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
