import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { Eye, EyeOff, Mail, Lock, User } from 'lucide-react-native';
import { Colors, Fonts, Layout, Shadows } from '../theme';
import { userStore } from '../../storage/userStore';
import { useTheme } from '../contexts/ThemeContext';

interface RegisterScreenProps {
  onRegisterSuccess: (userId: string) => void;
  onNavigateToLogin: () => void;
}

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
  const themed = useThemedStyles();

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
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, themed.container]}
    >
      <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.background} />
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        
        {/* Header Section */}
        <View style={styles.header}>
          <Image
            source={require('../../assets/lafina_default_logo.png')}
            style={styles.logoText}
            resizeMode="contain"
          />
        </View>

        {/* Card Form */}
        <View style={[styles.card, Shadows.card, themed.card]}>
          <Text style={[styles.cardTitle, themed.cardTitle]}>Create Account</Text>
          <Text style={[styles.cardSubtitle, themed.cardSubtitle]}>Get started with your smart study companion</Text>

          {error && <Text style={styles.errorText}>{error}</Text>}

          {/* Display Name */}
          <Text style={[styles.fieldLabel, themed.fieldLabel]}>Display Name</Text>
          <View style={[styles.inputContainer, themed.inputContainer]}>
            <User size={20} color={colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, themed.input]}
              placeholder="e.g. Juan dela Cruz"
              placeholderTextColor={colors.textSecondary}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="words"
              autoCorrect={false}
            />
          </View>

          {/* Email Field */}
          <Text style={[styles.fieldLabel, themed.fieldLabel]}>Email Address</Text>
          <View style={[styles.inputContainer, themed.inputContainer]}>
            <Mail size={20} color={colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, themed.input]}
              placeholder="student@ustp.edu.ph"
              placeholderTextColor={colors.textSecondary}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Password Field */}
          <Text style={[styles.fieldLabel, themed.fieldLabel]}>Password</Text>
          <View style={[styles.inputContainer, themed.inputContainer]}>
            <Lock size={20} color={colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, themed.input]}
              placeholder="••••••••"
              placeholderTextColor={colors.textSecondary}
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              style={styles.eyeIcon}
            >
              {showPassword ? (
                <EyeOff size={20} color={colors.textSecondary} />
              ) : (
                <Eye size={20} color={colors.textSecondary} />
              )}
            </TouchableOpacity>
          </View>

          {/* Confirm Password Field */}
          <Text style={[styles.fieldLabel, themed.fieldLabel]}>Confirm Password</Text>
          <View style={[styles.inputContainer, themed.inputContainer]}>
            <Lock size={20} color={colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, themed.input]}
              placeholder="••••••••"
              placeholderTextColor={colors.textSecondary}
              secureTextEntry={!showPassword}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Register Button */}
          <TouchableOpacity
            style={[styles.registerButton, loading && styles.disabledButton]}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.registerButtonText}>Register</Text>
            )}
          </TouchableOpacity>
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

function useThemedStyles() {
  const { colors } = useTheme();
  return {
    container: {
      backgroundColor: colors.background,
    },
    card: {
      backgroundColor: colors.cardBg,
    },
    cardTitle: {
      color: colors.textPrimary,
    },
    cardSubtitle: {
      color: colors.textSecondary,
    },
    fieldLabel: {
      color: colors.textPrimary,
    },
    inputContainer: {
      borderColor: colors.border,
      backgroundColor: colors.inputBg,
    },
    input: {
      color: colors.textPrimary,
    },
    footerText: {
      color: colors.textSecondary,
    },
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoIcon: {
    width: 60,
    height: 60,
    marginBottom: 8,
  },
  logoText: {
    width: 120,
    height: 80,
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
  fieldLabel: {
    fontFamily: Fonts.body,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: Layout.borderRadiusButton,
    marginBottom: 16,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    height: 48,
    fontFamily: Fonts.body,
    fontSize: 14,
  },
  eyeIcon: {
    padding: 8,
  },
  registerButton: {
    height: 48,
    backgroundColor: Colors.blue,
    borderRadius: Layout.borderRadiusButton,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  disabledButton: {
    backgroundColor: Colors.textMutedLight,
  },
  registerButtonText: {
    fontFamily: Fonts.body,
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
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

