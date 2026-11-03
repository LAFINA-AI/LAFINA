# ADR-006: bounded optional speech readiness and owner-safe recovery

Date: 2026-11-04. Status: accepted within the authorized optional-engine follow-up.

Android recognition service existence is separate from installed English readiness.
API 33+ checkRecognitionSupport inspects installedOnDeviceLanguages for en-US.
Supported/pending languages are not installed readiness. ERROR_CANNOT_CHECK_SUPPORT
is reported as unknown; API 31/32 also remains unknown. Unknown permits only the
explicit createOnDeviceSpeechRecognizer path to try recognition. Missing English,
other support errors, permission loss, backgrounding and preparation timeout fail
safely. There is no generic recognizer, model download or automatic engine switch.

Inventory support probes have a four-second deadline and are destroyed on completion
or lifecycle release. The actual capture checks support before listening and checks
permission/foreground again afterward. Stop during preparation cancels the run, so a
late support callback cannot start a recording after Stop. Duplicate callbacks cannot
restart a listening run. Cancellation and destruction are attempted independently;
if both platform stop operations throw, microphone exclusion remains held until
process death instead of falsely permitting another recorder.

JS availability checks coalesce by requested provider, cap distinct in-flight keys at
four and discard results after completion/timeout rather than retaining stale caches.
Profile bounds automatic busy retries to three at 750 ms and cancels them on release.
Owner, visibility, foreground, render epoch and saved preference snapshots fence
retained handlers and asynchronous results. Preview rechecks the exact saved provider
and installed voice before playback. An account watcher stops only its owned preview.
Missing choices remain saved until the user explicitly chooses something else.

Native recognition inventory and TTS initialization run concurrently, staying under
the existing 12-second JS inventory deadline. Native capture, initialization and
utterance timers remain bounded. No raw audio, transcript or request text is logged
by these checks. Actual vendor permission/interruption/audibility behavior remains
part of the physical-device matrix; unit tests do not certify recording quality.

Primary Android references:
- https://developer.android.com/reference/android/speech/RecognitionSupport.html
- https://developer.android.com/reference/android/speech/SpeechRecognizer
