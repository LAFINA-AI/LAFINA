/// <reference types='node' />

import {readFileSync} from 'fs';
import {resolve} from 'path';

const projectRoot = resolve(__dirname, '..', '..');

const readProjectFile = (relativePath: string): string =>
  readFileSync(resolve(projectRoot, relativePath), 'utf8');

describe('offline native speech configuration', () => {
  it('disables Whisper no-speech suppression after the external VAD gate', () => {
    const bridgeSource = readProjectFile(
      'android/app/src/main/cpp/whisper_jni.cc',
    );
    const whisperSource = readProjectFile(
      'android/app/src/main/cpp/third_party/whisper.cpp/src/whisper.cpp',
    );

    expect(bridgeSource).toContain(
      'constexpr float kDisabledNoSpeechThreshold = 1.0f;',
    );
    expect(bridgeSource).toContain(
      'params.no_speech_thold = kDisabledNoSpeechThreshold;',
    );
    expect(whisperSource).toContain(
      'state->no_speech_prob > params.no_speech_thold',
    );
  });

  it('uses mobile-friendly decoding and optimized native debug builds', () => {
    const bridgeSource = readProjectFile(
      'android/app/src/main/cpp/whisper_jni.cc',
    );
    const nativeBuildSource = readProjectFile(
      'android/app/src/main/cpp/CMakeLists.txt',
    );

    expect(bridgeSource).toContain(
      'whisper_full_default_params(WHISPER_SAMPLING_GREEDY)',
    );
    expect(bridgeSource).toContain('params.single_segment = true;');
    expect(bridgeSource).toContain('params.greedy.best_of = 1;');
    expect(bridgeSource).not.toContain('params.beam_search.beam_size');
    expect(nativeBuildSource).toContain(
      'add_compile_options($<$<CONFIG:Debug>:-O3>)',
    );
  });

  it('trims to the VAD speech window before preparing audio for Whisper', () => {
    const captureSource = readProjectFile(
      'android/app/src/main/java/com/lafina/LafinaOfflineSpeech.kt',
    );

    expect(captureSource).toContain(
      'captured.speechStartSample - WHISPER_SPEECH_MARGIN_SAMPLES',
    );
    expect(captureSource).toContain(
      'captured.speechEndSample + WHISPER_SPEECH_MARGIN_SAMPLES',
    );
    expect(captureSource).toContain('prepareForWhisper(speechSamples)');
    expect(captureSource).not.toContain('prepareForWhisper(captured.samples)');
  });

  it('keeps the Redmi fixture in Whisper-compatible PCM format', () => {
    const fixture = readFileSync(
      resolve(
        projectRoot,
        '__tests__/fixtures/voice_command_test_16k_mono.wav',
      ),
    );
    const deviceFixture = readFileSync(
      resolve(
        projectRoot,
        'android/app/src/debug/assets/voice_command_test.f32',
      ),
    );

    expect(fixture.toString('ascii', 0, 4)).toBe('RIFF');
    expect(fixture.toString('ascii', 8, 12)).toBe('WAVE');
    expect(fixture.readUInt16LE(20)).toBe(1);
    expect(fixture.readUInt16LE(22)).toBe(1);
    expect(fixture.readUInt32LE(24)).toBe(16_000);
    expect(fixture.readUInt16LE(34)).toBe(16);
    expect(deviceFixture.length).toBe(59_392 * Float32Array.BYTES_PER_ELEMENT);
  });
});
