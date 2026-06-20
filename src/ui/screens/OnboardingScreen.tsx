import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { Colors, Fonts, Layout, Shadows } from '../theme';
import { userStore } from '../../storage/userStore';
import { behaviorStore } from '../../storage/behaviorStore';
import { BookOpen, Clock, Activity, Award } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';

interface OnboardingScreenProps {
  userId: string;
  onOnboardingComplete: () => void;
}

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({
  userId,
  onOnboardingComplete,
}) => {
  const [step, setStep] = useState(1);
  const totalSteps = 5;

  // Step 1: Daily Routine
  const [wakeTime, setWakeTime] = useState('07:00');
  const [sleepTime, setSleepTime] = useState('22:00');

  // Step 2: Study Habits
  const [studyPeak, setStudyPeak] = useState<string[]>([]);
  const [busiestDay, setBusiestDay] = useState('Monday');

  // Step 3: Task Preferences
  const [reminderLead, setReminderLead] = useState('15'); // in minutes
  const [snoozeTendency, setSnoozeTendency] = useState('Snooze once');

  // Step 4: Academic Info
  const [classCount, setClassCount] = useState('4-6');
  const [longestGap, setLongestGap] = useState('1 hour');

  const studyPeakOptions = [
    { label: 'Morning (6-10 AM)', value: 'morning' },
    { label: 'Late Morning (10 AM-12 PM)', value: 'late_morning' },
    { label: 'Afternoon (12-4 PM)', value: 'afternoon' },
    { label: 'Evening (4-8 PM)', value: 'evening' },
    { label: 'Night (8 PM-12 AM)', value: 'night' },
  ];

  const busiestDayOptions = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  
  const reminderLeadOptions = [
    { label: 'On the dot', value: '0' },
    { label: '15 min before', value: '15' },
    { label: '30 min before', value: '30' },
    { label: '1 hour before', value: '60' },
  ];

  const snoozeTendencyOptions = [
    { label: 'Do it right away', value: 'immediate' },
    { label: 'Snooze once', value: 'snooze_once' },
    { label: 'Snooze multiple times', value: 'snooze_multiple' },
    { label: 'Often ignore', value: 'ignore' },
  ];

  const classCountOptions = ['1-3', '4-6', '7+'];
  const longestGapOptions = ['None', '30 min', '1 hour', '2+ hours'];

  const wakeTimeOptions = ['05:00', '06:00', '07:00', '08:00', '09:00'];
  const sleepTimeOptions = ['21:00', '22:00', '23:00', '00:00', '01:00'];

  const { colors } = useTheme();
  const themed = useThemedStyles();

  const toggleStudyPeak = (value: string) => {
    if (studyPeak.includes(value)) {
      setStudyPeak(studyPeak.filter((p) => p !== value));
    } else {
      setStudyPeak([...studyPeak, value]);
    }
  };

  const handleNext = () => {
    if (step < totalSteps) {
      setStep(step + 1);
    } else {
      completeOnboarding();
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const completeOnboarding = () => {
    try {
      // 1. Log behavior events in database
      behaviorStore.logBehaviorEvent(userId, 'onboarding_response', 'typical_wake_time', wakeTime);
      behaviorStore.logBehaviorEvent(userId, 'onboarding_response', 'typical_sleep_time', sleepTime);
      behaviorStore.logBehaviorEvent(userId, 'onboarding_response', 'study_peak_hours', JSON.stringify(studyPeak));
      behaviorStore.logBehaviorEvent(userId, 'onboarding_response', 'busiest_day', busiestDay);
      behaviorStore.logBehaviorEvent(userId, 'onboarding_response', 'preferred_reminder_lead_time', reminderLead);
      behaviorStore.logBehaviorEvent(userId, 'onboarding_response', 'reminder_response_tendency', snoozeTendency);
      behaviorStore.logBehaviorEvent(userId, 'onboarding_response', 'weekly_class_count', classCount);
      behaviorStore.logBehaviorEvent(userId, 'onboarding_response', 'longest_class_gap', longestGap);

      // 2. Generate initial feature snapshot for ML cold-start adaptation
      const initialFeatureVector = JSON.stringify({
        preferredStudyTimes: studyPeak,
        busiestDay,
        typicalWakeTime: wakeTime,
        typicalSleepTime: sleepTime,
        reminderLeadMinutes: parseInt(reminderLead, 10),
        reminderSnoozeBehavior: snoozeTendency,
        academicLoadScore: classCount === '1-3' ? 1 : classCount === '4-6' ? 2 : 3,
        freeTimeGapsHours: longestGap === 'None' ? 0 : longestGap === '30 min' ? 0.5 : longestGap === '1 hour' ? 1.0 : 2.0,
      });
      
      behaviorStore.saveFeatureSnapshot(userId, 'schedule_preference', initialFeatureVector);

      // 3. Mark user onboarding complete
      userStore.markOnboardingComplete(userId);

      // 4. Trigger navigation callback
      onOnboardingComplete();
    } catch (error) {
      console.error('Failed completing onboarding:', error);
    }
  };

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <View>
            <View style={styles.iconHeaderContainer}>
              <Clock size={40} color={Colors.blue} />
            </View>
            <Text style={[styles.stepTitle, themed.stepTitle]}>Daily Routine</Text>
            <Text style={[styles.stepDesc, themed.stepDesc]}>When does your day usually begin and end?</Text>

            <Text style={[styles.inputLabel, themed.inputLabel]}>Typical Wake-Up Time</Text>
            <View style={styles.chipContainer}>
              {wakeTimeOptions.map((time) => (
                <TouchableOpacity
                  key={time}
                  style={[
                    styles.chip,
                    themed.chip,
                    wakeTime === time && styles.activeChip,
                  ]}
                  onPress={() => setWakeTime(time)}
                >
                  <Text style={[styles.chipText, themed.chipText, wakeTime === time && styles.activeChipText]}>
                    {time}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.inputLabel, themed.inputLabel]}>Typical Sleep Time</Text>
            <View style={styles.chipContainer}>
              {sleepTimeOptions.map((time) => (
                <TouchableOpacity
                  key={time}
                  style={[
                    styles.chip,
                    themed.chip,
                    sleepTime === time && styles.activeChip,
                  ]}
                  onPress={() => setSleepTime(time)}
                >
                  <Text style={[styles.chipText, themed.chipText, sleepTime === time && styles.activeChipText]}>
                    {time}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );
      case 2:
        return (
          <View>
            <View style={styles.iconHeaderContainer}>
              <BookOpen size={40} color={Colors.blue} />
            </View>
            <Text style={[styles.stepTitle, themed.stepTitle]}>Study Habits</Text>
            <Text style={[styles.stepDesc, themed.stepDesc]}>Tell us when you feel most productive studying.</Text>

            <Text style={[styles.inputLabel, themed.inputLabel]}>Peak Study Hours (Select multiple)</Text>
            <View style={styles.chipContainer}>
              {studyPeakOptions.map((option) => {
                const isSelected = studyPeak.includes(option.value);
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.chip,
                      themed.chip,
                      isSelected && styles.activeChip,
                    ]}
                    onPress={() => toggleStudyPeak(option.value)}
                  >
                    <Text style={[styles.chipText, themed.chipText, isSelected && styles.activeChipText]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.inputLabel, themed.inputLabel]}>Your Busiest Weekday</Text>
            <View style={styles.chipContainer}>
              {busiestDayOptions.map((day) => (
                <TouchableOpacity
                  key={day}
                  style={[
                    styles.chip,
                    themed.chip,
                    busiestDay === day && styles.activeChip,
                  ]}
                  onPress={() => setBusiestDay(day)}
                >
                  <Text style={[styles.chipText, themed.chipText, busiestDay === day && styles.activeChipText]}>
                    {day}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );
      case 3:
        return (
          <View>
            <View style={styles.iconHeaderContainer}>
              <Activity size={40} color={Colors.blue} />
            </View>
            <Text style={[styles.stepTitle, themed.stepTitle]}>Task Reminders</Text>
            <Text style={[styles.stepDesc, themed.stepDesc]}>How do you react to task notifications?</Text>

            <Text style={[styles.inputLabel, themed.inputLabel]}>Reminder Lead Time</Text>
            <View style={styles.chipContainer}>
              {reminderLeadOptions.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.chip,
                    themed.chip,
                    reminderLead === opt.value && styles.activeChip,
                  ]}
                  onPress={() => setReminderLead(opt.value)}
                >
                  <Text style={[styles.chipText, themed.chipText, reminderLead === opt.value && styles.activeChipText]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.inputLabel, themed.inputLabel]}>How do you handle call alarms?</Text>
            <View style={styles.chipContainer}>
              {snoozeTendencyOptions.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.chip,
                    themed.chip,
                    snoozeTendency === opt.value && styles.activeChip,
                  ]}
                  onPress={() => setSnoozeTendency(opt.value)}
                >
                  <Text style={[styles.chipText, themed.chipText, snoozeTendency === opt.value && styles.activeChipText]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );
      case 4:
        return (
          <View>
            <View style={styles.iconHeaderContainer}>
              <Award size={40} color={Colors.blue} />
            </View>
            <Text style={[styles.stepTitle, themed.stepTitle]}>Academic Load</Text>
            <Text style={[styles.stepDesc, themed.stepDesc]}>Help us optimize schedule gaps for task creation.</Text>

            <Text style={[styles.inputLabel, themed.inputLabel]}>Weekly Class Load</Text>
            <View style={styles.chipContainer}>
              {classCountOptions.map((load) => (
                <TouchableOpacity
                  key={load}
                  style={[
                    styles.chip,
                    themed.chip,
                    classCount === load && styles.activeChip,
                  ]}
                  onPress={() => setClassCount(load)}
                >
                  <Text style={[styles.chipText, themed.chipText, classCount === load && styles.activeChipText]}>
                    {load} Classes
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.inputLabel, themed.inputLabel]}>Longest Class Gap</Text>
            <View style={styles.chipContainer}>
              {longestGapOptions.map((gap) => (
                <TouchableOpacity
                  key={gap}
                  style={[
                    styles.chip,
                    themed.chip,
                    longestGap === gap && styles.activeChip,
                  ]}
                  onPress={() => setLongestGap(gap)}
                >
                  <Text style={[styles.chipText, themed.chipText, longestGap === gap && styles.activeChipText]}>
                    {gap}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );
      case 5:
        return (
          <View style={styles.finishContainer}>
            <View style={[styles.iconCircle, themed.iconCircle, Shadows.card]}>
              <Award size={50} color={colors.success} />
            </View>
            <Text style={[styles.stepTitle, themed.stepTitle]}>Ready to Sync</Text>
            <Text style={[styles.stepDesc, themed.stepDesc]}>
              We've created a baseline configuration. LAFINA will now learn from your daily schedule choices, phone call reminder responses, and voice scheduler tasks to offer adaptive scheduling.
            </Text>

            <View style={[styles.summaryCard, themed.summaryCard]}>
              <Text style={[styles.summaryTitle, themed.summaryTitle]}>Configuration Baseline</Text>
              <Text style={[styles.summaryItem, themed.summaryItem]}>• Sleep Cycle: {wakeTime} - {sleepTime}</Text>
              <Text style={[styles.summaryItem, themed.summaryItem]}>• Study Preference: {studyPeak.length > 0 ? studyPeak.join(', ') : 'Flexible'}</Text>
              <Text style={[styles.summaryItem, themed.summaryItem]}>• Reminder Lead: {reminderLead} minutes</Text>
              <Text style={[styles.summaryItem, themed.summaryItem]}>• Class Gap Slots: {longestGap}</Text>
            </View>
          </View>
        );
    }
  };

  return (
    <SafeAreaView style={[styles.container, themed.container]}>
      <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.background} />
      
      {/* Top Progress bar */}
      <View style={styles.progressContainer}>
        <View style={[styles.progressBarBg, themed.progressBarBg]}>
          <View
            style={[
              styles.progressBarActive,
              { width: `${(step / totalSteps) * 100}%` },
            ]}
          />
        </View>
        <Text style={[styles.progressText, themed.progressText]}>
          Step {step} of {totalSteps}
        </Text>
      </View>
 
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.card, Shadows.card, themed.card]}>{renderStepContent()}</View>
      </ScrollView>
 
      {/* Navigation Buttons */}
      <View style={[styles.navigation, themed.navigation]}>
        {step > 1 && step < totalSteps ? (
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Text style={[styles.backButtonText, themed.backButtonText]}>Back</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.backSpacer} />
        )}
 
        <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
          <Text style={styles.nextButtonText}>
            {step === totalSteps ? 'Get Started' : 'Continue'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

function useThemedStyles() {
  const { colors, isDarkMode } = useTheme();
  return {
    container: {
      backgroundColor: colors.background,
    },
    progressBarBg: {
      backgroundColor: colors.border,
    },
    progressText: {
      color: colors.textMuted,
    },
    card: {
      backgroundColor: colors.cardBg,
    },
    stepTitle: {
      color: colors.textPrimary,
    },
    stepDesc: {
      color: colors.textSecondary,
    },
    inputLabel: {
      color: colors.textPrimary,
    },
    chip: {
      backgroundColor: colors.inputBg,
      borderColor: colors.border,
    },
    chipText: {
      color: colors.textPrimary,
    },
    navigation: {
      borderTopColor: colors.border,
    },
    backButtonText: {
      color: colors.textSecondary,
    },
    iconCircle: {
      backgroundColor: isDarkMode ? 'rgba(46, 204, 113, 0.15)' : '#E8F8F0',
    },
    summaryCard: {
      backgroundColor: colors.inputBg,
      borderColor: colors.border,
    },
    summaryTitle: {
      color: colors.textPrimary,
    },
    summaryItem: {
      color: colors.textPrimary,
    },
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  progressContainer: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarActive: {
    height: '100%',
    backgroundColor: Colors.blue,
  },
  progressText: {
    fontFamily: Fonts.body,
    fontSize: 12,
    marginTop: 6,
    textAlign: 'right',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
  },
  card: {
    borderRadius: Layout.borderRadiusCard,
    padding: 24,
    minHeight: 380,
  },
  iconHeaderContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  stepTitle: {
    fontFamily: Fonts.heading,
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  stepDesc: {
    fontFamily: Fonts.body,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 24,
    lineHeight: 20,
  },
  inputLabel: {
    fontFamily: Fonts.body,
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    marginTop: 14,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  chip: {
    borderWidth: 1.5,
    borderRadius: Layout.borderRadiusPill,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  activeChip: {
    backgroundColor: Colors.blue,
    borderColor: Colors.blue,
  },
  chipText: {
    fontFamily: Fonts.body,
    fontSize: 13,
  },
  activeChipText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  navigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
  },
  backButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  backSpacer: {
    width: 80,
  },
  backButtonText: {
    fontFamily: Fonts.body,
    fontSize: 15,
    fontWeight: '600',
  },
  nextButton: {
    backgroundColor: Colors.blue,
    borderRadius: Layout.borderRadiusButton,
    paddingVertical: 12,
    paddingHorizontal: 24,
    minWidth: 120,
    alignItems: 'center',
  },
  nextButtonText: {
    fontFamily: Fonts.body,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  finishContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  summaryCard: {
    borderWidth: 1.5,
    borderRadius: Layout.borderRadiusCard,
    padding: 16,
    width: '100%',
    marginTop: 8,
  },
  summaryTitle: {
    fontFamily: Fonts.heading,
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  summaryItem: {
    fontFamily: Fonts.body,
    fontSize: 13,
    marginBottom: 4,
  },
});

