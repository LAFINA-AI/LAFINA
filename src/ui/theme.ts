import { Platform } from 'react-native';

export const Colors = {
  yellow: '#C8A800',
  red: '#F75A5A',
  blue: '#E6003A', // Brand Blue/Indigo mix
  deepIndigo: '#1E006A',
  darkBg: '#000000',
  cardBg: '#FFFFFF',
  cardBgDark: '#1C1C1E',
  textDark: '#1A1A1A',
  textLight: '#FFFFFF',
  textMuted: '#7A7A7A',
  textMutedLight: '#A0A0A0',
  border: '#E5E5E5',
  borderDark: '#2C2C2E',
  success: '#2ECC71',
  warning: '#F4A100',
  error: '#FF3B30',
  shadowColor: 'rgba(0,0,0,0.08)',
  
  // Gradient stops
  gradientRed: '#FF4D00',
  gradientMagenta: '#C2006A',
  gradientPurple: '#6B00C9',
};

export const Fonts = {
  heading: Platform.select({
    ios: 'Hammersmith One',
    android: 'sans-serif-medium', // Safe default fallback if not loaded
    default: 'System',
  }),
  body: Platform.select({
    ios: 'DM Sans',
    android: 'sans-serif',
    default: 'System',
  }),
};

export const Shadows = {
  card: Platform.select({
    ios: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 16,
    },
    android: {
      elevation: 4,
    },
    default: {},
  }),
  navbar: Platform.select({
    ios: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.1,
      shadowRadius: 12,
    },
    android: {
      elevation: 8,
    },
    default: {},
  }),
  micButton: Platform.select({
    ios: {
      shadowColor: '#C2006A',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.4,
      shadowRadius: 12,
    },
    android: {
      elevation: 12,
    },
    default: {},
  }),
};

export const Layout = {
  borderRadiusCard: 16,
  borderRadiusPill: 999,
  borderRadiusButton: 12,
  navbarHeight: 72,
  micButtonSize: 60,
};
