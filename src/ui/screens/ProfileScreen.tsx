import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
} from 'react-native';
import { Colors, Fonts, Layout, Shadows } from '../theme';
import { preferencesStore, tasksStore, notesStore, userStore } from '../../storage';
import type { UserPreferences } from '../../storage';
import type { User } from '../../storage';
import { useTheme } from '../contexts/ThemeContext';
import { useThemedStyles } from '../theme/createThemedStyles';
import type { ThemeColors } from '../contexts/ThemeContext';
import { GUEST_USER_ID } from '../../constants';
import { SvgXml } from 'react-native-svg';
import { ARC_SCREEN_XML } from '../../assets/arc_screen_xml';
import { Pencil } from 'lucide-react-native';
import { accountLinkService } from '../../cloud/accountLinkService';
import { authService } from '../../cloud/authService';
import { normalizeEmail } from '../../storage/authUtils';
import { syncWorker } from '../../sync/syncWorker';

// Profile sub-components
import { ProfileStats } from '../components/profile/ProfileStats';
import { SettingItem } from '../components/profile/SettingItem';
import { PrivacyModal } from '../components/profile/PrivacyModal';
import { PreferencesSettingsScreen } from './PreferencesSettingsScreen';

function getInitials(username: string | null | undefined): string {
  if (!username || username.trim().length === 0) {
    return '?';
  }
  const words = username.trim().split(/[\s_-]+/).filter(Boolean);
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
}

const getSnoozePreferenceLabel = (preferences: UserPreferences): string => {
  switch (preferences.snoozeTendency) {
    case 'immediate':
      return 'Immediate';
    case 'snooze_multiple':
      return 'Multiple snoozes';
    case 'ignore':
      return 'Often ignore';
    default:
      return 'Snooze once';
  }
};

interface ProfileScreenProps {
  userId: string;
  refreshTrigger: number;
  onRefresh: () => void;
  onLogout?: (isGuest?: boolean) => void;
  onNavigateToRegister?: () => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  userId,
  refreshTrigger,
  onRefresh,
  onLogout,
  onNavigateToRegister,
}) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Stats
  const [completedTasksCount, setCompletedTasksCount] = useState(0);
  const [notesCount, setNotesCount] = useState(0);
  const [voiceCommandsCount, setVoiceCommandsCount] = useState(0);

  // Settings states
  const [timeFormat24h, setTimeFormat24h] = useState(false);
  const [weekStartsMonday, setWeekStartsMonday] = useState(false);
  const [wakeWordEnabled, setWakeWordEnabled] = useState(true);
  const [summaryStyleDetailed, setSummaryStyleDetailed] = useState(false);
  const [dailyBriefingEnabled, setDailyBriefingEnabled] = useState(true);
  const [preferenceSummary, setPreferenceSummary] = useState('15 min, Snooze once');
  const [preferencesVisible, setPreferencesVisible] = useState(false);

  // Privacy Modal state
  const [privacyModalVisible, setPrivacyModalVisible] = useState(false);
  const [cloudLinkVisible, setCloudLinkVisible] = useState(false);
  const [cloudPassword, setCloudPassword] = useState('');
  const [cloudLinkError, setCloudLinkError] = useState<string | null>(null);
  const [cloudLinking, setCloudLinking] = useState(false);

  const { colors, isDarkMode, toggleTheme } = useTheme();
  const themed = useThemedStyles((c) => getProfileThemedStyles(c));

  const isGuest = userId === GUEST_USER_ID;

  useEffect(() => {
    loadStats();
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, refreshTrigger]);

  const loadSettings = () => {
    setCurrentUser(userStore.getUserById(userId));

    const is24h = userStore.get24HourFormat(userId);
    setTimeFormat24h(is24h);

    const mondayStart = userStore.getWeekStartsMonday(userId);
    setWeekStartsMonday(mondayStart);

    const preferences = preferencesStore.get(userId);
    setPreferenceSummary(
      `${preferences.reminderLeadMinutes} min, ${getSnoozePreferenceLabel(preferences)}`
    );
  };
  const handleToggleTimeFormat = (value: boolean) => {
    setTimeFormat24h(value);
    userStore.set24HourFormat(userId, value);
    onRefresh();
  };

  const handleToggleWeekStart = (value: boolean) => {
    setWeekStartsMonday(value);
    userStore.setWeekStartsMonday(userId, value);
    onRefresh();
  };

  const [ttsTesting, setTtsTesting] = useState(false);

  const handleTestTtsVoice = async () => {
    if (ttsTesting) {
      return;
    }
    setTtsTesting(true);
    try {
      const { createCallSpeechProvider } = require('../../cloud/speechService');
      const provider = createCallSpeechProvider(userId);

      Alert.alert(
        'Synthesizing…',
        'Synthesizing text to speech. Keep media volume up.'
      );
      const result = await provider.speakText('Hey! This is LAFINA. Text to speech is working.');
      if (result.source === 'gemini') {
        Alert.alert(
          'TTS Test (Gemini 3.1 Flash)',
          'Playback finished using Gemini 3.1 Flash (Aoede Voice).'
        );
      } else {
        Alert.alert(
          'TTS Test (Kokoro Fallback)',
          'Playback finished using Kokoro-82M (Offline Fallback).'
        );
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('[Profile] TTS test failed:', e);
      Alert.alert('TTS Test Error', message);
    } finally {
      setTtsTesting(false);
    }
  };

  const loadStats = () => {
    const allTasks = tasksStore.getAllTasks(userId);
    const completed = allTasks.filter((t) => t.isCompleted).length;
    setCompletedTasksCount(completed);

    const allNotes = notesStore.getAll(userId);
    setNotesCount(allNotes.length);

    const voiceNotes = allNotes.filter((n) => n.isVoiceTranscribed).length;
    const voiceTasks = allTasks.filter((t) => t.notes?.includes('voice') || t.notes?.includes('Voice')).length;
    setVoiceCommandsCount(voiceNotes + voiceTasks + 3);
  };

  const handleEditProfile = () => {
    Alert.alert('Edit Profile', 'Profile editor is not available in offline-first mode.');
  };

  const handleClearData = () => {
    Alert.alert(
      'Clear All Data',
      'This will delete all your notes, tasks, events, and calendar blocks. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: () => {
            const allNotes = notesStore.getAll(userId);
            allNotes.forEach((n) => notesStore.delete(n.id));
            const allTasks = tasksStore.getAllTasks(userId);
            allTasks.forEach((t) => tasksStore.deleteTask(t.id));
            
            Alert.alert('Data Cleared', 'All personal scheduling data has been deleted.');
            loadStats();
            onRefresh();
          },
        },
      ]
    );
  };

  const handleCreateAccount = () => {
    if (onNavigateToRegister) {
      onNavigateToRegister();
    } else {
      Alert.alert('Create Account', 'Navigate to Register from the Welcome screen to create an account.');
    }
  };

  const openCloudLink = () => {
    setCloudPassword('');
    setCloudLinkError(null);
    setCloudLinkVisible(true);
  };

  const closeCloudLink = () => {
    if (cloudLinking) {
      return;
    }
    setCloudPassword('');
    setCloudLinkError(null);
    setCloudLinkVisible(false);
  };

  const handleCloudLink = async () => {
    if (!cloudPassword) {
      setCloudLinkError('Enter the password for the FastAPI cloud account.');
      return;
    }
    setCloudLinking(true);
    setCloudLinkError(null);
    try {
      const result = await accountLinkService.createOrLinkCloudAccount(
        userId,
        cloudPassword
      );
      if (result.status === 'success') {
        await syncWorker.performSync();
        setCloudPassword('');
        setCloudLinkVisible(false);
        loadSettings();
        onRefresh();
        Alert.alert(
          'Cloud Account Linked',
          `FastAPI authentication succeeded. Live cloud role: ${result.role || 'student'}.`
        );
      } else {
        setCloudLinkError(result.message);
      }
    } catch (error: unknown) {
      setCloudLinkError(
        error instanceof Error ? error.message : 'FastAPI account linking failed.'
      );
    } finally {
      setCloudLinking(false);
    }
  };

  const handleSignOut = () => {
    const title = isGuest ? 'Dismiss Guest Session' : 'Sign Out';
    const message = isGuest
      ? 'Your temporary data will be cleared when you sign out. Create an account to keep it.'
      : 'Are you sure you want to sign out?';
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: title,
        style: 'destructive',
        onPress: async () => {
          try {
            if (!isGuest) {
              await authService.logout();
            }
          } finally {
            userStore.logout();
            if (onLogout) {
              onLogout(isGuest);
            } else {
              Alert.alert('Signed Out', 'You have been signed out. Sync pipeline suspended.');
            }
          }
        },
      },
    ]);
  };

  if (preferencesVisible) {
    return (
      <PreferencesSettingsScreen
        userId={userId}
        onBack={() => setPreferencesVisible(false)}
        onSaved={(_preferences: UserPreferences) => {
          loadSettings();
          onRefresh();
        }}
      />
    );
  }
  return (
    <ScrollView style={[styles.container, themed.container]} contentContainerStyle={styles.contentContainer}>
      {/* SVG Header Background */}
      <View style={styles.headerBackground}>
        <SvgXml xml={ARC_SCREEN_XML} width="100%" height={180} preserveAspectRatio="none" />
      </View>

      {/* Avatar Section */}
      <View style={styles.avatarSection}>
        <View style={styles.avatarWrapper}>
          <View style={[styles.avatarCircle, { backgroundColor: colors.blue }]}>
            <Text style={[styles.avatarInitials, { color: colors.white }]}>
              {getInitials(currentUser?.username)}
            </Text>
          </View>
          <TouchableOpacity onPress={handleEditProfile} style={[styles.editBadge, Shadows.card]}>
            <Pencil size={16} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <Text style={[styles.userName, themed.userName]}>
          {currentUser?.username || 'Student'}
        </Text>
        <Text style={[styles.userEmail, themed.userEmail]}>
          {currentUser?.email || 'No email set'}
        </Text>
      </View>

      {/* Main Content Area */}
      <View style={styles.mainContent}>
        {/* Stats Row */}
        <ProfileStats
          completedTasksCount={completedTasksCount}
          notesCount={notesCount}
          voiceCommandsCount={voiceCommandsCount}
        />

        {/* Settings Grouped List */}
        <View style={styles.settingsContainer}>
          {/* Preferences Group */}
          <Text style={[styles.settingsGroupHeader, themed.settingsGroupHeader]}>Preferences</Text>
          <View style={[styles.settingsGroupCard, Shadows.card, themed.settingsGroupCard]}>
            <SettingItem
              text="Scheduling & Reminder Preferences"
              type="link"
              valueText={preferenceSummary}
              onPress={() => setPreferencesVisible(true)}
            />
            <View style={[styles.settingDivider, themed.settingDivider]} />
            <SettingItem
              text="24-Hour Time Format"
              type="toggle"
              value={timeFormat24h}
              onValueChange={handleToggleTimeFormat}
            />
            <View style={[styles.settingDivider, themed.settingDivider]} />
            <SettingItem
              text="Week Starts on Monday"
              type="toggle"
              value={weekStartsMonday}
              onValueChange={handleToggleWeekStart}
            />
          </View>

          {/* AI & Voice Group */}
          <Text style={[styles.settingsGroupHeader, themed.settingsGroupHeader]}>AI & Voice</Text>
          <View style={[styles.settingsGroupCard, Shadows.card, themed.settingsGroupCard]}>
            <SettingItem
              text='Wake Word ("Hey LAFINA")'
              type="toggle"
              value={wakeWordEnabled}
              onValueChange={setWakeWordEnabled}
            />
            <View style={[styles.settingDivider, themed.settingDivider]} />
            <SettingItem
              text="Detailed AI Summaries"
              type="toggle"
              value={summaryStyleDetailed}
              onValueChange={setSummaryStyleDetailed}
            />
            <View style={[styles.settingDivider, themed.settingDivider]} />
            <SettingItem
              text={ttsTesting ? 'Testing TTS…' : 'Test TTS Voice'}
              type="clickable"
              onPress={handleTestTtsVoice}
            />
          </View>

          {/* Notifications Group */}
          <Text style={[styles.settingsGroupHeader, themed.settingsGroupHeader]}>Notifications</Text>
          <View style={[styles.settingsGroupCard, Shadows.card, themed.settingsGroupCard]}>
            <SettingItem
              text="Daily Morning Briefing"
              type="toggle"
              value={dailyBriefingEnabled}
              onValueChange={setDailyBriefingEnabled}
            />
          </View>

          {/* Appearance Group */}
          <Text style={[styles.settingsGroupHeader, themed.settingsGroupHeader]}>Appearance</Text>
          <View style={[styles.settingsGroupCard, Shadows.card, themed.settingsGroupCard]}>
            <SettingItem
              text="Dark Mode"
              type="toggle"
              value={isDarkMode}
              onValueChange={toggleTheme}
            />
          </View>

          {/* Cloud Account Group */}
          {!isGuest && (
            <>
              <Text style={[styles.settingsGroupHeader, themed.settingsGroupHeader]}>Cloud Account</Text>
              <View style={[styles.settingsGroupCard, Shadows.card, themed.settingsGroupCard]}>
                <SettingItem
                  text="Create or Link FastAPI Account"
                  type="link"
                  valueText={currentUser?.isCloudLinked ? 'Linked' : 'Offline-only'}
                  onPress={openCloudLink}
                />
              </View>
            </>
          )}

          {/* Data Management Group */}
          <Text style={[styles.settingsGroupHeader, themed.settingsGroupHeader]}>Data Settings</Text>
          <View style={[styles.settingsGroupCard, themed.settingsGroupCard]}>
            <SettingItem
              text="Clear All Data"
              type="clickable"
              onPress={handleClearData}
              isDestructive
            />
          </View>

          {/* About Group */}
          <Text style={[styles.settingsGroupHeader, themed.settingsGroupHeader]}>About</Text>
          <View style={[styles.settingsGroupCard, themed.settingsGroupCard]}>
            <SettingItem
              text="App Version"
              type="value"
              valueText="1.0.0 (Beta-Offline)"
            />
            <View style={[styles.settingDivider, themed.settingDivider]} />
            <SettingItem
              text="Privacy Policy"
              type="link"
              onPress={() => setPrivacyModalVisible(true)}
            />
          </View>
        </View>

        {/* Guest Call-to-Action / Sign Out */}
        {isGuest ? (
          <View style={[styles.guestPromptCard, Shadows.card, themed.settingsGroupCard]}>
            <Text style={[styles.guestPromptTitle, themed.settingText]}>Go Full Access</Text>
            <Text style={[styles.guestPromptBody, themed.settingValue]}>
              Create an account to save your data across devices and unlock all features.
            </Text>
            <TouchableOpacity onPress={handleCreateAccount} style={styles.createAccountBtn}>
              <Text style={styles.createAccountBtnText}>Create Account</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSignOut} style={styles.signOutLink}>
              <Text style={styles.signOutLinkText}>Dismiss Guest & Sign Out</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={{ height: 120 }} />

      {/* Privacy Policy Modal [Fix #1] */}
      <PrivacyModal
        visible={privacyModalVisible}
        onClose={() => setPrivacyModalVisible(false)}
      />

      <Modal
        visible={cloudLinkVisible}
        transparent
        animationType="fade"
        onRequestClose={closeCloudLink}
      >
        <View style={styles.cloudModalOverlay}>
          <View style={[styles.cloudModalCard, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.cloudModalTitle, { color: colors.textPrimary }]}>
              Create or Link FastAPI
            </Text>
            <Text style={[styles.cloudModalBody, { color: colors.textSecondary }]}>
              Email being linked: {currentUser?.email ? normalizeEmail(currentUser.email) : ''}
            </Text>
            <Text style={[styles.cloudModalBody, { color: colors.textSecondary }]}>
              Enter the password for the existing FastAPI account. If no cloud account exists,
              this explicit action creates one. Your local password and local data are unchanged.
            </Text>
            <TextInput
              value={cloudPassword}
              onChangeText={setCloudPassword}
              placeholder="FastAPI cloud password"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!cloudLinking}
              style={[
                styles.cloudPasswordInput,
                {
                  color: colors.textPrimary,
                  backgroundColor: colors.inputBg,
                  borderColor: colors.border,
                },
              ]}
            />
            {cloudLinkError && (
              <Text style={styles.cloudLinkError}>{cloudLinkError}</Text>
            )}
            <View style={styles.cloudModalActions}>
              <TouchableOpacity
                onPress={closeCloudLink}
                disabled={cloudLinking}
                style={[styles.cloudModalButton, styles.cloudModalCancel]}
              >
                <Text style={{ color: colors.textPrimary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCloudLink}
                disabled={cloudLinking}
                style={[styles.cloudModalButton, styles.cloudModalConfirm]}
              >
                {cloudLinking
                  ? <ActivityIndicator color={colors.white} />
                  : <Text style={styles.cloudModalConfirmText}>Continue</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const getProfileThemedStyles = (colors: ThemeColors) => ({
  container: { backgroundColor: colors.background },
  headerTitle: { color: colors.textPrimary },
  userName: { color: colors.textPrimary },
  userEmail: { color: colors.textSecondary },
  settingsGroupHeader: { color: colors.textSecondary },
  settingsGroupCard: { backgroundColor: colors.cardBg },
  settingText: { color: colors.textPrimary },
  settingValue: { color: colors.textSecondary },
  settingDivider: { backgroundColor: colors.divider },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 24,
  },
  headerBackground: {
    width: '100%',
    height: 180,
    overflow: 'hidden',
  },
  avatarSection: {
    alignItems: 'center',
    marginTop: -80,
    marginBottom: 24,
  },
  avatarWrapper: {
    position: 'relative',
    width: 120,
    height: 120,
    marginBottom: 12,
  },
  avatarCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.card,
  },
  avatarInitials: {
    fontSize: 40,
    fontFamily: Fonts.heading,
    fontWeight: 'bold',
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#F0F0F0',
  },
  mainContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  userName: {
    fontSize: 18,
    fontFamily: Fonts.heading,
    fontWeight: 'bold',
  },
  userEmail: {
    fontSize: 12,
    fontFamily: Fonts.body,
    marginTop: 4,
  },
  settingsContainer: {
    marginBottom: 24,
  },
  settingsGroupHeader: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  settingsGroupCard: {
    borderRadius: Layout.borderRadiusCard,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  settingDivider: {
    height: 1,
  },
  guestPromptCard: {
    borderRadius: Layout.borderRadiusCard,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  guestPromptTitle: {
    fontFamily: Fonts.heading,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  guestPromptBody: {
    fontFamily: Fonts.body,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  createAccountBtn: {
    width: '100%',
    height: 44,
    backgroundColor: Colors.blue,
    borderRadius: Layout.borderRadiusButton,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  createAccountBtnText: {
    fontFamily: Fonts.body,
    color: Colors.textLight,
    fontWeight: 'bold',
    fontSize: 14,
  },
  signOutLink: {
    paddingVertical: 8,
  },
  signOutLinkText: {
    fontFamily: Fonts.body,
    color: Colors.textMuted,
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  signOutBtn: {
    width: '100%',
    height: 48,
    borderRadius: Layout.borderRadiusButton,
    borderWidth: 1.5,
    borderColor: Colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  signOutText: {
    color: Colors.red,
    fontWeight: 'bold',
    fontSize: 14,
    fontFamily: Fonts.body,
  },
  cloudModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    padding: 24,
  },
  cloudModalCard: {
    borderRadius: Layout.borderRadiusCard,
    padding: 20,
  },
  cloudModalTitle: {
    fontFamily: Fonts.heading,
    fontSize: 19,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  cloudModalBody: {
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  cloudPasswordInput: {
    borderWidth: 1,
    borderRadius: Layout.borderRadiusButton,
    paddingHorizontal: 12,
    minHeight: 46,
    marginTop: 4,
  },
  cloudLinkError: {
    color: Colors.error,
    fontFamily: Fonts.body,
    fontSize: 12,
    marginTop: 8,
  },
  cloudModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 18,
  },
  cloudModalButton: {
    minWidth: 92,
    minHeight: 42,
    borderRadius: Layout.borderRadiusButton,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  cloudModalCancel: {
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cloudModalConfirm: {
    backgroundColor: Colors.blue,
  },
  cloudModalConfirmText: {
    color: Colors.textLight,
    fontWeight: 'bold',
  },
});
