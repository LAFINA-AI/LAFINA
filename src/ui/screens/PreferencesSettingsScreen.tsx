import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { behaviorStore, preferencesStore } from '../../storage';
import type {
  LongestClassGap,
  SnoozeTendency,
  StudyPeakHour,
  UserPreferences,
  WeeklyClassCount,
} from '../../storage';
import { refreshPendingReminderLeadTimes } from '../../scheduler';
import { Fonts, Layout, Shadows } from '../theme';
import { useTheme } from '../contexts/ThemeContext';

interface PreferencesSettingsScreenProps {
  userId: string;
  onBack: () => void;
  onSaved: (preferences: UserPreferences) => void;
}

/**
 * Warning shown before the scheduling-only guardrail is lifted, verbatim.
 *
 * The cost of general answers is the point: they are longer, so they drain the
 * student's token limit far faster than a scheduling acknowledgement.
 */
export const ALLOW_GENERAL_INQUIRIES_WARNING =
  'Disabling this restriction allows the AI to answer general questions outside of scheduling. ' +
  'Please note that general inquiries often generate longer responses and may consume your token limit significantly faster. ' +
  'Are you sure you want to proceed?';

interface PreferenceOption {
  label: string;
  value: string;
}

interface PreferenceOptionGroupProps {
  title: string;
  options: PreferenceOption[];
  selectedValues: string[];
  onSelect: (value: string) => void;
}

const WAKE_OPTIONS: PreferenceOption[] = ['05:00', '06:00', '07:00', '08:00', '09:00'].map(
  (value) => ({ label: value, value })
);
const SLEEP_OPTIONS: PreferenceOption[] = ['21:00', '22:00', '23:00', '00:00', '01:00'].map(
  (value) => ({ label: value, value })
);
const STUDY_OPTIONS: PreferenceOption[] = [
  { label: 'Morning', value: 'morning' },
  { label: 'Late Morning', value: 'late_morning' },
  { label: 'Afternoon', value: 'afternoon' },
  { label: 'Evening', value: 'evening' },
  { label: 'Night', value: 'night' },
];
const BUSIEST_DAY_OPTIONS: PreferenceOption[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
].map((value) => ({ label: value, value }));
const REMINDER_LEAD_OPTIONS: PreferenceOption[] = [
  { label: 'On the dot', value: '0' },
  { label: '15 min before', value: '15' },
  { label: '30 min before', value: '30' },
  { label: '1 hour before', value: '60' },
];
const SNOOZE_OPTIONS: PreferenceOption[] = [
  { label: 'Do it right away', value: 'immediate' },
  { label: 'Snooze once', value: 'snooze_once' },
  { label: 'Snooze multiple times', value: 'snooze_multiple' },
  { label: 'Often ignore', value: 'ignore' },
];
const CLASS_COUNT_OPTIONS: PreferenceOption[] = ['1-3', '4-6', '7+'].map((value) => ({
  label: `${value} classes`,
  value,
}));
const CLASS_GAP_OPTIONS: PreferenceOption[] = ['None', '30 min', '1 hour', '2+ hours'].map(
  (value) => ({ label: value, value })
);

const PreferenceOptionGroup: React.FC<PreferenceOptionGroupProps> = ({
  title,
  options,
  selectedValues,
  onSelect,
}) => {
  const { colors } = useTheme();

  return (
    <View style={styles.optionGroup}>
      <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>{title}</Text>
      <View style={styles.chipRow}>
        {options.map((option) => {
          const isSelected = selectedValues.includes(option.value);
          return (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.chip,
                { backgroundColor: colors.inputBg, borderColor: colors.border },
                isSelected && { backgroundColor: colors.blue, borderColor: colors.blue },
              ]}
              onPress={() => onSelect(option.value)}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: colors.textPrimary },
                  isSelected && { color: colors.white, fontWeight: 'bold' },
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

/**
 * Edits the onboarding preferences that drive local scheduling and reminder behavior.
 */
export const PreferencesSettingsScreen: React.FC<PreferencesSettingsScreenProps> = ({
  userId,
  onBack,
  onSaved,
}) => {
  const initial = useMemo(() => preferencesStore.get(userId), [userId]);
  const [wakeTime, setWakeTime] = useState(initial.wakeTime);
  const [sleepTime, setSleepTime] = useState(initial.sleepTime);
  const [studyPeakHours, setStudyPeakHours] = useState<StudyPeakHour[]>(
    initial.studyPeakHours
  );
  const [busiestDay, setBusiestDay] = useState(initial.busiestDay);
  const [reminderLeadMinutes, setReminderLeadMinutes] = useState(
    String(initial.reminderLeadMinutes)
  );
  const [snoozeTendency, setSnoozeTendency] = useState<SnoozeTendency>(
    initial.snoozeTendency
  );
  const [weeklyClassCount, setWeeklyClassCount] = useState<WeeklyClassCount>(
    initial.weeklyClassCount
  );
  const [longestClassGap, setLongestClassGap] = useState<LongestClassGap>(
    initial.longestClassGap
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The switch shows the inverse of the stored guardrail: on means unrestricted. */
  const [allowGeneralInquiries, setAllowGeneralInquiries] = useState(
    () => !preferencesStore.getSchedulingOnly(userId)
  );
  const { colors } = useTheme();

  const wakeOptions = useMemo(
    () =>
      WAKE_OPTIONS.some((option) => option.value === wakeTime)
        ? WAKE_OPTIONS
        : [{ label: `Current: ${wakeTime}`, value: wakeTime }, ...WAKE_OPTIONS],
    [wakeTime]
  );
  const sleepOptions = useMemo(
    () =>
      SLEEP_OPTIONS.some((option) => option.value === sleepTime)
        ? SLEEP_OPTIONS
        : [{ label: `Current: ${sleepTime}`, value: sleepTime }, ...SLEEP_OPTIONS],
    [sleepTime]
  );

  const toggleStudyPeak = (value: string): void => {
    const typedValue = value as StudyPeakHour;
    setStudyPeakHours((current) =>
      current.includes(typedValue)
        ? current.filter((entry) => entry !== typedValue)
        : [...current, typedValue]
    );
  };

  /**
   * Persists the guardrail choice and records it for feature-adoption analysis.
   *
   * The preference is stored on its own so it takes effect immediately rather
   * than waiting for Save Preferences, and the local behavior log stays offline.
   */
  const applyGeneralInquiries = (allow: boolean): void => {
    try {
      preferencesStore.setSchedulingOnly(userId, !allow);
    } catch (toggleError) {
      console.error('Failed saving the general inquiries preference:', toggleError);
      Alert.alert(
        'Preference Not Saved',
        'The scheduling-only setting could not be changed. Please try again.'
      );
      return;
    }

    try {
      behaviorStore.logBehaviorEvent(
        userId,
        'ai_preference',
        'allow_general_inquiries',
        allow ? 'true' : 'false'
      );
    } catch (logError) {
      console.warn('Could not log the general inquiries preference:', logError);
    }

    setAllowGeneralInquiries(allow);
  };

  /** Turning the guardrail off costs tokens, so it is confirmed first. */
  const handleToggleGeneralInquiries = (allow: boolean): void => {
    if (!allow) {
      applyGeneralInquiries(false);
      return;
    }

    Alert.alert('Allow General Inquiries?', ALLOW_GENERAL_INQUIRIES_WARNING, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Proceed',
        style: 'destructive',
        onPress: () => applyGeneralInquiries(true),
      },
    ]);
  };

  const handleSave = async (): Promise<void> => {
    if (isSaving) return;
    setIsSaving(true);
    setError(null);

    const updatedPreferences: UserPreferences = {
      wakeTime,
      sleepTime,
      studyPeakHours,
      busiestDay,
      reminderLeadMinutes: Number.parseInt(reminderLeadMinutes, 10),
      snoozeTendency,
      weeklyClassCount,
      longestClassGap,
    };

    try {
      preferencesStore.save(userId, updatedPreferences);
      const refreshResult = await refreshPendingReminderLeadTimes(
        userId,
        updatedPreferences.reminderLeadMinutes
      );
      onSaved(updatedPreferences);
      if (refreshResult.failedCount > 0) {
        Alert.alert(
          'Preferences saved',
          `${refreshResult.failedCount} existing reminder alarm(s) could not be updated. They will be reconciled when the app starts again.`
        );
      }
      onBack();
    } catch (saveError) {
      console.error('Failed saving preference settings:', saveError);
      setError('Preferences could not be saved. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <ChevronLeft size={22} color={colors.textPrimary} />
          <Text style={[styles.backText, { color: colors.textPrimary }]}>Profile</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Preferences</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, Shadows.card, { backgroundColor: colors.cardBg }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Daily routine</Text>
          <PreferenceOptionGroup
            title="Wake-up time"
            options={wakeOptions}
            selectedValues={[wakeTime]}
            onSelect={setWakeTime}
          />
          <PreferenceOptionGroup
            title="Sleep time"
            options={sleepOptions}
            selectedValues={[sleepTime]}
            onSelect={setSleepTime}
          />
        </View>

        <View style={[styles.card, Shadows.card, { backgroundColor: colors.cardBg }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Study habits</Text>
          <PreferenceOptionGroup
            title="Peak study hours"
            options={STUDY_OPTIONS}
            selectedValues={studyPeakHours}
            onSelect={toggleStudyPeak}
          />
          <PreferenceOptionGroup
            title="Busiest day"
            options={BUSIEST_DAY_OPTIONS}
            selectedValues={[busiestDay]}
            onSelect={setBusiestDay}
          />
        </View>

        <View style={[styles.card, Shadows.card, { backgroundColor: colors.cardBg }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Reminders</Text>
          <PreferenceOptionGroup
            title="Reminder lead time"
            options={REMINDER_LEAD_OPTIONS}
            selectedValues={[reminderLeadMinutes]}
            onSelect={setReminderLeadMinutes}
          />
          <PreferenceOptionGroup
            title="Call alarm response"
            options={SNOOZE_OPTIONS}
            selectedValues={[snoozeTendency]}
            onSelect={(value) => setSnoozeTendency(value as SnoozeTendency)}
          />
        </View>

        <View style={[styles.card, Shadows.card, { backgroundColor: colors.cardBg }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Academic load</Text>
          <PreferenceOptionGroup
            title="Weekly classes"
            options={CLASS_COUNT_OPTIONS}
            selectedValues={[weeklyClassCount]}
            onSelect={(value) => setWeeklyClassCount(value as WeeklyClassCount)}
          />
          <PreferenceOptionGroup
            title="Longest class gap"
            options={CLASS_GAP_OPTIONS}
            selectedValues={[longestClassGap]}
            onSelect={(value) => setLongestClassGap(value as LongestClassGap)}
          />
        </View>

        <View style={[styles.card, Shadows.card, { backgroundColor: colors.cardBg }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>AI Preferences</Text>
          <View style={styles.toggleRow}>
            <View style={styles.toggleText}>
              <Text style={[styles.toggleLabel, { color: colors.textPrimary }]}>
                Allow General Inquiries
              </Text>
              <Text style={[styles.toggleHint, { color: colors.textSecondary }]}>
                {allowGeneralInquiries
                  ? 'LAFINA may also answer general questions outside scheduling. Longer answers use your token limit faster.'
                  : 'Scheduling-only: LAFINA politely declines anything outside tasks, calendars, and study plans.'}
              </Text>
            </View>
            <Switch
              value={allowGeneralInquiries}
              onValueChange={handleToggleGeneralInquiries}
              trackColor={{ false: colors.switchTrackOff, true: colors.blue }}
              thumbColor={colors.switchThumb}
              accessibilityLabel="Allow General Inquiries"
            />
          </View>
        </View>

        {error && <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>}

        <TouchableOpacity
          style={[styles.saveButton, { backgroundColor: colors.blue }]}
          onPress={() => void handleSave()}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={[styles.saveButtonText, { color: colors.white }]}>Save Preferences</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    height: 58,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  backButton: {
    width: 90,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backText: {
    fontFamily: Fonts.body,
    fontSize: 14,
  },
  headerTitle: {
    fontFamily: Fonts.heading,
    fontSize: 17,
    fontWeight: 'bold',
  },
  headerSpacer: {
    width: 90,
  },
  content: {
    padding: 16,
    paddingBottom: 120,
  },
  card: {
    borderRadius: Layout.borderRadiusCard,
    padding: 16,
    marginBottom: 14,
  },
  sectionTitle: {
    fontFamily: Fonts.heading,
    fontSize: 17,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  optionGroup: {
    marginTop: 14,
  },
  optionTitle: {
    fontFamily: Fonts.body,
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginBottom: 9,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    gap: 12,
  },
  toggleText: {
    flex: 1,
  },
  toggleLabel: {
    fontFamily: Fonts.body,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  toggleHint: {
    fontFamily: Fonts.body,
    fontSize: 12,
    lineHeight: 17,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    borderWidth: 1.5,
    borderRadius: Layout.borderRadiusPill,
    paddingHorizontal: 13,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  chipText: {
    fontFamily: Fonts.body,
    fontSize: 13,
  },
  errorText: {
    fontFamily: Fonts.body,
    fontSize: 13,
    marginBottom: 12,
    textAlign: 'center',
  },
  saveButton: {
    minHeight: 50,
    borderRadius: Layout.borderRadiusButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    fontFamily: Fonts.body,
    fontSize: 15,
    fontWeight: 'bold',
  },
});
