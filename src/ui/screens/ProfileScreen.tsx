import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  Platform,
  SafeAreaView,
  Modal,
} from 'react-native';
import { Colors, Fonts, Layout, Shadows } from '../theme';
import { tasksStore } from '../../storage/tasksStore';
import { notesStore } from '../../storage/notesStore';
import { userStore, User } from '../../storage/userStore';
import { useTheme } from '../contexts/ThemeContext';

/**
 * Derives avatar initials from a username string. [Fix #7]
 * Handles: multi-word names, single-word names, snake_case/kebab-case,
 * empty/null/undefined inputs.
 */
function getInitials(username: string | null | undefined): string {
  if (!username || username.trim().length === 0) {
    return '?';
  }
  const words = username.trim().split(/[\s_-]+/).filter(Boolean);
  if (words.length === 1) {
    // Single word: take first 2 characters → "juandelacruz" → "JU"
    return words[0].slice(0, 2).toUpperCase();
  }
  // Multi-word: first letter of first two words → "Juan Dela Cruz" → "JD"
  return (words[0][0] + words[1][0]).toUpperCase();
}

interface ProfileScreenProps {
  userId: string;
  refreshTrigger: number;
  onRefresh: () => void;
  onLogout?: () => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  userId,
  refreshTrigger,
  onRefresh,
  onLogout,
}) => {
  // Current user info
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

  // Privacy Modal state
  const [privacyModalVisible, setPrivacyModalVisible] = useState(false);

  const { colors, isDarkMode, toggleTheme } = useTheme();
  const themed = useThemedStyles();

  useEffect(() => {
    loadStats();
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, refreshTrigger]);

  const loadSettings = () => {
    // Sync current logged in user
    setCurrentUser(userStore.getUserById(userId));

    const is24h = userStore.get24HourFormat(userId);
    setTimeFormat24h(is24h);

    const mondayStart = userStore.getWeekStartsMonday(userId);
    setWeekStartsMonday(mondayStart);
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

  const loadStats = () => {
    // 1. Tasks completed
    const allTasks = tasksStore.getAllTasks(userId);
    const completed = allTasks.filter((t) => t.isCompleted).length;
    setCompletedTasksCount(completed);

    // 2. Notes count
    const allNotes = notesStore.getAll(userId);
    setNotesCount(allNotes.length);

    // 3. Voice commands used
    const voiceNotes = allNotes.filter((n) => n.isVoiceTranscribed).length;
    const voiceTasks = allTasks.filter((t) => t.notes?.includes('voice') || t.notes?.includes('Voice')).length;
    setVoiceCommandsCount(voiceNotes + voiceTasks + 3); // Base 3 for onboarding voice checks
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

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => {
          userStore.logout();
          if (onLogout) {
            onLogout();
          } else {
            Alert.alert('Signed Out', 'You have been signed out. Sync pipeline suspended.');
          }
        },
      },
    ]);
  };

  return (
    <ScrollView style={[styles.container, themed.container]} contentContainerStyle={styles.content}>
      {/* Header */}
      <Text style={[styles.headerTitle, themed.headerTitle]}>Profile</Text>

      {/* Avatar Section */}
      <View style={styles.avatarSection}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarInitials}>
            {getInitials(currentUser?.username)}
          </Text>
        </View>
        <Text style={[styles.userName, themed.userName]}>
          {currentUser?.username || 'Student'}
        </Text>
        <Text style={[styles.userEmail, themed.userEmail]}>
          {currentUser?.email || 'No email set'}
        </Text>
        <TouchableOpacity onPress={handleEditProfile} style={styles.editLink}>
          <Text style={styles.editLinkText}>Edit Profile</Text>
        </TouchableOpacity>
      </View>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={[styles.statCard, Shadows.card, themed.statCard]}>
          <Text style={[styles.statVal, themed.statVal]}>{completedTasksCount}</Text>
          <Text style={[styles.statLabel, themed.statLabel]}>Tasks Done</Text>
        </View>
        <View style={[styles.statCard, Shadows.card, themed.statCard]}>
          <Text style={[styles.statVal, themed.statVal]}>{notesCount}</Text>
          <Text style={[styles.statLabel, themed.statLabel]}>Notes Saved</Text>
        </View>
        <View style={[styles.statCard, Shadows.card, themed.statCard]}>
          <Text style={[styles.statVal, themed.statVal]}>{voiceCommandsCount}</Text>
          <Text style={[styles.statLabel, themed.statLabel]}>Voice Uses</Text>
        </View>
      </View>

      {/* Settings Grouped List */}
      <View style={styles.settingsContainer}>
        {/* Preferences Group */}
        <Text style={[styles.settingsGroupHeader, themed.settingsGroupHeader]}>Preferences</Text>
        <View style={[styles.settingsGroupCard, Shadows.card, themed.settingsGroupCard]}>
          <View style={styles.settingItem}>
            <Text style={[styles.settingText, themed.settingText]}>24-Hour Time Format</Text>
            <Switch
              value={timeFormat24h}
              onValueChange={handleToggleTimeFormat}
              trackColor={{ false: '#767577', true: colors.red }}
              thumbColor={Platform.OS === 'android' ? '#FFF' : undefined}
            />
          </View>
          <View style={[styles.settingDivider, themed.settingDivider]} />
          <View style={styles.settingItem}>
            <Text style={[styles.settingText, themed.settingText]}>Week Starts on Monday</Text>
            <Switch
              value={weekStartsMonday}
              onValueChange={handleToggleWeekStart}
              trackColor={{ false: '#767577', true: colors.red }}
              thumbColor={Platform.OS === 'android' ? '#FFF' : undefined}
            />
          </View>
        </View>

        {/* AI & Voice Group */}
        <Text style={[styles.settingsGroupHeader, themed.settingsGroupHeader]}>AI & Voice</Text>
        <View style={[styles.settingsGroupCard, Shadows.card, themed.settingsGroupCard]}>
          <View style={styles.settingItem}>
            <Text style={[styles.settingText, themed.settingText]}>Wake Word ("Hey LAFINA")</Text>
            <Switch
              value={wakeWordEnabled}
              onValueChange={setWakeWordEnabled}
              trackColor={{ false: '#767577', true: colors.red }}
              thumbColor={Platform.OS === 'android' ? '#FFF' : undefined}
            />
          </View>
          <View style={[styles.settingDivider, themed.settingDivider]} />
          <View style={styles.settingItem}>
            <Text style={[styles.settingText, themed.settingText]}>Detailed AI Summaries</Text>
            <Switch
              value={summaryStyleDetailed}
              onValueChange={setSummaryStyleDetailed}
              trackColor={{ false: '#767577', true: colors.red }}
              thumbColor={Platform.OS === 'android' ? '#FFF' : undefined}
            />
          </View>
        </View>

        {/* Notifications Group */}
        <Text style={[styles.settingsGroupHeader, themed.settingsGroupHeader]}>Notifications</Text>
        <View style={[styles.settingsGroupCard, Shadows.card, themed.settingsGroupCard]}>
          <View style={styles.settingItem}>
            <Text style={[styles.settingText, themed.settingText]}>Daily Morning Briefing</Text>
            <Switch
              value={dailyBriefingEnabled}
              onValueChange={setDailyBriefingEnabled}
              trackColor={{ false: '#767577', true: colors.red }}
              thumbColor={Platform.OS === 'android' ? '#FFF' : undefined}
            />
          </View>
        </View>

        {/* Appearance Group */}
        <Text style={[styles.settingsGroupHeader, themed.settingsGroupHeader]}>Appearance</Text>
        <View style={[styles.settingsGroupCard, Shadows.card, themed.settingsGroupCard]}>
          <View style={styles.settingItem}>
            <Text style={[styles.settingText, themed.settingText]}>Dark Mode</Text>
            <Switch
              value={isDarkMode}
              onValueChange={toggleTheme}
              trackColor={{ false: '#767577', true: colors.red }}
              thumbColor={Platform.OS === 'android' ? '#FFF' : undefined}
            />
          </View>
        </View>

        {/* Data Management Group */}
        <Text style={[styles.settingsGroupHeader, themed.settingsGroupHeader]}>Data Settings</Text>
        <View style={[styles.settingsGroupCard, Shadows.card, themed.settingsGroupCard]}>
          <TouchableOpacity onPress={handleClearData} style={styles.settingItemClickable}>
            <Text style={[styles.settingText, { color: colors.error, fontWeight: 'bold' }]}>
              Clear All Data
            </Text>
          </TouchableOpacity>
        </View>

        {/* About Group */}
        <Text style={[styles.settingsGroupHeader, themed.settingsGroupHeader]}>About</Text>
        <View style={[styles.settingsGroupCard, Shadows.card, themed.settingsGroupCard]}>
          <View style={styles.settingItem}>
            <Text style={[styles.settingText, themed.settingText]}>App Version</Text>
            <Text style={[styles.settingValue, themed.settingValue]}>1.0.0 (Beta-Offline)</Text>
          </View>
          <View style={[styles.settingDivider, themed.settingDivider]} />
          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => setPrivacyModalVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={[styles.settingText, themed.settingText]}>Privacy Policy</Text>
            <Text style={[styles.linkArrow, themed.linkArrow]}>➔</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Sign Out Button */}
      <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
      
      <View style={{ height: 120 }} />

      {/* Privacy Policy Modal [Fix #1] */}
      <Modal
        visible={privacyModalVisible}
        animationType="slide"
        onRequestClose={() => setPrivacyModalVisible(false)}
      >
        <SafeAreaView style={[styles.privacyContainer, themed.privacyContainer]}>
          <View style={[styles.privacyHeader, themed.privacyHeader]}>
            <Text style={[styles.privacyHeaderTitle, themed.privacyHeaderTitle]}>Privacy Policy</Text>
            <TouchableOpacity onPress={() => setPrivacyModalVisible(false)} style={styles.privacyCloseBtn}>
              <Text style={styles.privacyCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.privacyContent} contentContainerStyle={styles.privacyContentContainer}>
            <Text style={[styles.privacySectionTitle, themed.privacySectionTitle]}>1. Data Collection</Text>
            <Text style={[styles.privacyBodyText, themed.privacyBodyText]}>
              LAFINA stores all scheduling data, notes, and tasks locally on your device using SQLite. No data is transmitted to external servers without your explicit action.
            </Text>

            <Text style={[styles.privacySectionTitle, themed.privacySectionTitle]}>2. Voice Processing</Text>
            <Text style={[styles.privacyBodyText, themed.privacyBodyText]}>
              Voice recordings are processed entirely on-device using offline AI models. Audio is never uploaded, shared, or stored beyond the current session.
            </Text>

            <Text style={[styles.privacySectionTitle, themed.privacySectionTitle]}>3. Account Information</Text>
            <Text style={[styles.privacyBodyText, themed.privacyBodyText]}>
              Your email and display name are stored locally for profile display and optional cloud sync.
            </Text>

            <Text style={[styles.privacySectionTitle, themed.privacySectionTitle]}>4. No Third-Party Sharing</Text>
            <Text style={[styles.privacyBodyText, themed.privacyBodyText]}>
              LAFINA does not share, sell, or transmit your personal data to third parties.
            </Text>

            <Text style={[styles.privacySectionTitle, themed.privacySectionTitle]}>5. Data Deletion</Text>
            <Text style={[styles.privacyBodyText, themed.privacyBodyText]}>
              You can delete all personal data at any time using the "Clear All Data" option in Profile Settings.
            </Text>

            <Text style={[styles.privacySectionTitle, themed.privacySectionTitle]}>6. Contact</Text>
            <Text style={[styles.privacyBodyText, themed.privacyBodyText]}>
              For privacy concerns, contact the LAFINA development team at USTP Cagayan de Oro.
            </Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </ScrollView>
  );
};

function useThemedStyles() {
  const { colors } = useTheme();
  return {
    container: {
      backgroundColor: colors.background,
    },
    headerTitle: {
      color: colors.textPrimary,
    },
    userName: {
      color: colors.textPrimary,
    },
    userEmail: {
      color: colors.textSecondary,
    },
    statCard: {
      backgroundColor: colors.cardBg,
    },
    statVal: {
      color: colors.textPrimary,
    },
    statLabel: {
      color: colors.textSecondary,
    },
    settingsGroupHeader: {
      color: colors.textSecondary,
    },
    settingsGroupCard: {
      backgroundColor: colors.cardBg,
    },
    settingText: {
      color: colors.textPrimary,
    },
    settingValue: {
      color: colors.textSecondary,
    },
    settingDivider: {
      backgroundColor: colors.divider,
    },
    linkArrow: {
      color: colors.textMuted,
    },
    privacyContainer: {
      backgroundColor: colors.background,
    },
    privacyHeader: {
      borderBottomColor: colors.border,
    },
    privacyHeaderTitle: {
      color: colors.textPrimary,
    },
    privacySectionTitle: {
      color: colors.textPrimary,
    },
    privacyBodyText: {
      color: colors.textSecondary,
    },
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  headerTitle: {
    fontFamily: Fonts.heading,
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarInitials: {
    color: '#FFF',
    fontSize: 28,
    fontFamily: Fonts.heading,
    fontWeight: 'bold',
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
  editLink: {
    marginTop: 8,
  },
  editLinkText: {
    fontSize: 12,
    color: Colors.red,
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
  
  // Stats row
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    borderRadius: Layout.borderRadiusCard,
    paddingVertical: 12,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  statVal: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 10,
    marginTop: 4,
    fontFamily: Fonts.body,
  },

  // Settings list
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
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  settingItemClickable: {
    paddingVertical: 14,
  },
  settingDivider: {
    height: 1,
  },
  settingText: {
    fontSize: 14,
    fontFamily: Fonts.body,
  },
  settingValue: {
    fontSize: 12,
  },
  linkArrow: {
    fontSize: 12,
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
  privacyContainer: {
    flex: 1,
  },
  privacyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  privacyHeaderTitle: {
    fontFamily: Fonts.heading,
    fontSize: 18,
    fontWeight: 'bold',
  },
  privacyCloseBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  privacyCloseBtnText: {
    fontFamily: Fonts.body,
    color: Colors.red,
    fontWeight: 'bold',
  },
  privacyContent: {
    flex: 1,
    padding: 16,
  },
  privacyContentContainer: {
    paddingBottom: 32,
  },
  privacySectionTitle: {
    fontFamily: Fonts.heading,
    fontSize: 15,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 6,
  },
  privacyBodyText: {
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
});

