import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Fonts, Layout, Shadows } from '../theme';

export type TabType = 'calendar' | 'schedule' | 'notes' | 'profile';

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
  return (
    <View style={styles.outerContainer}>
      <View style={styles.container}>
        {/* Calendar Tab */}
        <TouchableOpacity
          style={styles.tab}
          onPress={() => onTabPress('calendar')}
          activeOpacity={0.8}
        >
          <CalendarIcon active={activeTab === 'calendar'} />
          {activeTab === 'calendar' && (
            <Text style={[styles.label, styles.activeLabel]}>Calendar</Text>
          )}
        </TouchableOpacity>

        {/* Schedule Tab */}
        <TouchableOpacity
          style={styles.tab}
          onPress={() => onTabPress('schedule')}
          activeOpacity={0.8}
        >
          <ScheduleIcon active={activeTab === 'schedule'} />
          {activeTab === 'schedule' && (
            <Text style={[styles.label, styles.activeLabel]}>Schedule</Text>
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
            <MicIcon />
          </TouchableOpacity>
        </View>

        {/* Notes Tab */}
        <TouchableOpacity
          style={styles.tab}
          onPress={() => onTabPress('notes')}
          activeOpacity={0.8}
        >
          <NotesIcon active={activeTab === 'notes'} />
          {activeTab === 'notes' && (
            <Text style={[styles.label, styles.activeLabel]}>Notes</Text>
          )}
        </TouchableOpacity>

        {/* Profile Tab */}
        <TouchableOpacity
          style={styles.tab}
          onPress={() => onTabPress('profile')}
          activeOpacity={0.8}
        >
          <ProfileIcon active={activeTab === 'profile'} />
          {activeTab === 'profile' && (
            <Text style={[styles.label, styles.activeLabel]}>Profile</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

// --- Custom Vector Icons Using Pure Components (Zero Dependencies) ---

const CalendarIcon: React.FC<{ active: boolean }> = ({ active }) => {
  const tint = active ? Colors.red : '#9E9E9E';
  return (
    <View style={styles.iconContainer}>
      <View style={[styles.calOutline, { borderColor: tint }]}>
        <View style={[styles.calHeader, { backgroundColor: tint }]} />
        <View style={styles.calGrid}>
          <View style={[styles.calDot, { backgroundColor: tint }]} />
          <View style={[styles.calDot, { backgroundColor: tint }]} />
          <View style={[styles.calDot, { backgroundColor: tint }]} />
          <View style={[styles.calDot, { backgroundColor: tint }]} />
        </View>
      </View>
    </View>
  );
};

const ScheduleIcon: React.FC<{ active: boolean }> = ({ active }) => {
  const tint = active ? Colors.red : '#9E9E9E';
  return (
    <View style={styles.iconContainer}>
      <View style={styles.schedContainer}>
        <View style={styles.schedRow}>
          <View style={[styles.schedCheck, { borderColor: tint }]} />
          <View style={[styles.schedLine, { backgroundColor: tint, width: 14 }]} />
        </View>
        <View style={styles.schedRow}>
          <View style={[styles.schedCheck, { borderColor: tint }]} />
          <View style={[styles.schedLine, { backgroundColor: tint, width: 10 }]} />
        </View>
        <View style={styles.schedRow}>
          <View style={[styles.schedCheck, { borderColor: tint }]} />
          <View style={[styles.schedLine, { backgroundColor: tint, width: 12 }]} />
        </View>
      </View>
    </View>
  );
};

const MicIcon: React.FC = () => {
  return (
    <View style={styles.micIconContainer}>
      {/* Mic Capsule */}
      <View style={styles.micCapsule} />
      {/* Mic Stand */}
      <View style={styles.micStandCup} />
      <View style={styles.micStandStem} />
    </View>
  );
};

const NotesIcon: React.FC<{ active: boolean }> = ({ active }) => {
  const tint = active ? Colors.red : '#9E9E9E';
  return (
    <View style={styles.iconContainer}>
      <View style={[styles.notesSheet, { borderColor: tint }]}>
        <View style={[styles.notesLine, { backgroundColor: tint, width: 12 }]} />
        <View style={[styles.notesLine, { backgroundColor: tint, width: 14 }]} />
        <View style={[styles.notesLine, { backgroundColor: tint, width: 8 }]} />
      </View>
    </View>
  );
};

const ProfileIcon: React.FC<{ active: boolean }> = ({ active }) => {
  const tint = active ? Colors.red : '#9E9E9E';
  return (
    <View style={styles.iconContainer}>
      <View style={[styles.profileOutline, { borderColor: tint }]}>
        <View style={[styles.profileHead, { backgroundColor: tint }]} />
        <View style={[styles.profileBody, { backgroundColor: tint }]} />
      </View>
    </View>
  );
};

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
    backgroundColor: '#FFFFFF',
    borderRadius: 36,
    height: Layout.navbarHeight,
    width: '100%',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.04)',
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
    color: '#9E9E9E',
  },
  activeLabel: {
    fontFamily: Fonts.heading,
    color: Colors.red,
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

  // Icon Styles
  iconContainer: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  // Calendar Icon
  calOutline: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  calHeader: {
    height: 4,
    width: '100%',
  },
  calGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 2,
    justifyContent: 'space-between',
    alignContent: 'space-between',
  },
  calDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },

  // Schedule Icon
  schedContainer: {
    width: 18,
    height: 18,
    justifyContent: 'space-between',
  },
  schedRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  schedCheck: {
    width: 6,
    height: 6,
    borderWidth: 1.5,
    borderRadius: 1.5,
    marginRight: 4,
  },
  schedLine: {
    height: 1.5,
    borderRadius: 1,
  },

  // Notes Icon
  notesSheet: {
    width: 16,
    height: 20,
    borderWidth: 2,
    borderRadius: 2,
    justifyContent: 'center',
    paddingLeft: 2,
  },
  notesLine: {
    height: 1.5,
    marginVertical: 1.5,
    borderRadius: 0.5,
  },

  // Profile Icon
  profileOutline: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  profileHead: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 2,
  },
  profileBody: {
    width: 16,
    height: 10,
    borderRadius: 5,
    marginTop: 1,
  },

  // Mic Icon (Drawn inside the Mic Button)
  micIconContainer: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micCapsule: {
    width: 8,
    height: 12,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  micStandCup: {
    width: 14,
    height: 8,
    borderBottomLeftRadius: 7,
    borderBottomRightRadius: 7,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    borderTopWidth: 0,
    marginTop: -2,
  },
  micStandStem: {
    width: 2,
    height: 4,
    backgroundColor: '#FFFFFF',
    marginTop: 0,
  },
});
