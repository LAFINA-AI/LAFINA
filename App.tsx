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
  DeviceEventEmitter,
  NativeModules,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Colors } from './src/ui/theme';
import { initDatabase, db, userStore } from './src/storage';
import { CustomTabBar, TabType } from './src/ui/components/CustomTabBar';
import { VoiceModal } from './src/ui/components/VoiceModal';
import { ThemeProvider, useTheme } from './src/ui/contexts/ThemeContext';
import { SPLASH_DELAY_MS, DEFAULT_USER_ID } from './src/constants';
import { startSchedulerDaemon, stopSchedulerDaemon } from './src/scheduler';


// Screens
import { ChatScreen } from './src/ui/screens/ChatScreen';
import { CalendarScreen, ViewMode } from './src/ui/screens/calendar';
import { NotesScreen } from './src/ui/screens/notes';
import { ProfileScreen } from './src/ui/screens/ProfileScreen';
import { WelcomeScreen } from './src/ui/screens/WelcomeScreen';
import { LoginScreen } from './src/ui/screens/LoginScreen';
import { RegisterScreen } from './src/ui/screens/RegisterScreen';
import { OnboardingScreen } from './src/ui/screens/OnboardingScreen';
import { IncomingCallScreen } from './src/ui/screens';

// Assets
const lafinaDefaultLogo = require('./src/assets/lafina_default_logo.png');
const spashIcon = require('./src/assets/spash_icon.png');

function AppContent({
  userId,
  setUserId,
}: {
  userId: string | null;
  setUserId: React.Dispatch<React.SetStateAction<string | null>>;
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [authScreen, setAuthScreen] = useState<'welcome' | 'login' | 'register'>('welcome');
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('calendar');
  const [voiceVisible, setVoiceVisible] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [callVisible, setCallVisible] = useState(false);
  const [callReminderId, setCallReminderId] = useState('');
  const [callTask, setCallTask] = useState('');
  const [calendarViewMode, setCalendarViewMode] = useState<ViewMode>('week');

  const { colors } = useTheme();
  const themed = useThemedStyles();

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => setIsKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => setIsKeyboardVisible(false));
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  // Control scheduler daemon and background service
  useEffect(() => {
    if (userId) {
      startSchedulerDaemon(userId);

      const reminderModule = NativeModules.LafinaReminder;
      if (reminderModule && reminderModule.startService) {
        reminderModule.startService().catch((err: unknown) => {
          console.error('Failed to start LafinaReminder foreground service:', err);
        });
      }
    } else {
      stopSchedulerDaemon();
      const reminderModule = NativeModules.LafinaReminder;
      if (reminderModule && reminderModule.stopService) {
        reminderModule.stopService().catch((err: unknown) => {
          console.error('Failed to stop LafinaReminder foreground service:', err);
        });
      }
    }
    return () => {
      stopSchedulerDaemon();
    };
  }, [userId]);

  // Listen for simulated call trigger events
  useEffect(() => {
    const triggerSub = DeviceEventEmitter.addListener('LAFINA_CALL_TRIGGER', (event) => {
      console.log('[App] Received LAFINA_CALL_TRIGGER:', event);
      setCallReminderId(event.reminderId);
      setCallTask(event.task);
      setCallVisible(true);
    });

    return () => {
      triggerSub.remove();
    };
  }, []);

  useEffect(() => {
    const setupApp = async () => {
      try {
        // 1. Initialize SQLite Database
        await initDatabase();

        // 2. Check for active session
        const currentUser = userStore.getCurrentUser();
        if (currentUser) {
          setUserId(currentUser.id);
          setIsOnboarding(currentUser.isNewUser);
        }

        // Simulate a minor visual delay for the premium splash screen display
        setTimeout(() => {
          setIsLoading(false);
        }, SPLASH_DELAY_MS);
      } catch (error) {
        console.error('Failed application startup setup:', error);
        setIsLoading(false);
      }
    };
    setupApp();
  }, [setUserId]);

  const triggerRefresh = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleVoiceClose = (didUpdate?: boolean) => {
    setVoiceVisible(false);
    if (didUpdate) {
      triggerRefresh();
    }
  };

  const handleGetStarted = (uid: string) => {
    setUserId(uid);
    const user = userStore.getUserById(uid);
    setIsOnboarding(user ? user.isNewUser : false);
  };

  const handleGuestCreateAccount = () => {
    // Clear guest session and show register screen
    userStore.logout();
    setUserId(null);
    setAuthScreen('register');
  };

  const handleLoginSuccess = (uid: string) => {
    setUserId(uid);
    const user = userStore.getUserById(uid);
    setIsOnboarding(user ? user.isNewUser : false);
  };

  const handleRegisterSuccess = (uid: string) => {
    setUserId(uid);
    setIsOnboarding(true);
  };

  const handleOnboardingComplete = () => {
    setIsOnboarding(false);
  };

  const handleLogout = (isGuestParam?: boolean) => {
    setUserId(null);
    setAuthScreen(isGuestParam ? 'welcome' : 'login');
    setIsOnboarding(false);
  };

  // Render Active Screen Component
  const renderScreen = () => {
    if (!userId) return <View style={[styles.errorScreen, themed.errorScreen]}><Text style={themed.errorText}>Access Denied</Text></View>;
    switch (activeTab) {
      case 'chat':
        return (
          <ChatScreen
            userId={userId}
            refreshTrigger={refreshTrigger}
            onRefresh={triggerRefresh}
          />
        );
      case 'calendar':
        return (
          <CalendarScreen
            userId={userId}
            refreshTrigger={refreshTrigger}
            onRefresh={triggerRefresh}
            viewMode={calendarViewMode}
            onViewModeChange={setCalendarViewMode}
          />
        );
      case 'notes':
        return (
          <NotesScreen
            userId={userId}
            refreshTrigger={refreshTrigger}
            onRefresh={triggerRefresh}
          />
        );
      case 'profile':
        return (
          <ProfileScreen
            userId={userId}
            refreshTrigger={refreshTrigger}
            onRefresh={triggerRefresh}
            onLogout={handleLogout}
            onNavigateToRegister={handleGuestCreateAccount}
          />
        );
      default:
        return <View style={[styles.errorScreen, themed.errorScreen]}><Text style={themed.errorText}>Page Not Found</Text></View>;
    }
  };

  // Render Splash Loading Screen
  if (isLoading) {
    return (
      <View style={[styles.splashContainer, themed.splashContainer]}>
        <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.background} />
        <Image source={spashIcon} style={styles.splashIconStyle} resizeMode="contain" />
        <View style={styles.splashFooter}>
          <Image source={lafinaDefaultLogo} style={styles.splashLogoStyle} resizeMode="contain" />
          <ActivityIndicator size="small" color={Colors.yellow} style={styles.loader} />
        </View>
      </View>
    );
  }

  // Render Welcome / Auth Flow
  if (!userId) {
    switch (authScreen) {
      case 'welcome':
        return (
          <WelcomeScreen
            onGetStarted={handleGetStarted}
            onNavigateToLogin={() => setAuthScreen('login')}
            onNavigateToRegister={() => setAuthScreen('register')}
          />
        );
      case 'login':
        return (
          <LoginScreen
            onLoginSuccess={handleLoginSuccess}
            onNavigateToRegister={() => setAuthScreen('register')}
          />
        );
      case 'register':
        return (
          <RegisterScreen
            onRegisterSuccess={handleRegisterSuccess}
            onNavigateToLogin={() => setAuthScreen('login')}
          />
        );
      default:
        return null;
    }
  }

  // Render Onboarding Flow
  if (isOnboarding) {
    return (
      <OnboardingScreen
        userId={userId}
        onOnboardingComplete={handleOnboardingComplete}
      />
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.safeContainer, themed.safeContainer]}>
        <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.background} />
        
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
        <VoiceModal visible={voiceVisible} userId={userId} onClose={handleVoiceClose} />

        {/* Proactive Incoming Call Screen */}
        <IncomingCallScreen
          visible={callVisible}
          reminderId={callReminderId}
          task={callTask}
          userId={userId}
          onClose={() => {
            setCallVisible(false);
            triggerRefresh();
          }}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function useThemedStyles() {
  const { colors } = useTheme();
  return {
    safeContainer: {
      backgroundColor: colors.background,
    },
    splashContainer: {
      backgroundColor: colors.background,
    },
    errorScreen: {
      backgroundColor: colors.background,
    },
    errorText: {
      color: colors.textPrimary,
    },
  };
}

function App() {
  const [userId, setUserId] = useState<string | null>(null);

  return (
    <ThemeProvider userId={userId}>
      <AppContent userId={userId} setUserId={setUserId} />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
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

