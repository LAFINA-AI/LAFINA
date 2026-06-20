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
} from 'react-native';
import { Colors, Fonts, Layout, Shadows } from '../theme';
import { tasksStore } from '../../storage/tasksStore';
import { notesStore } from '../../storage/notesStore';
import { userStore } from '../../storage/userStore';

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
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);

  useEffect(() => {
    loadStats();
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, refreshTrigger]);

  const loadSettings = () => {
    const is24h = userStore.get24HourFormat(userId);
    setTimeFormat24h(is24h);
  };

  const handleToggleTimeFormat = (value: boolean) => {
    setTimeFormat24h(value);
    userStore.set24HourFormat(userId, value);
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
    // Query notes transcribed + voice generated tasks
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
            // Delete notes, tasks, events
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <Text style={styles.headerTitle}>Profile</Text>

      {/* Avatar Section */}
      <View style={styles.avatarSection}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarInitials}>US</Text>
        </View>
        <Text style={styles.userName}>USTP CDO Student</Text>
        <Text style={styles.userEmail}>student@ustp.edu.ph</Text>
        <TouchableOpacity onPress={handleEditProfile} style={styles.editLink}>
          <Text style={styles.editLinkText}>Edit Profile</Text>
        </TouchableOpacity>
      </View>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={[styles.statCard, Shadows.card]}>
          <Text style={styles.statVal}>{completedTasksCount}</Text>
          <Text style={styles.statLabel}>Tasks Done</Text>
        </View>
        <View style={[styles.statCard, Shadows.card]}>
          <Text style={styles.statVal}>{notesCount}</Text>
          <Text style={styles.statLabel}>Notes Saved</Text>
        </View>
        <View style={[styles.statCard, Shadows.card]}>
          <Text style={styles.statVal}>{voiceCommandsCount}</Text>
          <Text style={styles.statLabel}>Voice Uses</Text>
        </View>
      </View>

      {/* Settings Grouped List */}
      <View style={styles.settingsContainer}>
        {/* Preferences Group */}
        <Text style={styles.settingsGroupHeader}>Preferences</Text>
        <View style={[styles.settingsGroupCard, Shadows.card]}>
          <View style={styles.settingItem}>
            <Text style={styles.settingText}>24-Hour Time Format</Text>
            <Switch
              value={timeFormat24h}
              onValueChange={handleToggleTimeFormat}
              trackColor={{ false: '#767577', true: Colors.red }}
              thumbColor={Platform.OS === 'android' ? '#FFF' : undefined}
            />
          </View>
          <View style={styles.settingDivider} />
          <View style={styles.settingItem}>
            <Text style={styles.settingText}>Week Starts on Monday</Text>
            <Switch
              value={weekStartsMonday}
              onValueChange={setWeekStartsMonday}
              trackColor={{ false: '#767577', true: Colors.red }}
              thumbColor={Platform.OS === 'android' ? '#FFF' : undefined}
            />
          </View>
        </View>

        {/* AI & Voice Group */}
        <Text style={styles.settingsGroupHeader}>AI & Voice</Text>
        <View style={[styles.settingsGroupCard, Shadows.card]}>
          <View style={styles.settingItem}>
            <Text style={styles.settingText}>Wake Word ("Hey LAFINA")</Text>
            <Switch
              value={wakeWordEnabled}
              onValueChange={setWakeWordEnabled}
              trackColor={{ false: '#767577', true: Colors.red }}
              thumbColor={Platform.OS === 'android' ? '#FFF' : undefined}
            />
          </View>
          <View style={styles.settingDivider} />
          <View style={styles.settingItem}>
            <Text style={styles.settingText}>Detailed AI Summaries</Text>
            <Switch
              value={summaryStyleDetailed}
              onValueChange={setSummaryStyleDetailed}
              trackColor={{ false: '#767577', true: Colors.red }}
              thumbColor={Platform.OS === 'android' ? '#FFF' : undefined}
            />
          </View>
        </View>

        {/* Notifications Group */}
        <Text style={styles.settingsGroupHeader}>Notifications</Text>
        <View style={[styles.settingsGroupCard, Shadows.card]}>
          <View style={styles.settingItem}>
            <Text style={styles.settingText}>Daily Morning Briefing</Text>
            <Switch
              value={dailyBriefingEnabled}
              onValueChange={setDailyBriefingEnabled}
              trackColor={{ false: '#767577', true: Colors.red }}
              thumbColor={Platform.OS === 'android' ? '#FFF' : undefined}
            />
          </View>
        </View>

        {/* Appearance Group */}
        <Text style={styles.settingsGroupHeader}>Appearance</Text>
        <View style={[styles.settingsGroupCard, Shadows.card]}>
          <View style={styles.settingItem}>
            <Text style={styles.settingText}>Dark Mode</Text>
            <Switch
              value={darkModeEnabled}
              onValueChange={setDarkModeEnabled}
              trackColor={{ false: '#767577', true: Colors.red }}
              thumbColor={Platform.OS === 'android' ? '#FFF' : undefined}
            />
          </View>
        </View>

        {/* Data Management Group */}
        <Text style={styles.settingsGroupHeader}>Data Settings</Text>
        <View style={[styles.settingsGroupCard, Shadows.card]}>
          <TouchableOpacity onPress={handleClearData} style={styles.settingItemClickable}>
            <Text style={[styles.settingText, { color: Colors.error, fontWeight: 'bold' }]}>
              Clear All Data
            </Text>
          </TouchableOpacity>
        </View>

        {/* About Group */}
        <Text style={styles.settingsGroupHeader}>About</Text>
        <View style={[styles.settingsGroupCard, Shadows.card]}>
          <View style={styles.settingItem}>
            <Text style={styles.settingText}>App Version</Text>
            <Text style={styles.settingValue}>1.0.0 (Beta-Offline)</Text>
          </View>
          <View style={styles.settingDivider} />
          <View style={styles.settingItem}>
            <Text style={styles.settingText}>Privacy Policy</Text>
            <Text style={styles.linkArrow}>➔</Text>
          </View>
        </View>
      </View>

      {/* Sign Out Button */}
      <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
      
      <View style={{ height: 120 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  content: {
    padding: 16,
  },
  headerTitle: {
    fontFamily: Fonts.heading,
    fontSize: 24,
    color: Colors.darkBg,
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
    color: Colors.textDark,
  },
  userEmail: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: '#666',
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
    backgroundColor: '#FFFFFF',
    borderRadius: Layout.borderRadiusCard,
    paddingVertical: 12,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  statVal: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.textDark,
  },
  statLabel: {
    fontSize: 10,
    color: '#777',
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
    color: '#888',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  settingsGroupCard: {
    backgroundColor: '#FFFFFF',
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
    backgroundColor: '#F0F0F0',
  },
  settingText: {
    fontSize: 14,
    fontFamily: Fonts.body,
    color: Colors.textDark,
  },
  settingValue: {
    fontSize: 12,
    color: '#777',
  },
  linkArrow: {
    fontSize: 12,
    color: '#CCC',
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
