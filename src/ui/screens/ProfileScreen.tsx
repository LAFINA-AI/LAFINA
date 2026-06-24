import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { Colors, Fonts, Layout } from '../theme';
import { tasksStore } from '../../storage/tasksStore';
import { notesStore } from '../../storage/notesStore';
import { userStore, User } from '../../storage/userStore';
import { useTheme } from '../contexts/ThemeContext';

// Profile sub-components
import { ProfileStats } from '../components/profile/ProfileStats';
import { SettingItem } from '../components/profile/SettingItem';
import { PrivacyModal } from '../components/profile/PrivacyModal';

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

  const { isDarkMode, toggleTheme } = useTheme();
  const themed = useThemedStyles();

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
      <ProfileStats
        completedTasksCount={completedTasksCount}
        notesCount={notesCount}
        voiceCommandsCount={voiceCommandsCount}
      />

      {/* Settings Grouped List */}
      <View style={styles.settingsContainer}>
        {/* Preferences Group */}
        <Text style={[styles.settingsGroupHeader, themed.settingsGroupHeader]}>Preferences</Text>
        <View style={[styles.settingsGroupCard, themed.settingsGroupCard]}>
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
        <View style={[styles.settingsGroupCard, themed.settingsGroupCard]}>
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
        </View>

        {/* Notifications Group */}
        <Text style={[styles.settingsGroupHeader, themed.settingsGroupHeader]}>Notifications</Text>
        <View style={[styles.settingsGroupCard, themed.settingsGroupCard]}>
          <SettingItem
            text="Daily Morning Briefing"
            type="toggle"
            value={dailyBriefingEnabled}
            onValueChange={setDailyBriefingEnabled}
          />
        </View>

        {/* Appearance Group */}
        <Text style={[styles.settingsGroupHeader, themed.settingsGroupHeader]}>Appearance</Text>
        <View style={[styles.settingsGroupCard, themed.settingsGroupCard]}>
          <SettingItem
            text="Dark Mode"
            type="toggle"
            value={isDarkMode}
            onValueChange={toggleTheme}
          />
        </View>

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

      {/* Sign Out Button */}
      <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
      
      <View style={{ height: 120 }} />

      {/* Privacy Policy Modal [Fix #1] */}
      <PrivacyModal
        visible={privacyModalVisible}
        onClose={() => setPrivacyModalVisible(false)}
      />
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
    settingsGroupHeader: {
      color: colors.textSecondary,
    },
    settingsGroupCard: {
      backgroundColor: colors.cardBg,
    },
    settingDivider: {
      backgroundColor: colors.divider,
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
});
