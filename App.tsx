import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  View,
  Image,
  Text,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Colors } from './src/ui/theme';
import { initDatabase } from './src/storage/dbInit';
import { db } from './src/storage/database';
import { CustomTabBar, TabType } from './src/ui/components/CustomTabBar';
import { VoiceModal } from './src/ui/components/VoiceModal';

// Screens
import { ChatScreen } from './src/ui/screens/ChatScreen';
import { CalendarScreen, ViewMode } from './src/ui/screens/CalendarScreen';
import { NotesScreen } from './src/ui/screens/NotesScreen';
import { ProfileScreen } from './src/ui/screens/ProfileScreen';

// Assets
const lafinaDefaultLogo = require('./src/assets/lafina_default_logo.png');
const spashIcon = require('./src/assets/spash_icon.png');

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('calendar');
  const [voiceVisible, setVoiceVisible] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [calendarViewMode, setCalendarViewMode] = useState<ViewMode>('week');

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => setIsKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => setIsKeyboardVisible(false));
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    const setupApp = async () => {
      try {
        // 1. Initialize SQLite Database
        await initDatabase();

        // 2. Seed Mock User for Foreign Key Constraints
        db.executeSync(
          `INSERT OR IGNORE INTO users (id, username, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
          ['user1', 'USTP CDO Student', 'student@ustp.edu.ph', new Date().toISOString(), new Date().toISOString()]
        );

        // Simulate a minor visual delay for the premium splash screen display
        setTimeout(() => {
          setIsLoading(false);
        }, 2200);
      } catch (error) {
        console.error('Failed application startup setup:', error);
        setIsLoading(false);
      }
    };
    setupApp();
  }, []);

  const triggerRefresh = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleVoiceClose = (didUpdate?: boolean) => {
    setVoiceVisible(false);
    if (didUpdate) {
      triggerRefresh();
    }
  };

  // Render Active Screen Component
  const renderScreen = () => {
    switch (activeTab) {
      case 'chat':
        return (
          <ChatScreen
            userId="user1"
            refreshTrigger={refreshTrigger}
            onRefresh={triggerRefresh}
          />
        );
      case 'calendar':
        return (
          <CalendarScreen
            userId="user1"
            refreshTrigger={refreshTrigger}
            onRefresh={triggerRefresh}
            viewMode={calendarViewMode}
            onViewModeChange={setCalendarViewMode}
          />
        );
      case 'notes':
        return (
          <NotesScreen
            userId="user1"
            refreshTrigger={refreshTrigger}
            onRefresh={triggerRefresh}
          />
        );
      case 'profile':
        return (
          <ProfileScreen
            userId="user1"
            refreshTrigger={refreshTrigger}
            onRefresh={triggerRefresh}
          />
        );
      default:
        return <View style={styles.errorScreen}><Text>Page Not Found</Text></View>;
    }
  };

  // Render Splash Loading Screen
  if (isLoading) {
    return (
      <View style={styles.splashContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <Image source={spashIcon} style={styles.splashIconStyle} resizeMode="contain" />
        <View style={styles.splashFooter}>
          <Image source={lafinaDefaultLogo} style={styles.splashLogoStyle} resizeMode="contain" />
          <ActivityIndicator size="small" color={Colors.yellow} style={styles.loader} />
        </View>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#FAF9F6" />
        
        {/* Render Active Page Content */}
        <View style={styles.content}>{renderScreen()}</View>

        {/* Floating Custom Bottom Tab Bar */}
        {!isKeyboardVisible && (
          <CustomTabBar
            activeTab={activeTab}
            onTabPress={setActiveTab}
            onMicPress={() => setVoiceVisible(true)}
          />
        )}

        {/* Voice Assistant Modal */}
        <VoiceModal visible={voiceVisible} onClose={handleVoiceClose} />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  content: {
    flex: 1,
  },
  errorScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // Splash Screen Sizing & Styling
  splashContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashIconStyle: {
    width: 140,
    height: 140,
    marginBottom: 40,
  },
  splashFooter: {
    position: 'absolute',
    bottom: 60,
    alignItems: 'center',
  },
  splashLogoStyle: {
    width: 120,
    height: 48,
    marginBottom: 16,
  },
  loader: {
    marginTop: 8,
  },
});

export default App;
