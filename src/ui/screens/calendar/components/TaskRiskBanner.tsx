import React, {useEffect, useState} from 'react';
import {Alert, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {CommandReviewPanel} from '../../../components/CommandReviewPanel';
import {useTheme} from '../../../contexts/ThemeContext';
import {predictTaskRisk} from '../../../../ml';
import type {AdherenceRisk, RiskLevel} from '../../../../ml';
import {CALL_EARLIER_MINUTES, moveTaskCallEarlier, readWaitingTaskCall} from '../../../../scheduler';
import {isDemoUser} from '../../../../storage';
import type {Task} from '../../../../storage';

const REVIEW_MS = 5 * 60_000;

const RISK_TEXT: Record<RiskLevel, string> = {
  high: 'High risk of missing this.',
  some: 'Some risk of missing this.',
  low: 'Low risk of missing this.',
};

const clock = (iso: string): string =>
  new Date(iso).toLocaleTimeString(undefined, {hour: 'numeric', minute: '2-digit'});

interface TaskRiskBannerProps {
  task: Task;
}

/**
 * Shows the Random Forest result in plain language, only when a prediction exists.
 * It offers an earlier call but never changes one without the review's Confirm.
 */
export const TaskRiskBanner: React.FC<TaskRiskBannerProps> = ({task}) => {
  const {colors} = useTheme();
  const [risk, setRisk] = useState<AdherenceRisk | null>(null);
  const [newTrigger, setNewTrigger] = useState<{from: string; to: string} | null>(null);
  const [review, setReview] = useState<{id: string; summary: string; expiresAt: string} | null>(null);

  useEffect(() => {
    setRisk(null);
    setNewTrigger(null);
    setReview(null);
    if (task.recurrenceRule || task.isCompleted) return;
    const call = readWaitingTaskCall(task.id, task.userId);
    if (!call) return;
    setRisk(predictTaskRisk(task.id, task.userId, Date.parse(call.scheduledAt), task.priority ?? null));
    if (call.earlierTriggerAt) setNewTrigger({from: call.triggerAt, to: call.earlierTriggerAt});
  }, [task.id, task.userId, task.recurrenceRule, task.isCompleted, task.priority]);

  if (!risk) return null;

  const openReview = () => {
    if (!newTrigger) return;
    setReview({
      id: `risk-${task.id}`,
      summary: `Call about “${task.title}” at ${clock(newTrigger.to)} instead of ${clock(newTrigger.from)}.`,
      expiresAt: new Date(Date.now() + REVIEW_MS).toISOString(),
    });
  };

  const confirm = async () => {
    const current = review;
    setReview(null);
    if (!current || Date.now() > Date.parse(current.expiresAt)) {
      Alert.alert('Review expired', 'Nothing was changed. Open the offer again to move this call.');
      return;
    }
    const result = await moveTaskCallEarlier(task.id, task.userId);
    if (result.ok) setNewTrigger(null);
    Alert.alert(result.ok ? 'Call moved' : 'Not moved', result.message);
  };

  const offer = risk.level === 'high' && newTrigger;
  return (
    <View testID="task-risk-banner" style={[styles.banner, {borderColor: colors.border, backgroundColor: colors.cardBg}]}>
      <Text style={[styles.headline, {color: risk.level === 'high' ? colors.red : colors.textPrimary}]}>
        {RISK_TEXT[risk.level]}
        {offer ? ` Call ${CALL_EARLIER_MINUTES} min earlier?` : ''}
      </Text>
      <Text style={[styles.detail, {color: colors.textSecondary}]}>
        Estimated from your last {risk.sampleSize} finished reminders.
        {isDemoUser(task.userId) ? ' Sample data for this demo account.' : ''}
      </Text>
      {offer && (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`Review calling ${CALL_EARLIER_MINUTES} minutes earlier`}
          onPress={openReview}
          style={[styles.action, {borderColor: colors.blue}]}
        >
          <Text style={[styles.actionText, {color: colors.blue}]}>Review earlier call</Text>
        </TouchableOpacity>
      )}
      <CommandReviewPanel review={review} onConfirm={() => void confirm()} onCancel={() => setReview(null)} />
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12},
  headline: {fontSize: 14, fontWeight: '700'},
  detail: {fontSize: 12, marginTop: 4},
  action: {alignSelf: 'flex-start', borderWidth: 1, borderRadius: 10, minHeight: 40, paddingHorizontal: 12, justifyContent: 'center', marginTop: 8},
  actionText: {fontSize: 13, fontWeight: '700'},
});
