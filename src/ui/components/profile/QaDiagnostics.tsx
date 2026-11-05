import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Text, TouchableOpacity } from 'react-native';
import { ToolSheet } from '../tools';
import { useTheme } from '../../contexts/ThemeContext';
import { speechEngineStore } from '../../../storage/speechEngineStore';
import {
  isQaDiagnosticsAvailable,
  runQaSqlChecks,
} from '../../../storage/qaSqlChecks';
import type { QaSqlReport } from '../../../storage/qaSqlChecks';
import { readAndroidSpeechDiagnostics } from '../../../ai/native/speechDiagnostics';
import type { SpeechDiagnostics } from '../../../ai/native/speechDiagnostics';

interface Props {
  userId: string;
  visible: boolean;
  onClose: () => void;
}
const timingLabels: Record<keyof SpeechDiagnostics['metrics'], string> = {
  ttsInitializationMs: 'TTS initialization',
  recognitionSupportMs: 'English support check',
  captureReadyMs: 'Capture request to ready',
  captureDurationMs: 'Capture request lifetime',
  speechStartMs: 'Speech request to start callback',
  speechDurationMs: 'Speech request lifetime',
};
/** Displays explicit synthetic checks only when the native dedicated-QA gate is enabled. */
export const QaDiagnostics = ({
  userId,
  visible,
  onClose,
}: Props): React.JSX.Element | null => {
  const { colors } = useTheme();
  const available = isQaDiagnosticsAvailable();
  const [report, setReport] = useState<QaSqlReport | null>(null),
    [speech, setSpeech] = useState<SpeechDiagnostics | null>(null),
    [busy, setBusy] = useState<'sql' | 'speech' | null>(null);
  const epoch = useRef(0),
    lifetime = useRef({
      mounted: true,
      userId,
      visible,
      foreground:
        AppState.currentState !== 'background' &&
        AppState.currentState !== 'inactive',
    });
  if (
    lifetime.current.userId !== userId ||
    lifetime.current.visible !== visible
  ) {
    epoch.current++;
    lifetime.current.userId = userId;
    lifetime.current.visible = visible;
  }
  const renderedEpoch = epoch.current;
  const invalidate = useCallback(() => {
    epoch.current++;
  }, []);
  const [notice, setNotice] = useState('');
  const [foreground, setForeground] = useState(lifetime.current.foreground);
  const current = useCallback(
    (ticket?: number) =>
      lifetime.current.mounted &&
      lifetime.current.visible &&
      lifetime.current.foreground &&
      lifetime.current.userId === userId &&
      (ticket === undefined || ticket === epoch.current) &&
      isQaDiagnosticsAvailable() &&
      speechEngineStore.isActiveAccount(userId),
    [userId],
  );
  useEffect(() => {
    const session = lifetime.current;
    session.mounted = true;
    setReport(null);
    setSpeech(null);
    setBusy(null);
    const subscription = AppState.addEventListener('change', state => {
      const active = state === 'active';
      if (session.foreground !== active) {
        session.foreground = active;
        invalidate();
        setForeground(active);
      }
      if (active) setBusy(null);
    });
    return () => {
      session.mounted = false;
      subscription.remove();
    };
  }, [visible, userId, invalidate]);
  const runSql = async () => {
    if (!current()) return;
    const ticket = ++epoch.current;
    setBusy('sql');
    setNotice('');
    setReport(null);
    try {
      const value = await runQaSqlChecks(() => current(ticket));
      if (current(ticket)) setReport(value);
    } catch {
      if (current(ticket))
        setReport({
          status: 'failed',
          checks: [],
          cleanup: 'failed',
          durationMs: 0,
          schemaVersion: 24,
        });
    } finally {
      if (current(ticket)) setBusy(null);
    }
  };
  const readSpeech = async () => {
    if (!current()) return;
    const ticket = ++epoch.current;
    setBusy('speech');
    setNotice('');
    setSpeech(null);
    try {
      const value = await readAndroidSpeechDiagnostics();
      if (current(ticket)) setSpeech(value);
    } catch {
      if (current(ticket))
        setNotice('Speech diagnostics unavailable. Close and retry.');
    } finally {
      if (current(ticket)) setBusy(null);
    }
  };
  const close = () => {
    if (current(renderedEpoch)) {
      epoch.current++;
      onClose();
    }
  };
  const button = (label: string, action: () => Promise<void>) => (
    <TouchableOpacity
      key={label}
      accessibilityRole="button"
      disabled={busy !== null || !foreground}
      onPress={() => {
        if (busy === null && foreground && current(renderedEpoch))
          return action();
      }}
      style={{ paddingVertical: 14 }}
    >
      <Text style={{ color: colors.textPrimary }}>{label}</Text>
    </TouchableOpacity>
  );
  if (!available || !visible) return null;
  return (
    <ToolSheet visible title="QA diagnostics" onClose={close}>
      <Text style={{ color: colors.textPrimary }}>
        Dedicated QA build. SQLite checks use a new synthetic cache database,
        close it and remove it afterward. They do not modify student records.
      </Text>
      {notice && (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: colors.textPrimary }}
        >
          {notice}
        </Text>
      )}
      {button('Run isolated SQLite checks', runSql)}
      {busy === 'sql' && (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: colors.textPrimary }}
        >
          Checking isolated SQLite…
        </Text>
      )}
      {report && (
        <>
          <Text
            accessibilityLiveRegion="polite"
            style={{ color: colors.textPrimary }}
          >
            {report.status === 'passed'
              ? `${report.checks.filter(check => check.passed).length} of ${
                  report.checks.length
                } checks passed`
              : `Checks did not finish successfully (${report.status}). Retry after closing diagnostics.`}
          </Text>
          <Text style={{ color: colors.textSecondary }}>
            Schema {report.schemaVersion}; {report.durationMs} ms.{' '}
            {report.cleanup === 'removed'
              ? 'Synthetic fixture removed'
              : report.cleanup === 'not-created'
              ? 'No fixture was opened'
              : 'Cleanup could not be confirmed. Close diagnostics and retry.'}
          </Text>
          {report.checks.map(check => (
            <Text
              key={check.name}
              style={{ color: check.passed ? colors.textPrimary : colors.red }}
            >
              {check.passed ? 'PASS' : 'FAIL'}: {check.name}
            </Text>
          ))}
        </>
      )}
      {button('Read local speech diagnostics', readSpeech)}
      {busy === 'speech' && (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: colors.textPrimary }}
        >
          Reading local timing metadata…
        </Text>
      )}
      {speech && !speech.available && (
        <Text style={{ color: colors.textPrimary }}>
          Speech diagnostics unavailable.
        </Text>
      )}
      {speech?.available && (
        <>
          <Text style={{ color: colors.textPrimary }}>
            Android API {speech.sdk}; English status: {speech.recognitionState}.
            Capture active: {speech.captureActive ? 'yes' : 'no'}; speech
            active: {speech.speechActive ? 'yes' : 'no'}.
          </Text>
          {(
            Object.keys(timingLabels) as Array<
              keyof SpeechDiagnostics['metrics']
            >
          ).map(key => (
            <Text key={key} style={{ color: colors.textSecondary }}>
              {timingLabels[key]}:{' '}
              {speech.metrics[key] === null
                ? 'Not observed'
                : `${speech.metrics[key]!.toFixed(1)} ms`}
            </Text>
          ))}
          <Text style={{ color: colors.textSecondary }}>
            These are process-local callback timings. They do not measure
            audibility, recognition accuracy or physical-phone performance.
            Reading this panel starts no recording or speech.
          </Text>
        </>
      )}
    </ToolSheet>
  );
};
