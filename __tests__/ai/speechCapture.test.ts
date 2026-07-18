import { NativeModules } from 'react-native';
import {
  cancelOfflineSpeechCapture,
  getActiveOfflineCaptureId,
  hasOfflineSpeechCapture,
  startOfflineSpeechCapture,
  stopOfflineSpeechCapture,
} from '../../src/ai/native/speechCapture';
import type { OfflineSpeechResult } from '../../src/ai/native/speechCapture';

interface DeferredResult {
  promise: Promise<OfflineSpeechResult>;
  resolve: (result: OfflineSpeechResult) => void;
}

const deferredResult = (): DeferredResult => {
  let resolve!: (result: OfflineSpeechResult) => void;
  const promise = new Promise<OfflineSpeechResult>(resultResolve => {
    resolve = resultResolve;
  });
  return { promise, resolve };
};

describe('shared offline speech capture', () => {
  afterEach(() => {
    delete NativeModules.LafinaSpeechToText;
  });

  it('rejects a concurrent JS start until the active owner settles', async () => {
    const deferred = deferredResult();
    NativeModules.LafinaSpeechToText = {
      startListening: jest.fn().mockReturnValue(deferred.promise),
      stopListening: jest.fn().mockResolvedValue(true),
      cancelListening: jest.fn().mockResolvedValue(true),
    };

    const first = startOfflineSpeechCapture({
      mode: 'automatic',
      bargeIn: true,
      context: 'reminder_call',
    });

    expect(hasOfflineSpeechCapture()).toBe(true);
    expect(getActiveOfflineCaptureId()).toBe(first.captureId);
    expect(() =>
      startOfflineSpeechCapture({
        mode: 'manual',
        bargeIn: false,
        context: 'main_mic',
      }),
    ).toThrow('already active');

    deferred.resolve({
      captureId: first.captureId,
      transcript: 'acknowledge',
      speechDetected: true,
      cancelled: false,
      captureDurationMs: 1_600,
      inferenceDurationMs: 500,
    });
    await first.result;
    expect(getActiveOfflineCaptureId()).toBeNull();
  });

  it('rejects a native result owned by another capture ID', async () => {
    NativeModules.LafinaSpeechToText = {
      startListening: jest.fn().mockResolvedValue({
        captureId: 'stale-native-capture',
        transcript: 'acknowledge',
        speechDetected: true,
        cancelled: false,
        captureDurationMs: 1_400,
        inferenceDurationMs: 400,
      }),
      stopListening: jest.fn().mockResolvedValue(true),
      cancelListening: jest.fn().mockResolvedValue(true),
    };

    const capture = startOfflineSpeechCapture({
      mode: 'automatic',
      bargeIn: true,
      context: 'reminder_call',
    });

    await expect(capture.result).rejects.toThrow('active capture owner');
    expect(getActiveOfflineCaptureId()).toBeNull();
  });

  it('passes capture ownership IDs through stop and cancel requests', async () => {
    const stopListening = jest.fn().mockResolvedValue(false);
    const cancelListening = jest.fn().mockResolvedValue(true);
    NativeModules.LafinaSpeechToText = {
      startListening: jest.fn(),
      stopListening,
      cancelListening,
    };

    await expect(stopOfflineSpeechCapture('stale-capture')).resolves.toBe(
      false,
    );
    await expect(cancelOfflineSpeechCapture('current-capture')).resolves.toBe(
      true,
    );
    expect(stopListening).toHaveBeenCalledWith('stale-capture');
    expect(cancelListening).toHaveBeenCalledWith('current-capture');
  });

  it('releases a cancelled JS owner when its native result never settles', async () => {
    const firstDeferred = deferredResult();
    const secondDeferred = deferredResult();
    const startListening = jest
      .fn()
      .mockReturnValueOnce(firstDeferred.promise)
      .mockReturnValueOnce(secondDeferred.promise);
    NativeModules.LafinaSpeechToText = {
      startListening,
      stopListening: jest.fn().mockResolvedValue(true),
      cancelListening: jest.fn().mockResolvedValue(true),
    };

    const cancelled = startOfflineSpeechCapture({
      mode: 'manual',
      bargeIn: false,
      context: 'main_mic',
    });
    expect(getActiveOfflineCaptureId()).toBe(cancelled.captureId);

    await expect(
      cancelOfflineSpeechCapture(cancelled.captureId),
    ).resolves.toBe(true);
    expect(getActiveOfflineCaptureId()).toBeNull();

    const restarted = startOfflineSpeechCapture({
      mode: 'manual',
      bargeIn: false,
      context: 'main_mic',
    });
    expect(getActiveOfflineCaptureId()).toBe(restarted.captureId);

    secondDeferred.resolve({
      captureId: restarted.captureId,
      transcript: '',
      speechDetected: false,
      cancelled: true,
      captureDurationMs: 0,
      inferenceDurationMs: 0,
    });
    await restarted.result;
  });
});
