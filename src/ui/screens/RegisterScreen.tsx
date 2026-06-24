import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
  StatusBar,
} from 'react-native';
import { Mail, Lock, User } from 'lucide-react-native';
import { Colors, Fonts, Layout, Shadows } from '../theme';
import { userStore } from '../../storage';
import { useTheme } from '../contexts/ThemeContext';
import { useThemedStyles } from '../theme/createThemedStyles';
import type { ThemeColors } from '../contexts/ThemeContext';

// Auth sub-components
import { AuthHeader } from '../components/auth/AuthHeader';
import { AuthInput } from '../components/auth/AuthInput';
import { AuthButton } from '../components/auth/AuthButton';

interface RegisterScreenProps {
  onRegisterSuccess: (userId: string) => void;
  onNavigateToLogin: () => void;
}

const getThemedStyles = (colors: ThemeColors) => ({
  container: { backgroundColor: colors.background },
  card: { backgroundColor: colors.cardBg },
  cardTitle: { color: colors.textPrimary },
  cardSubtitle: { color: colors.textSecondary },
  fieldLabel: { color: colors.textPrimary },
  inputContainer: { borderColor: colors.border, backgroundColor: colors.inputBg },
  input: { color: colors.textPrimary },
  footerText: { color: colors.textSecondary },
});

export const RegisterScreen: React.FC<RegisterScreenProps> = ({
  onRegisterSuccess,
  onNavigateToLogin,
}) => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { colors } = useTheme();
  const themed = useThemedStyles((c) => getThemedStyles(c));

  const handleRegister = async () => {
    if (!username.trim() || !email.trim() || !password || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await new Promise<void>(resolve => setTimeout(resolve, 800));
      const userId = await userStore.register(username.trim(), email.trim(), password);
      userStore.setCurrentUser(userId);
      onRegisterSuccess(userId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={'height'}
      style={[styles.container, themed.container]}
    >
      <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.background} />
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">

        {/* Header Section */}
        <AuthHeader />

        {/* Card Form */}
        <View style={[styles.card, Shadows.card, themed.card]}>
          <Text style={[styles.cardTitle, themed.cardTitle]}>Create Account</Text>
          <Text style={[styles.cardSubtitle, themed.cardSubtitle]}>Get started with your smart study companion</Text>

          {error && <Text style={styles.errorText}>{error}</Text>}

          {/* Display Name */}
          <AuthInput
            label="Display Name"
            placeholder="Juan dela Cruz"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="words"
            icon={<User size={20} color={colors.textSecondary} />}
          />

          {/* Email Field */}
          <AuthInput
            label="Email Address"
            placeholder="student@ustp.edu.ph"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            icon={<Mail size={20} color={colors.textSecondary} />}
          />

          {/* Password Field */}
          <AuthInput
            label="Password"
            placeholder="••••••••"
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
            icon={<Lock size={20} color={colors.textSecondary} />}
            showPasswordToggle
            showPassword={showPassword}
            onPasswordToggle={() => setShowPassword(!showPassword)}
          />

          {/* Confirm Password Field */}
          <AuthInput
            label="Confirm Password"
            placeholder="••••••••"
            secureTextEntry={!showPassword}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            icon={<Lock size={20} color={colors.textSecondary} />}
          />

          {/* Register Button */}
          <AuthButton
            title="Register"
            onPress={handleRegister}
            loading={loading}
          />
        </View>

        {/* Footer Navigation */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, themed.footerText]}>Already have an account? </Text>
          <TouchableOpacity onPress={onNavigateToLogin}>
            <Text style={styles.loginLink}>Log In</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    borderRadius: Layout.borderRadiusCard,
    padding: 24,
    width: '100%',
  },
  cardTitle: {
    fontFamily: Fonts.heading,
    fontSize: 20,
    fontWeight: 'bold',
  },
  cardSubtitle: {
    fontFamily: Fonts.body,
    fontSize: 13,
    marginTop: 4,
    marginBottom: 20,
  },
  errorText: {
    fontFamily: Fonts.body,
    color: Colors.error,
    fontSize: 13,
    marginBottom: 16,
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
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
