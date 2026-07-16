# Incoming Call Voice Pipeline Fix

Status: Completed  
Sprint: Sprint 9 reliability fix  
Layers: `src/ui/` and `src/scheduler/`  
Connectivity: Offline only

## What

Change the answered reminder call from automatic repeated listening to the same hold-to-talk interaction used by the schedule microphone, while retaining the call's offline Whisper.cpp transcription and acknowledge/snooze intent handling.

## Current Cause

- `answerCall()` plays the reminder announcement and immediately enters `runCallLoop()`.
- `runCallLoop()` starts up to three microphone captures without requiring a mic press.
- The answered-call screen displays a listening animation but does not provide an interactive microphone control.
- The schedule microphone uses press-in/start and press-out/stop interaction, but its Android `SpeechRecognizer` is not copied because it cannot guarantee offline transcription.

## Files

- Modify `src/scheduler/callDispatcher.ts`
- Modify `android/app/src/main/java/com/lafina/LafinaOfflineSpeech.kt`
- Modify `src/ui/screens/IncomingCallScreen.tsx`
- Modify `src/ui/components/call/CallAnsweredView.tsx`
- Modify `__tests__/scheduler/callDispatcher.test.ts`
- Modify `__tests__/scheduler/reminderCallFlow.test.ts`
- Add a focused answered-call UI test if needed

## Interfaces

- Add an exported function to begin the active call's offline voice capture on microphone press-in.
- Add an exported async function to stop capture and process the transcript on press-out.
- Extend `CallAnsweredViewProps` with typed microphone press-in and press-out callbacks.
- Keep the existing `CallState` values and NLU JSON schema unchanged.

## Behavior

1. Answering plays the locally generated/cached announcement and leaves the call connected.
2. Holding the microphone starts the existing `LafinaCallSpeechToText` pipeline using Silero VAD and Whisper.cpp.
3. Releasing the microphone stops capture, waits for local transcription, and processes only acknowledge or snooze intents.
   The native recorder treats a user-requested stop as a clean end of capture so recorded speech still reaches Whisper.
4. Empty or unsupported responses return to a connected retry state instead of automatically reopening the microphone.
5. Manual Acknowledge and Snooze buttons remain available.
6. Ending the call cancels any active capture and ignores stale transcription results.

## Dependencies

- No new packages.
- No cloud services, network checks, or Android `SpeechRecognizer` dependency.
- Reuse the bundled Whisper.cpp, Silero VAD, SmolLM2, and Kokoro modules.

## Tests

1. Answering does not start transcription until the microphone is pressed.
2. Press-in publishes `listening` and starts one offline capture.
3. Press-out stops capture and acknowledges a recognized response.
4. Snooze duration still updates and reschedules the reminder.
5. Empty and unsupported speech return to connected state without an automatic capture loop.
6. Disconnect cancels active capture and prevents stale results from changing reminder state.
7. The answered-call microphone exposes clear accessibility instructions.

## Required Verification

1. `npx tsc --noEmit`
2. `npm test`
3. `npx eslint src/`
4. Confirm modified scheduler/AI paths contain no cloud/sync imports or network calls.

## Verification Results

- `npx tsc --noEmit`: passed with zero errors.
- `npm test`: passed, 18 suites and 106 tests.
- `npx eslint src/`: passed with zero errors and 123 allowed warnings.
- Focused call voice tests: passed, 3 suites and 9 tests.
- `android\\gradlew.bat :app:compileDebugKotlin --offline`: passed.
- Offline audit: no cloud/sync imports, `fetch`, or Axios usage in the modified call pipeline.
- `git diff --check`: passed; only Git line-ending notices were reported.
