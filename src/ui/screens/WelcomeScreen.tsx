import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  StatusBar,
} from 'react-native';
import { Colors, Fonts, Layout, Shadows } from '../theme';
import { userStore } from '../../storage';
import { useTheme } from '../contexts/ThemeContext';
import { useThemedStyles } from '../theme/createThemedStyles';
import type { ThemeColors } from '../contexts/ThemeContext';

interface WelcomeScreenProps {
  onGetStarted: (userId: string) => void;
  onNavigateToLogin: () => void;
  onNavigateToRegister: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onGetStarted,
  onNavigateToLogin,
  onNavigateToRegister,
}) => {
  const { colors } = useTheme();
  const themed = useThemedStyles((c) => getWelcomeThemedStyles(c));

  const handleGetStarted = () => {
    const guest = userStore.createGuestUser();
    onGetStarted(guest.id);
  };

  return (
    <View style={[styles.container, themed.container]}>
      <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.background} />

      {/* Branding Section */}
      <View style={styles.brandSection}>
        <Image
          source={require('../../assets/lafina_default_logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={[styles.tagline, themed.tagline]}>
          Your Offline AI Scheduler
        </Text>
        <Text style={[styles.description, themed.description]}>
          Offline-first smart scheduling, voice notes, and calendar management — no account required.
        </Text>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionSection}>
        <TouchableOpacity
          style={[styles.primaryButton, Shadows.card]}
          onPress={handleGetStarted}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryButtonText}>Get Started Free</Text>
          <Text style={styles.primaryButtonSubtext}>No account needed</Text>
        </TouchableOpacity>

        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, themed.dividerLine]} />
          <Text style={[styles.dividerText, themed.dividerText]}>or</Text>
          <View style={[styles.dividerLine, themed.dividerLine]} />
        </View>

        <TouchableOpacity
          style={[styles.secondaryButton, themed.secondaryButton]}
          onPress={onNavigateToRegister}
          activeOpacity={0.8}
        >
          <Text style={[styles.secondaryButtonText, themed.secondaryButtonText]}>
            Create Account
          </Text>
        </TouchableOpacity>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={[styles.footerText, themed.footerText]}>Already have an account? </Text>
        <TouchableOpacity onPress={onNavigateToLogin}>
          <Text style={styles.loginLink}>Log In</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const getWelcomeThemedStyles = (colors: ThemeColors) => ({
  container: { backgroundColor: colors.background },
  tagline: { color: colors.textPrimary },
  description: { color: colors.textSecondary },
  dividerLine: { backgroundColor: colors.border },
  dividerText: { color: colors.textMuted },
  secondaryButton: { borderColor: colors.border, backgroundColor: colors.cardBg },
  secondaryButtonText: { color: colors.textPrimary },
  footerText: { color: colors.textSecondary },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  brandSection: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logo: {
    width: 180,
    height: 80,
    marginBottom: 16,
  },
  tagline: {
    fontFamily: Fonts.heading,
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontFamily: Fonts.body,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  actionSection: {
    width: '100%',
    alignItems: 'center',
  },
  primaryButton: {
    width: '100%',
    height: 56,
    backgroundColor: Colors.blue,
    borderRadius: Layout.borderRadiusButton,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  primaryButtonText: {
    fontFamily: Fonts.body,
    color: Colors.textLight,
    fontWeight: 'bold',
    fontSize: 16,
  },
  primaryButtonSubtext: {
    fontFamily: Fonts.body,
    color: Colors.textLight,
    fontSize: 11,
    marginTop: 2,
    opacity: 0.8,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontFamily: Fonts.body,
    fontSize: 12,
    marginHorizontal: 12,
  },
  secondaryButton: {
    width: '100%',
    height: 48,
    borderRadius: Layout.borderRadiusButton,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontFamily: Fonts.body,
    fontWeight: 'bold',
    fontSize: 15,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    position: 'absolute',
    bottom: 48,
    left: 24,
    right: 24,
  },
  footerText: {
    fontFamily: Fonts.body,
    fontSize: 14,
  },
  loginLink: {
    fontFamily: Fonts.body,
    color: Colors.red,
    fontWeight: 'bold',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
