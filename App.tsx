import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Alert,
  PermissionsAndroid,
  AppState,
  BackHandler,
  TouchableOpacity,
  Linking,
} from 'react-native';
import type { AlertButton } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Colors, Fonts } from './src/ui/theme';
import {
  initDatabase,
  remindersStore,
  userStore,
  businessStore,
  syncOutboxStore,
  formatDuration,
} from './src/storage';
import {
  CustomTabBar,
  TabType,
  ShellMode,
  ToolTab,
  isToolTab,
} from './src/ui/components/CustomTabBar';
import {
  RadialMenu,
  RADIAL_MIC_KEY,
  buildRadialItems,
  useRadialMenu,
} from './src/ui/components/radial';
import { VoiceModal } from './src/ui/components/VoiceModal';
import { PomodoroProvider, useOptionalPomodoro } from './src/ui/contexts/PomodoroContext';
import { MeetingsProvider, useMeetingRecorderIndicator } from './src/ui/contexts/MeetingsContext';
import { hasProEntitlement } from './src/cloud';
import { ThemeProvider, useTheme } from './src/ui/contexts/ThemeContext';
import { SPLASH_DELAY_MS } from './src/constants';
import {
  consumePendingNativeCall,
  getReminderPermissionStatus,
  openExactAlarmSettings,
  openFullScreenIntentSettings,
  reconcileReminderAlarms,
} from './src/scheduler';
import type { NativeCallAction, NativeCallTrigger } from './src/scheduler';
import { syncWorker } from './src/sync/syncWorker';
import { createSyncScheduler } from './src/sync/syncScheduler';
import { businessService } from './src/cloud/businessService';
import type {
  BusinessMemberData,
  BusinessInvitationData,
} from './src/cloud/businessService';
import type { BusinessMemberRole, MembershipStatus } from './src/storage/syncTypes';

// Screens
import { ChatScreen } from './src/ui/screens/ChatScreen';
import { CalendarScreen, ViewMode } from './src/ui/screens/calendar';
import { NotesScreen } from './src/ui/screens/notes';
import { ProfileScreen } from './src/ui/screens/ProfileScreen';
import { WelcomeScreen } from './src/ui/screens/WelcomeScreen';
import { LoginScreen } from './src/ui/screens/LoginScreen';
import { RegisterScreen } from './src/ui/screens/RegisterScreen';
import { OnboardingScreen } from './src/ui/screens/OnboardingScreen';
import {
  IncomingCallScreen,
  ManagerOverviewScreen,
  EmployeeTodayScreen,
  WorkScreen,
  TeamManagementModal,
  GmailInboxScreen,
} from './src/ui/screens';
import { CompanyChatScreen } from './src/ui/screens/business/CompanyChatScreen';
import { PomodoroScreen } from './src/ui/screens/pomodoro';
import { FlashcardsScreen } from './src/ui/screens/flashcards';
import { StudyNotesScreen } from './src/ui/screens/studynotes';
import { MeetingsScreen } from './src/ui/screens/meetings';
import type { ToolBackHandler } from './src/ui/components/tools';

// Assets
const lafinaDefaultLogo = require('./src/assets/lafina_default_logo.png');
const spashIcon = require('./src/assets/spash_icon.png');

/** Tools each shell can open from the Mic's radial menu. */
const TOOLS_BY_SHELL: Record<ShellMode, ToolTab[]> = {
  student: ['pomodoro', 'flashcards', 'studynotes', 'meetings'],
  manager: ['pomodoro'],
  employee: ['pomodoro'],
};

const homeTabFor = (mode: ShellMode): TabType =>
  mode === 'manager' ? 'overview' : mode === 'employee' ? 'today' : 'calendar';

/**
 * The tab bar, with a meeting being recorded, or else a running Pomodoro's
 * time, on the Mic. A recording comes first: the microphone is in use.
 */
const TimerAwareTabBar: React.FC<React.ComponentProps<typeof CustomTabBar>> = (props) => {
  const pomodoro = useOptionalPomodoro();
  const recording = useMeetingRecorderIndicator();
  const badge =
    recording && props.activeTab !== 'meetings'
      ? `REC ${formatDuration(recording.elapsedMs)}`
      : pomodoro && pomodoro.runtime.isRunning && props.activeTab !== 'pomodoro'
        ? formatDuration(pomodoro.remainingMs)
        : null;
  return <CustomTabBar {...props} micBadge={badge} />;
};

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
  const [shellMode, setShellMode] = useState<ShellMode>('student');
  const [activeTab, setActiveTab] = useState<TabType>('calendar');
  const [voiceVisible, setVoiceVisible] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [callVisible, setCallVisible] = useState(false);
  const [callReminderId, setCallReminderId] = useState('');
  const [callTask, setCallTask] = useState('');
  const [callAction, setCallAction] = useState<NativeCallAction>('call');
  const [calendarViewMode, setCalendarViewMode] = useState<ViewMode>('week');
  const [teamModalVisible, setTeamModalVisible] = useState(false);
  const [businessName, setBusinessName] = useState('My Business');
  const [activeSeats] = useState(1);
  const [seatLimit] = useState(5);
  const [members, setMembers] = useState<BusinessMemberData[]>([]);
  const [invitations, setInvitations] = useState<BusinessInvitationData[]>([]);
  const [isLeaseActive, setIsLeaseActive] = useState(true);
  const [chatViewMode, setChatViewMode] = useState<'company' | 'assistant'>('company');
  /** Bumped when a sync pass brought in changes made on another device. */
  const [syncRevision, setSyncRevision] = useState(0);
  /** The tab a radial-menu tool was opened from, for Back. */
  const returnTabRef = useRef<TabType | null>(null);
  /** The open tool's own Back step, such as leaving a deck for the deck list. */
  const toolBackRef = useRef<ToolBackHandler | null>(null);
  const registerToolBack = useCallback((handler: ToolBackHandler | null) => {
    toolBackRef.current = handler;
  }, []);
  const splashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { colors } = useTheme();
  const themed = useThemedStyles();

  const applyCapabilityState = (uid: string, forceResetTab = false) => {
    const cached = businessStore.getCachedCapabilities(uid);
    const leaseActive = businessStore.isBusinessLeaseActive(uid);
    setIsLeaseActive(leaseActive);

    const targetMode: ShellMode =
      cached && cached.effectivePlan === 'business' && cached.memberRole
        ? cached.memberRole
        : 'student';

    setShellMode(targetMode);
    if (targetMode !== 'student') {
      setBusinessName(cached?.businessName || 'Business Workspace');
    }

    if (forceResetTab) {
      if (targetMode === 'manager') {
        setActiveTab('overview');
      } else if (targetMode === 'employee') {
        setActiveTab('today');
      } else {
        setActiveTab('calendar');
      }
    } else {
      setActiveTab((prevTab) => {
        // Tools opened from the radial menu stay valid across refreshes.
        const validStudentTabs: TabType[] = ['chat', 'calendar', 'notes', 'profile', ...TOOLS_BY_SHELL.student];
        const validManagerTabs: TabType[] = ['overview', 'work', 'chat', 'inbox', 'profile', ...TOOLS_BY_SHELL.manager];
        const validEmployeeTabs: TabType[] = ['today', 'work', 'chat', 'inbox', 'profile', ...TOOLS_BY_SHELL.employee];

        const isValid =
          targetMode === 'manager'
            ? validManagerTabs.includes(prevTab)
            : targetMode === 'employee'
            ? validEmployeeTabs.includes(prevTab)
            : validStudentTabs.includes(prevTab);

        if (isValid) {
          return prevTab;
        }

        if (targetMode === 'manager') return 'overview';
        if (targetMode === 'employee') return 'today';
        return 'calendar';
      });
    }
  };

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => setIsKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => setIsKeyboardVisible(false));
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  // Reconcile exact alarms and consume a call that launched a cold app process.
  useEffect(() => {
    if (!userId) return;

    applyCapabilityState(userId);

    void reconcileReminderAlarms(remindersStore.getPendingReminders(userId));
    void (async (): Promise<void> => {
      let status = await getReminderPermissionStatus();
      if (status && !status.notificationsEnabled) {
        await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
        );
        status = await getReminderPermissionStatus();
      }
      if (!status || (status.canScheduleExactAlarms && status.canUseFullScreenIntent)) {
        return;
      }

      const buttons: AlertButton[] = [{ text: 'Later', style: 'cancel' }];
      if (!status.canScheduleExactAlarms) {
        buttons.push({
          text: 'Alarm access',
          onPress: () => void openExactAlarmSettings(),
        });
      }
      if (!status.canUseFullScreenIntent) {
        buttons.push({
          text: 'Full-screen access',
          onPress: () => void openFullScreenIntentSettings(),
        });
      }
      Alert.alert(
        'Enable reminder calls',
        'LAFINA needs Android alarm and full-screen access to ring reliably while the app is closed.',
        buttons
      );
    })().catch((error: unknown) => {
      console.error('[App] Failed to prepare reminder permissions:', error);
    });
    void consumePendingNativeCall().then((payload) => {
      if (!payload) return;
      const reminder = remindersStore.getReminderById(payload.reminderId);
      if (!reminder || reminder.userId !== userId) return;
      if (splashTimeoutRef.current) {
        clearTimeout(splashTimeoutRef.current);
        splashTimeoutRef.current = null;
      }
      setIsLoading(false);
      setCallReminderId(reminder.id);
      setCallTask(payload.task || reminder.task);
      setCallAction(payload.action);
      setCallVisible(true);
    });
  }, [userId]);

  // Listen for both foreground scheduler events and native alarm/activity intents.
  useEffect(() => {
    const showCall = (event: NativeCallTrigger): void => {
      const reminder = remindersStore.getReminderById(event.reminderId);
      if (!reminder || (userId && reminder.userId !== userId)) return;
      setCallReminderId(reminder.id);
      setCallTask(event.task || reminder.task);
      setCallAction(event.action);
      setCallVisible(true);
    };

    const foregroundSubscription = DeviceEventEmitter.addListener(
      'LAFINA_CALL_TRIGGER',
      (event: { reminderId: string; task: string }) =>
        showCall({ ...event, action: 'call' })
    );
    const nativeSubscription = DeviceEventEmitter.addListener(
      'LAFINA_NATIVE_CALL_TRIGGER',
      (event: NativeCallTrigger) => showCall(event)
    );

    return () => {
      foregroundSubscription.remove();
      nativeSubscription.remove();
    };
  }, [userId]);

  // Handle OAuth callback deep linking (lafina://email/callback)
  useEffect(() => {
    const handleDeepLink = (event: { url: string }) => {
      if (!event?.url) return;
      if (event.url.startsWith('lafina://email/callback')) {
        setRefreshTrigger((prev) => prev + 1);
        if (event.url.includes('status=success')) {
          Alert.alert('Gmail Connected', 'Your Gmail account has been linked successfully.');
        } else if (event.url.includes('status=error')) {
          Alert.alert('Connection Failed', 'Could not complete Gmail connection.');
        }
      }
    };

    const linkSub = Linking.addEventListener('url', handleDeepLink);
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    }).catch(() => {});

    return () => {
      linkSub.remove();
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
          applyCapabilityState(currentUser.id, true);
          syncWorker.performSync().then(() => {
            setRefreshTrigger((previous) => previous + 1);
            if (syncWorker.takeRemoteChangeCount() > 0) {
              setSyncRevision((previous) => previous + 1);
            }
          }).catch(() => undefined);
        }

        // Simulate a minor visual delay for the premium splash screen display
        splashTimeoutRef.current = setTimeout(() => {
          splashTimeoutRef.current = null;
          setIsLoading(false);
        }, SPLASH_DELAY_MS);
      } catch (error) {
        console.error('Failed application startup setup:', error);
        setIsLoading(false);
      }
    };
    setupApp();

    return () => {
      if (splashTimeoutRef.current) {
        clearTimeout(splashTimeoutRef.current);
        splashTimeoutRef.current = null;
      }
    };
  }, [setUserId]);

  // Sync on returning to the app, a few seconds after a local change is
  // queued, and every couple of minutes while in front — which also catches a
  // network that has come back. The background passes reload screens only
  // when something arrived from another device, so an edit in progress is
  // left alone.
  useEffect(() => {
    if (!userId) return undefined;
    const scheduler = createSyncScheduler({
      runPass: async () => {
        await syncWorker.performSync();
        return syncWorker.takeRemoteChangeCount() > 0;
      },
      onRemoteChanges: () => {
        setRefreshTrigger((previous) => previous + 1);
        setSyncRevision((previous) => previous + 1);
      },
    });
    if (AppState.currentState === 'active') scheduler.start();

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        scheduler.stop();
        return;
      }
      scheduler.start();
      syncWorker.performSync().then(() => {
        setRefreshTrigger((previous) => previous + 1);
        if (syncWorker.takeRemoteChangeCount() > 0) {
          setSyncRevision((previous) => previous + 1);
        }
      }).catch(() => undefined);
    });
    const unsubscribeOutbox = syncOutboxStore.onEnqueue((localUserId) => {
      if (localUserId === userId) scheduler.schedule();
    });

    return () => {
      appStateSubscription.remove();
      unsubscribeOutbox();
      scheduler.dispose();
    };
  }, [userId]);

  const triggerRefresh = () => {
    setRefreshTrigger((prev) => prev + 1);
    if (userId) {
      applyCapabilityState(userId);
    }
  };

  const handleVoiceClose = (didUpdate?: boolean) => {
    setVoiceVisible(false);
    if (didUpdate) {
      triggerRefresh();
    }
  };

  // ── Mic radial menu and the tools it opens ──────────────────────────────
  const hasPro = userId ? hasProEntitlement(userId) : false;
  const radialItems = useMemo(
    () => buildRadialItems(shellMode, hasPro),
    [shellMode, hasPro]
  );

  const openTool = useCallback((tool: ToolTab) => {
    setActiveTab((previous) => {
      if (!isToolTab(previous)) returnTabRef.current = previous;
      return tool;
    });
  }, []);

  const leaveTool = useCallback(() => {
    setActiveTab(returnTabRef.current ?? homeTabFor(shellMode));
  }, [shellMode]);

  const handleRadialSelect = useCallback(
    (key: string) => {
      if (key === RADIAL_MIC_KEY) {
        setVoiceVisible(true);
        return;
      }
      if (isToolTab(key as TabType)) openTool(key as ToolTab);
    },
    [openTool]
  );

  const radial = useRadialMenu(radialItems, handleRadialSelect);
  const closeRadial = radial.close;

  // The keyboard hides the tab bar, and the menu with it.
  useEffect(() => {
    if (isKeyboardVisible) closeRadial();
  }, [isKeyboardVisible, closeRadial]);

  // Hardware Back closes the menu, then lets the tool step back (a deck to the
  // deck list), then leaves the tool for the tab it came from.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (radial.open) {
        closeRadial();
        return true;
      }
      if (isToolTab(activeTab)) {
        if (toolBackRef.current?.()) return true;
        leaveTool();
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [radial.open, closeRadial, activeTab, leaveTool]);

  const handleGetStarted = (uid: string) => {
    setUserId(uid);
    const user = userStore.getUserById(uid);
    setIsOnboarding(user ? user.isNewUser : false);
    applyCapabilityState(uid, true);
  };

  const handleGuestCreateAccount = () => {
    userStore.logout();
    setUserId(null);
    setAuthScreen('register');
  };

  const handleLoginSuccess = (uid: string) => {
    setUserId(uid);
    const user = userStore.getUserById(uid);
    setIsOnboarding(user ? user.isNewUser : false);
    applyCapabilityState(uid, true);
  };

  const handleRegisterSuccess = (uid: string) => {
    setUserId(uid);
    setIsOnboarding(true);
    applyCapabilityState(uid, true);
  };

  const handleOnboardingComplete = () => {
    setIsOnboarding(false);
  };

  const handleLogout = (isGuestParam?: boolean) => {
    setUserId(null);
    setAuthScreen(isGuestParam ? 'welcome' : 'login');
    setIsOnboarding(false);
    setShellMode('student');
    setActiveTab('calendar');
  };

  // Team Management Handlers
  const handleInviteMember = async (email: string, role: BusinessMemberRole) => {
    if (!userId) return;
    const cached = businessStore.getCachedCapabilities(userId);
    if (!cached?.businessId) return;
    const res = await businessService.createInvitation(cached.businessId, email, role);
    if (res.status === 'success' && res.data) {
      setInvitations((prev) => [...prev, res.data!]);
    } else {
      throw new Error(res.error || 'Failed to send invitation.');
    }
  };

  const handleUpdateRole = async (targetUserId: string, role: BusinessMemberRole) => {
    if (!userId) return;
    const cached = businessStore.getCachedCapabilities(userId);
    if (!cached?.businessId) return;
    const res = await businessService.updateMemberRole(cached.businessId, targetUserId, role);
    if (res.status === 'success') {
      setMembers((prev) =>
        prev.map((m) => (m.user_id === targetUserId ? { ...m, member_role: role } : m))
      );
    } else {
      throw new Error(res.error || 'Failed to update member role.');
    }
  };

  const handleUpdateStatus = async (targetUserId: string, status: MembershipStatus) => {
    if (!userId) return;
    const cached = businessStore.getCachedCapabilities(userId);
    if (!cached?.businessId) return;
    const res = await businessService.updateMemberStatus(cached.businessId, targetUserId, status);
    if (res.status === 'success') {
      if (status === 'removed') {
        setMembers((prev) => prev.filter((m) => m.user_id !== targetUserId));
      } else {
        setMembers((prev) =>
          prev.map((m) => (m.user_id === targetUserId ? { ...m, membership_status: status } : m))
        );
      }
    } else {
      throw new Error(res.error || 'Failed to update member status.');
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    if (!userId) return;
    const cached = businessStore.getCachedCapabilities(userId);
    if (!cached?.businessId) return;
    const res = await businessService.cancelInvitation(cached.businessId, invitationId);
    if (res.status === 'success') {
      setInvitations((prev) => prev.filter((i) => i.id !== invitationId));
    } else {
      throw new Error(res.error || 'Failed to cancel invitation.');
    }
  };

  // Render Active Screen Component
  const renderScreen = () => {
    if (!userId) return <View style={[styles.errorScreen, themed.errorScreen]}><Text style={themed.errorText}>Access Denied</Text></View>;
    switch (activeTab) {
      case 'overview':
        return (
          <ManagerOverviewScreen
            businessName={businessName}
            activeSeats={activeSeats}
            seatLimit={seatLimit}
            onOpenTeamManagement={() => setTeamModalVisible(true)}
            onOpenProfile={() => setActiveTab('profile')}
            isLeaseActive={isLeaseActive}
          />
        );
      case 'today':
        return (
          <EmployeeTodayScreen
            businessName={businessName}
            onOpenProfile={() => setActiveTab('profile')}
            isLeaseActive={isLeaseActive}
          />
        );
      case 'work':
        return (
          <WorkScreen
            userId={userId}
            isManager={shellMode === 'manager'}
            onOpenProfile={() => setActiveTab('profile')}
            isLeaseActive={isLeaseActive}
          />
        );
      case 'chat':
        if (shellMode === 'manager' || shellMode === 'employee') {
          if (chatViewMode === 'company') {
            return (
              <CompanyChatScreen
                userId={userId}
                onOpenTask={() => setActiveTab('work')}
                onSwitchToAiAssistant={() => setChatViewMode('assistant')}
              />
            );
          }
          return (
            <View style={{ flex: 1 }}>
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  backgroundColor: '#EFF6FF',
                  borderBottomWidth: 1,
                  borderBottomColor: '#DBEAFE',
                }}
                onPress={() => setChatViewMode('company')}
              >
                <Text style={{ color: '#2563EB', fontFamily: Fonts.heading, fontSize: 13 }}>
                  ← Back to Company Team Chat
                </Text>
              </TouchableOpacity>
              <ChatScreen
                userId={userId}
                refreshTrigger={refreshTrigger}
                onRefresh={triggerRefresh}
              />
            </View>
          );
        }
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
      case 'inbox':
        return <GmailInboxScreen userId={userId} />;
      case 'pomodoro':
        return <PomodoroScreen onBack={leaveTool} />;
      case 'flashcards':
        return (
          <FlashcardsScreen
            userId={userId}
            refreshTrigger={refreshTrigger}
            onRefresh={triggerRefresh}
            onBack={leaveTool}
            registerBack={registerToolBack}
          />
        );
      case 'studynotes':
        return (
          <StudyNotesScreen
            userId={userId}
            refreshTrigger={refreshTrigger}
            onRefresh={triggerRefresh}
            onBack={leaveTool}
            registerBack={registerToolBack}
          />
        );
      case 'meetings':
        return <MeetingsScreen onBack={leaveTool} registerBack={registerToolBack} onNotesSaved={triggerRefresh} />;
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

  const cachedBiz = businessStore.getCachedCapabilities(userId);

  return (
    <SafeAreaProvider>
      {/* Above the screens, so the timer keeps running on every tab. */}
      <PomodoroProvider userId={userId} syncRevision={syncRevision}>
      <MeetingsProvider userId={userId} syncRevision={syncRevision}>
      <SafeAreaView style={[styles.safeContainer, themed.safeContainer]}>
        <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.background} />

        {/* Render Active Page Content */}
        <View style={styles.content}>{renderScreen()}</View>

        {/* Floating Custom Bottom Tab Bar; hold the Mic for the radial menu */}
        {!isKeyboardVisible && (
          <TimerAwareTabBar
            activeTab={activeTab}
            onTabPress={setActiveTab}
            onMicPress={() => setVoiceVisible(true)}
            mode={shellMode}
            onMicLongPress={radial.openMenu}
            onMicDrag={radial.drag}
            onMicRelease={radial.release}
          />
        )}

        <RadialMenu
          visible={radial.open}
          items={radialItems}
          layout={radial.layout}
          highlightedIndex={radial.highlighted}
          onSelect={radial.select}
          onDismiss={radial.close}
        />

        {/* Voice Assistant Modal */}
        <VoiceModal visible={voiceVisible} userId={userId} onClose={handleVoiceClose} />

        {/* Proactive Incoming Call Screen */}
        <IncomingCallScreen
          visible={callVisible}
          reminderId={callReminderId}
          task={callTask}
          userId={userId}
          initialAction={callAction}
          onClose={() => {
            setCallVisible(false);
            triggerRefresh();
          }}
        />

        {/* Team Management Modal for Managers */}
        <TeamManagementModal
          visible={teamModalVisible}
          onClose={() => setTeamModalVisible(false)}
          businessId={cachedBiz?.businessId || ''}
          isOwner={shellMode === 'manager'}
          activeSeats={activeSeats}
          seatLimit={seatLimit}
          members={members}
          invitations={invitations}
          onInviteMember={handleInviteMember}
          onUpdateRole={handleUpdateRole}
          onUpdateStatus={handleUpdateStatus}
          onCancelInvitation={handleCancelInvitation}
        />
      </SafeAreaView>
      </MeetingsProvider>
      </PomodoroProvider>
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
    text: {
      color: colors.textPrimary,
    },
    mutedText: {
      color: colors.textMuted,
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
    padding: 24,
  },
  placeholderTitle: {
    fontSize: 20,
    fontFamily: Fonts.heading,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  placeholderSubtitle: {
    fontSize: 14,
    fontFamily: Fonts.body,
    textAlign: 'center',
    lineHeight: 20,
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
