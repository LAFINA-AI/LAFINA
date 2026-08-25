import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Fonts, Layout, Shadows } from '../theme';
import { useTheme } from '../contexts/ThemeContext';
import { useThemedStyles } from '../theme/createThemedStyles';
import type { ThemeColors } from '../contexts/ThemeContext';

import {
  Calendar,
  MessageSquare,
  FileText,
  User,
  Mic,
  LayoutDashboard,
  Briefcase,
  CheckSquare,
  Mail,
} from 'lucide-react-native';

export type ShellMode = 'student' | 'manager' | 'employee';

export type TabType =
  | 'chat'
  | 'calendar'
  | 'notes'
  | 'profile'
  | 'overview'
  | 'work'
  | 'today'
  | 'inbox';

interface CustomTabBarProps {
  activeTab: TabType;
  onTabPress: (tab: TabType) => void;
  onMicPress: () => void;
  mode?: ShellMode;
}

export const CustomTabBar: React.FC<CustomTabBarProps> = ({
  activeTab,
  onTabPress,
  onMicPress,
  mode = 'student',
}) => {
  const { colors } = useTheme();
  const themed = useThemedStyles((c) => getTabThemedStyles(c));

  const renderTab = (
    tab: TabType,
    label: string,
    IconComponent: React.ComponentType<{ size: number; color: string }>
  ) => {
    const isActive = activeTab === tab;
    return (
      <TouchableOpacity
        key={tab}
        style={styles.tab}
        onPress={() => onTabPress(tab)}
        activeOpacity={0.8}
        accessible={true}
        accessibilityRole="tab"
        accessibilityLabel={`${label} tab`}
        accessibilityState={{ selected: isActive }}
      >
        <IconComponent
          size={22}
          color={isActive ? colors.red : colors.textMuted}
        />
        {isActive && (
          <Text
            style={[
              styles.label,
              themed.label,
              styles.activeLabel,
              themed.activeLabel,
            ]}
          >
            {label}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  const renderLeftTabs = () => {
    if (mode === 'manager') {
      return (
        <>
          {renderTab('overview', 'Overview', LayoutDashboard)}
          {renderTab('work', 'Work', Briefcase)}
        </>
      );
    }
    if (mode === 'employee') {
      return (
        <>
          {renderTab('today', 'Today', CheckSquare)}
          {renderTab('work', 'Work', Briefcase)}
        </>
      );
    }
    // Student / personal shell
    return (
      <>
        {renderTab('chat', 'Chat', MessageSquare)}
        {renderTab('calendar', 'Calendar', Calendar)}
      </>
    );
  };

  const renderRightTabs = () => {
    if (mode === 'manager' || mode === 'employee') {
      return (
        <>
          {renderTab('chat', 'Chat', MessageSquare)}
          {renderTab('inbox', 'Inbox', Mail)}
        </>
      );
    }
    // Student / personal shell
    return (
      <>
        {renderTab('notes', 'Notes', FileText)}
        {renderTab('profile', 'Profile', User)}
      </>
    );
  };

  return (
    <View style={styles.outerContainer} accessible={false}>
      <View
        style={[styles.container, themed.container]}
        accessibilityRole="tablist"
      >
        {renderLeftTabs()}

        {/* Central Raised Mic Button */}
        <View style={styles.micContainer}>
          <TouchableOpacity
            style={[styles.micButton, Shadows.micButton]}
            onPress={onMicPress}
            activeOpacity={0.9}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Voice Action button"
            accessibilityHint="Double tap to open speech and reminder assistant"
          >
            <View style={styles.micHighlight} />
            <Mic size={28} color={colors.white} />
          </TouchableOpacity>
        </View>

        {renderRightTabs()}
      </View>
    </View>
  );
};

const getTabThemedStyles = (colors: ThemeColors) => ({
  container: { backgroundColor: colors.cardBg, borderColor: colors.border },
  label: { color: colors.textMuted },
  activeLabel: { color: colors.red },
});

const styles = StyleSheet.create({
  outerContainer: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 36,
    height: Layout.navbarHeight,
    width: '100%',
    paddingHorizontal: 12,
    borderWidth: 1,
    ...Shadows.navbar,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    paddingVertical: 8,
  },
  label: {
    fontSize: 10,
    fontFamily: Fonts.body,
    marginTop: 4,
  },
  activeLabel: {
    fontFamily: Fonts.heading,
    fontWeight: 'bold',
  },
  micContainer: {
    width: Layout.micButtonSize + 8,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButton: {
    position: 'absolute',
    bottom: 12,
    width: Layout.micButtonSize,
    height: Layout.micButtonSize,
    borderRadius: Layout.micButtonSize / 2,
    backgroundColor: Colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micHighlight: {
    position: 'absolute',
    top: 2,
    left: 4,
    right: 4,
    height: '40%',
    borderRadius: Layout.micButtonSize / 2,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
});
