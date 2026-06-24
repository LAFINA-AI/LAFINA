import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { useColorScheme } from 'react-native';
import { userStore } from '../../storage';
import { Colors } from '../theme/colors';

export interface ThemeColors {
  // Core surfaces
  background: string;
  cardBg: string;
  inputBg: string;
  divider: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;

  // Borders
  border: string;

  // Status bar
  statusBarStyle: 'dark-content' | 'light-content';

  // Brand / semantic colors
  red: string;
  blue: string;
  yellow: string;
  success: string;
  warning: string;
  error: string;

  // Additional semantic colors that were previously hardcoded
  white: string;
  black: string;
  overlay: string;
  chipActiveText: string;

  // Switch / toggle
  switchTrackOff: string;
  switchThumb: string;

  // Placeholder text
  placeholder: string;

  // Icon / minor element tints
  iconMuted: string;

  // Event icon backgrounds
  eventIconBg: string;

  // Overdue / warning banner backgrounds
  bannerBg: string;
}

const lightColors: ThemeColors = {
  background: '#FAF9F6',
  cardBg: Colors.cardBg,
  inputBg: '#FAF9F6',
  divider: '#F0F0F0',
  textPrimary: Colors.textDark,
  textSecondary: Colors.textMuted,
  textMuted: Colors.textMutedLight,
  border: Colors.border,
  statusBarStyle: 'dark-content',
  red: Colors.red,
  blue: Colors.blue,
  yellow: Colors.yellow,
  success: Colors.success,
  warning: Colors.warning,
  error: Colors.error,
  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(0,0,0,0.5)',
  chipActiveText: '#FFFFFF',
  switchTrackOff: '#767577',
  switchThumb: '#FFF',
  placeholder: '#888',
  iconMuted: '#AAA',
  eventIconBg: '#F0F0FF',
  bannerBg: '#FCE4D6',
};

const darkColors: ThemeColors = {
  background: '#121212',
  cardBg: Colors.cardBgDark,
  inputBg: '#2C2C2E',
  divider: '#3A3A3C',
  textPrimary: Colors.textLight,
  textSecondary: Colors.textMutedLight,
  textMuted: '#666666',
  border: Colors.borderDark,
  statusBarStyle: 'light-content',
  red: Colors.red,
  blue: Colors.blue,
  yellow: Colors.yellow,
  success: Colors.success,
  warning: Colors.warning,
  error: Colors.error,
  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(0,0,0,0.5)',
  chipActiveText: '#FFFFFF',
  switchTrackOff: '#767577',
  switchThumb: '#FFF',
  placeholder: '#666',
  iconMuted: '#666',
  eventIconBg: '#1E1E3F',
  bannerBg: '#2C1B18',
};

interface ThemeContextType {
  isDarkMode: boolean;
  colors: ThemeColors;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ userId: string | null; children: React.ReactNode }> = ({
  userId,
  children,
}) => {
  const systemScheme = useColorScheme();

  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (userId) {
      return userStore.getDarkModeEnabled(userId);
    }
    return systemScheme === 'dark';
  });

  useEffect(() => {
    if (userId) {
      setIsDarkMode(userStore.getDarkModeEnabled(userId));
    } else {
      setIsDarkMode(systemScheme === 'dark');
    }
  }, [userId, systemScheme]);

  const colors = useMemo<ThemeColors>(
    () => (isDarkMode ? darkColors : lightColors),
    [isDarkMode]
  );

  const toggleTheme = useCallback(() => {
    setIsDarkMode((prev) => {
      const next = !prev;
      if (userId) {
        userStore.setDarkModeEnabled(userId, next);
      }
      return next;
    });
  }, [userId]);

  const contextValue = useMemo(
    () => ({ isDarkMode, colors, toggleTheme }),
    [isDarkMode, colors, toggleTheme]
  );

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextType => {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
};
