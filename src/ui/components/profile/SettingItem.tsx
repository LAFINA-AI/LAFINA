import React from 'react';
import { View, Text, Switch, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Fonts } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';

interface SettingItemProps {
  text: string;
  type?: 'toggle' | 'link' | 'value' | 'clickable';
  value?: boolean;
  onValueChange?: (val: boolean) => void;
  valueText?: string;
  onPress?: () => void;
  isDestructive?: boolean;
}

export const SettingItem: React.FC<SettingItemProps> = ({
  text,
  type = 'link',
  value,
  onValueChange,
  valueText,
  onPress,
  isDestructive = false,
}) => {
  const { colors } = useTheme();
  const themed = useThemedStyles();

  if (type === 'toggle') {
    return (
      <View style={styles.settingItem}>
        <Text style={[styles.settingText, themed.settingText]}>{text}</Text>
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{ false: '#767577', true: colors.red }}
          thumbColor={Platform.OS === 'android' ? '#FFF' : undefined}
        />
      </View>
    );
  }

  if (type === 'value') {
    return (
      <View style={styles.settingItem}>
        <Text style={[styles.settingText, themed.settingText]}>{text}</Text>
        <Text style={[styles.settingValue, themed.settingValue]}>{valueText}</Text>
      </View>
    );
  }

  if (type === 'clickable') {
    return (
      <TouchableOpacity
        onPress={onPress}
        style={styles.settingItemClickable}
        activeOpacity={0.7}
      >
        <Text
          style={[
            styles.settingText,
            themed.settingText,
            isDestructive && { color: colors.error, fontWeight: 'bold' }
          ]}
        >
          {text}
        </Text>
      </TouchableOpacity>
    );
  }

  // Default: 'link'
  return (
    <TouchableOpacity
      style={styles.settingItem}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.settingText, themed.settingText]}>{text}</Text>
      {valueText && <Text style={[styles.linkValue, themed.settingValue]}>{valueText}</Text>}
      <Text style={[styles.linkArrow, themed.linkArrow]}>➔</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  settingItemClickable: {
    paddingVertical: 14,
  },
  settingText: {
    fontSize: 14,
    fontFamily: Fonts.body,
    flex: 1,
    marginRight: 8,
  },
  settingValue: {
    fontSize: 12,
  },
  linkValue: {
    fontSize: 11,
    marginLeft: 'auto',
    marginRight: 8,
  },
  linkArrow: {
    fontSize: 12,
  },
});

function useThemedStyles() {
  const { colors } = useTheme();
  return {
    settingText: {
      color: colors.textPrimary,
    },
    settingValue: {
      color: colors.textSecondary,
    },
    linkArrow: {
      color: colors.textMuted,
    },
  };
}
