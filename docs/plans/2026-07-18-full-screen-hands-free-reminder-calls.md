# Full-Screen Hands-Free Reminder Calls

Status: Approved for implementation  
Sprint: Sprint 9 reliability fix  
Connectivity: Offline only

## Outcome

- Remove Answer and Decline actions from the Android call notification while preserving its ringtone and full-screen intent.
- Keep the LAFINA full-screen incoming Answer/Decline UI. On Android 13+ while another app is visible, tapping the action-free heads-up notification body opens that incoming screen.
- After Answer, automatically listen for a response with the same on-device Silero VAD and Whisper.cpp pipeline used by the main microphone. The main microphone keeps its hold-to-talk interaction; only the call becomes hands-free.
- Keep the on-screen Acknowledge, Snooze, and End Call controls as fallbacks.

## Android Lifecycle

- The incoming notification remains the OS-supported full-screen-intent carrier; its content intent always targets `MainActivity` with the reminder payload.
- Answering starts a microphone foreground service while the activity is visible, before removing the incoming notification. The service posts an action-free ongoing notification, owns a partial wake lock, and uses the microphone foreground-service type.
- The service remains active through AudioRecord capture and Whisper inference and stops on acknowledge, snooze, decline, timeout, End Call, or dispatcher failure.
- A locked/off device and a foreground LAFINA process open the full-screen incoming UI. An unlocked/in-use Android 13+ device may show the OS heads-up; tapping its body must land on the same incoming UI.

## Offline Speech and Barge-In

- Use the bundled `ggml-tiny.en-q5_1.bin` model only. Do not add a network recognizer or new dependency.
- Consolidate native capture behind one `LafinaSpeechToText` bridge with manual and automatic modes.
- Automatic call capture uses Silero VAD, an eight-second ceiling, 1.2 seconds of trailing silence, speech pre-roll, and platform acoustic echo cancellation/noise suppression when available.
- Begin capture before call TTS. A capture-scoped speech-start event immediately interrupts TTS, then Whisper processes the completed utterance.
- The concurrently played announcement and retry prompts must not contain the action keywords. This is intentional defense in depth: if AEC is unavailable and TTS leaks into the microphone, the echo fails the strict matcher instead of acknowledging or snoozing.
- Audio-end-to-final-transcript budget on the representative mid-range arm64 test phone: median at most 1.5 seconds and p95 at most 3 seconds. Record native capture and inference timings during device QA.

## Accepted Call Grammar

Matching is case-insensitive and punctuation-tolerant. These are the only accepted families:

- `acknowledge`, optionally prefixed by `please` or followed by `it`, `this`, or `reminder`.
- `snooze`, with the same optional polite/object words.
- `snooze 10`, `snooze for 10`, `snooze 10 minutes`, or `snooze for 10 minutes`, for integer durations from 1 through 120.

Phrases such as `yep`, `got it`, `dismiss`, `later`, `stop`, and `yes` are rejected. Three empty or rejected attempts apply the existing auto-snooze/missed policy. Permission or native-runtime failures do not consume attempts and leave the manual buttons available.

## Capture Ownership

- Every capture has an ID. The native bridge atomically claims the single capture slot before touching AudioRecord and rejects a second start with `CAPTURE_BUSY`.
- Stop/cancel calls include the capture ID and affect only the matching owner. A clean stop transcribes captured audio; cancellation discards it.
- The JS dispatcher also compares the active call session and capture ID before processing results, so late results cannot mutate a closed call or a newer retry.

## Verification

Automated coverage must include notification payload routing, automatic answer capture, TTS barge-in, strict grammar, custom snooze duration, three-attempt fallback, permission/runtime fallback, double-start rejection, stale stop/result handling, and manual controls.

Device matrix:

- Locked/off screen -> full-screen incoming call.
- LAFINA foreground -> full-screen incoming call.
- Android 13+ unlocked with another app in use -> heads-up without Answer/Decline -> tap notification body -> incoming call screen.
- Full-screen permission denied -> heads-up body still opens incoming call screen.
- Background/locked capture survives through TTS, AudioRecord, Whisper inference, and resolution while the foreground service and wake lock are active.
- Quiet and at least 65 dB noise tests, including speaking during TTS and a device without AEC support.

Run one package-manager workflow in this order:

1. `npx tsc --noEmit`
2. `npm test`
3. `npx eslint src/`
4. `npm test -- --coverage`
5. From `android/`: `.\gradlew.bat :app:compileDebugKotlin --offline`

All commands must pass, with at least 80% coverage for modified AI and scheduler paths.
