# ADR-005: explicit optional Android provider, voice, rate and pitch

Date: 2026-11-04. Status: accepted under the existing optional-engine approval.

Whisper and Kokoro remain defaults. Version-2 JSON in the existing account-local
speech_engines_v1 setting adds nullable providerPackage and neutral rate/pitch 1.0.
Reading old JSON preserves its explicit engines/voice and supplies new defaults in
memory. Writes validate finite 0.5–2.0 values, package shape, voice and active owner
inside a transaction. No schema migration, network, download or new package is used.

Profile lists installed enabled TTS services, then voices from the explicitly
requested provider. Choosing a provider only browses its inventory; choosing a voice
saves that selection. Speed/pitch have bounded step controls and neutral reset.
Preview/Stop and both reminder-provider adapters carry the exact saved options.
Native code rechecks installed provider, installed offline English live voice,
setVoice result and selected voice, rate/pitch success, foreground/audio focus and
owned request lifetime. Other providers cannot displace an initialization already
in flight. Missing providers/voices give a recoverable error; text remains usable.

Public Android TextToSpeech(context, listener, package) can internally fall back
while initializing. getDefaultEngine reports the system preference, not the binder
that actually connected. Installed provider and live voice checks therefore do not
prove binder identity; no hidden/reflection API or claim of verified provider binding
is introduced. The reported package is requested/system selection. Preview and
physical-device offline audibility remain necessary vendor validation. A response
reporting a different provider from the requested one is rejected by the JS adapter.

Primary references:
- https://developer.android.com/reference/android/speech/tts/TextToSpeech
- https://android.googlesource.com/platform/frameworks/base/+/ee0b3e9/core/java/android/speech/tts/TextToSpeech.java

Stronger capability checks, recheck coalescing and retained-handler recovery follow
in the next separately verified stage. Actual pitch/rate audibility is not measured
by metadata, mocked playback success or native policy unit checks.
