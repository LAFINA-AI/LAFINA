import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Fonts, Layout, Shadows } from '../theme';
import { useTheme } from '../contexts/ThemeContext';
import { useThemedStyles } from '../theme/createThemedStyles';
import type { ThemeColors } from '../contexts/ThemeContext';

import { Calendar, MessageSquare, FileText, User, Mic } from 'lucide-react-native';

export type TabType = 'chat' | 'calendar' | 'notes' | 'profile';

interface CustomTabBarProps {
  activeTab: TabType;
  onTabPress: (tab: TabType) => void;
  onMicPress: () => void;
}

export const CustomTabBar: React.FC<CustomTabBarProps> = ({
  activeTab,
  onTabPress,
  onMicPress,
}) => {
  const { colors } = useTheme();
  const themed = useThemedStyles((c) => getTabThemedStyles(c));

  return (
    <View style={styles.outerContainer}>
      <View style={[styles.container, themed.container]}>
        {/* Chat Tab */}
        <TouchableOpacity
          style={styles.tab}
          onPress={() => onTabPress('chat')}
          activeOpacity={0.8}
        >
          <MessageSquare size={22} color={activeTab === 'chat' ? colors.red : colors.textMuted} />
          {activeTab === 'chat' && (
            <Text style={[styles.label, themed.label, styles.activeLabel, themed.activeLabel]}>Chat</Text>
          )}
        </TouchableOpacity>

        {/* Calendar Tab */}
        <TouchableOpacity
          style={styles.tab}
          onPress={() => onTabPress('calendar')}
          activeOpacity={0.8}
        >
          <Calendar size={22} color={activeTab === 'calendar' ? colors.red : colors.textMuted} />
          {activeTab === 'calendar' && (
            <Text style={[styles.label, themed.label, styles.activeLabel, themed.activeLabel]}>Calendar</Text>
          )}
        </TouchableOpacity>

        {/* Central Raised Mic Button */}
        <View style={styles.micContainer}>
          <TouchableOpacity
            style={[styles.micButton, Shadows.micButton]}
            onPress={onMicPress}
            activeOpacity={0.9}
          >
            {/* Glossy gradient highlight overlay */}
            <View style={styles.micHighlight} />
            <Mic size={28} color={colors.white} />
          </TouchableOpacity>
        </View>

        {/* Notes Tab */}
        <TouchableOpacity
          style={styles.tab}
          onPress={() => onTabPress('notes')}
          activeOpacity={0.8}
        >
          <FileText size={22} color={activeTab === 'notes' ? colors.red : colors.textMuted} />
          {activeTab === 'notes' && (
            <Text style={[styles.label, themed.label, styles.activeLabel, themed.activeLabel]}>Notes</Text>
          )}
        </TouchableOpacity>

        {/* Profile Tab */}
        <TouchableOpacity
          style={styles.tab}
          onPress={() => onTabPress('profile')}
          activeOpacity={0.8}
        >
          <User size={22} color={activeTab === 'profile' ? colors.red : colors.textMuted} />
          {activeTab === 'profile' && (
            <Text style={[styles.label, themed.label, styles.activeLabel, themed.activeLabel]}>Profile</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const getTabThemedStyles = (colors: ThemeColors) => ({
  container: { backgroundColor: colors.cardBg, borderColor: colors.border },
  label: { color: colors.textMuted },
  activeLabel: { color: colors.red },
});

// --- Stylesheet ---

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
  
  // Mic Button Styles
  micContainer: {
    width: Layout.micButtonSize + 8,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButton: {
    position: 'absolute',
    bottom: 12, // Raised above the navbar
    width: Layout.micButtonSize,
    height: Layout.micButtonSize,
    borderRadius: Layout.micButtonSize / 2,
    backgroundColor: Colors.blue, // Deep Magenta-indigo base
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
    backgroundColor: 'rgba(255, 255, 255, 0.15)', // Glassmorphic gloss effect
  },
  iconContainer: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

