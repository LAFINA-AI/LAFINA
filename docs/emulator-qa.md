# Repeatable offline emulator checks

The standard-library runner uses existing ADB/UIAutomator against an explicitly
selected emulator. It never installs/uninstalls an app, clears data, edits a device
database, changes radios/permissions/time or captures a microphone/screenshot.
Install the matching development-signed QA app and instrumentation APK in place
before running. The runner compares the installed APK hash to your selected file.
Enable airplane mode on the emulator yourself; the runner checks it and fails
closed if absent. Do not interact with the emulator while a scenario is running.

```powershell
python scripts/emulator_qa.py --adb PATH-TO-ADB --serial emulator-5554 --run-id NEW-UNIQUE-ID --apk android/app/build/outputs/apk/qa/app-x86_64-qa.apk --scenario full --allow-fixture-writes --output docs/reports/new-emulator-run.json
```

`baseline` opens Calendar/Notes/Chat/Profile, turns on developer mode (seven taps on
App Version, which leaves the flag on for that account) and checks the native-gated
QA controls.
`diagnostics` additionally runs the 14 isolated SQL checks twice with close/reopen,
requiring explicit fixture-removal evidence. `roundtrip`/`full` additionally need
`--allow-fixture-writes`: exact synthetic task preflight, create-review cancellation,
retained owned draft, no-match lookup, confirmed untimed task and reviewed deletion.
Only `LAFINA-QA-<run-id>-main` and `-cancel` are eligible. No reminder is invented.
Never reuse a run ID or evidence filename. Existing drafts/reviews are preserved;
unexpected UI, ambiguous controls and mismatched review operations stop the run.

Only the exact command placed by the runner can be removed from the editor. The
resulting text is checked before Send, and the review operation/title is checked
before Confirm. Cleanup attempts only tracked synthetic fixtures, accepting already
absent records while preserving foreign reviews. The task's temporary device XML is
removed; private UI text is parsed only in memory and never exported. Synthetic Chat
query messages remain deliberately; the runner never bulk-clears conversation history.
On failure, inspect cleanupConfirmed and the run's two exact names using normal UI.
Reports contain fixed check labels and safe error codes, not account/student content
or device serials. A blocked or failed run is retained and never relabelled PASS.

## Actual synthetic speech collection

The test APK includes only the public frozen text fixtures as assets. Its explicit
native QA operation uses the production Kokoro synthesizer to generate six cache
WAVs, hashes them, converts PCM16 mono 24k to 16k with deterministic linear
interpolation and one-second trailing silence, and removes every source WAV.
It then invokes the real bundled English Whisper JNI decoder with two threads:
six fresh-context requests and six shared-loaded-context requests. Context load is
included for cold; excluded for warm. Generation/resampling/context-free time is
excluded. The pipeline lease remains held until decoding returns. No microphone,
playback, model download, command parser or student database is used.

```powershell
python scripts/emulator_qa.py --adb PATH-TO-ADB --serial emulator-5554 --run-id NEW-STT-ID --apk android/app/build/outputs/apk/qa/app-x86_64-qa.apk --test-apk android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk --scenario stt --output docs/reports/new-stt-collection.json
```

Both installed app/test APKs must match the supplied hashes. The native gate checks
the installed QA build and the exact corpus hash. Three PCM-parser cases execute
before collection. The host verifies provenance, source cases and file cleanup, then
writes raw synthetic hypotheses only to ignored .local/stt/<run-id>.json. The existing
strict STT scorer creates a separate fresh docs/reports/stt-<run-id>.json. Public
evidence includes model/APK/test-APK hashes, source WAV fingerprints, actual outcomes,
WER and cold/warm intervals. This is synthetic direct PCM, not microphone/VAD,
Filipino-accent/noise quality, acoustic audibility or physical-phone performance.
High WER and empty/error outcomes must remain visible; do not relabel the corpus.

Build the framework-only harness with the existing Gradle/SDK tools:

```powershell
# Run from android/
.\gradlew.bat :app:assembleDebugAndroidTest '-PreactNativeArchitectures=arm64-v8a,x86_64' --offline --no-daemon --max-workers=1
```

Host safety regressions run automatically through Jest and can also run explicitly:
`python -m unittest discover -s scripts/tests -p test_emulator_qa.py`. Physical/OEM
locked-screen, reboot, audio-focus, microphone, battery and performance cases remain
in phone-qa.md; this runner does not silently perform those OS-changing scenarios.

## Observed offline UI result, 2026-11-04

`reports/emulator-suite-final-2026-11-04.json` records 12 PASS checks on the installed
QA APK, API 37 / x86_64 / 16 KiB pages, with airplane mode already enabled. These
include four offline screens, the isolated 14-check SQL fixture twice with removal
and close/reopen, cancelled review with retained draft and absent task, confirmed
untimed task, and exact deletion/no-match verification. Cleanup was confirmed.

Earlier blocked/failed attempts are retained as separate reports. They exposed
native result alerts, keyboard-hidden navigation, and excessive IME diagnostic
output. The runner now acknowledges only its exact result, hides only a positively
identified visible keyboard, and extracts only the visibility flag on-device.
`emulator-suite-owned-cleanup-2026-11-04.json` separately confirms the prior failed
run's one eligible synthetic task is absent; it does not relabel that run PASS.
Literal quoted fixture names are also checked against the actual command parser,
so a title containing “cancel” cannot accidentally become a cancellation request.

Actual direct PCM results are in `reports/stt-emulator-verified-2026-11-04.json`:
12 text results, no empty/errors, WER 11.11%, all six generated WAVs removed, and
three native PCM parser checks passed. See stt-evaluation.md for timing definitions
and limitations. The first native run's unverified cleanup report is retained;
CRLF result-field normalization was corrected and tested before fresh collection.
The full UI pass preceded this native-only parsing correction; its main app APK
still matches exactly. No UI behavior changed in that correction.

Seventeen fake-transport safety cases cover the CLI gates, bounded parsing, exact
fixture ownership, preserved foreign drafts/reviews, result dialogs, keyboard state
and LF/CRLF native results. A partial input failure now leaves uncertain text intact
and reports cleanup unverified. `reports/emulator-runner-final-coverage-2026-11-04.json` records
67.50% combined Python unit/native-integration line coverage for the final exact
source hash, exceeding the 60% general-module threshold. Unit-only coverage is
reported separately; the earlier UI trace is excluded from that union because
its source hash predates the safety corrections. A fresh final native collection in
`reports/stt-emulator-final-2026-11-04.json` again returned 12 results, 11.11% WER and
confirmed cleanup. The earlier coverage/cohort receipts remain historical. The emulator was stopped
after collection without clearing its saved data.
