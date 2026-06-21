import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { useColorScheme } from 'react-native';
import { userStore } from '../../storage/userStore';
import { Colors } from '../theme';

export interface ThemeColors {
  background: string;
  cardBg: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  inputBg: string;
  divider: string;
  statusBarStyle: 'dark-content' | 'light-content';
  // Brand colors
  red: string;
  blue: string;
  yellow: string;
  success: string;
  warning: string;
  error: string;
}

const lightColors: ThemeColors = {
  background: '#FAF9F6',
  cardBg: Colors.cardBg,
  textPrimary: Colors.textDark,
  textSecondary: Colors.textMuted,
  textMuted: Colors.textMutedLight,
  border: Colors.border,
  inputBg: '#FAF9F6',
  divider: '#F0F0F0',
  statusBarStyle: 'dark-content',
  red: Colors.red,
  blue: Colors.blue,
  yellow: Colors.yellow,
  success: Colors.success,
  warning: Colors.warning,
  error: Colors.error,
};

const darkColors: ThemeColors = {
  background: '#121212',
  cardBg: Colors.cardBgDark,
  textPrimary: Colors.textLight,
  textSecondary: Colors.textMutedLight,
  textMuted: '#666666',
  border: Colors.borderDark,
  inputBg: '#2C2C2E',
  divider: '#3A3A3C',
  statusBarStyle: 'light-content',
  red: Colors.red,
  blue: Colors.blue,
  yellow: Colors.yellow,
  success: Colors.success,
  warning: Colors.warning,
  error: Colors.error,
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
