import React, { useState, useEffect } from 'react';
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
import { Eye, EyeOff, Mail, Lock, Check } from 'lucide-react-native';
import { Colors, Fonts, Layout, Shadows } from '../theme';
import { userStore } from '../../storage/userStore';
import { useTheme } from '../contexts/ThemeContext';

interface LoginScreenProps {
  onLoginSuccess: (userId: string) => void;
  onNavigateToRegister: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onLoginSuccess,
  onNavigateToRegister,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(false);

  const { colors } = useTheme();
  const themed = useThemedStyles();

  // Load saved credentials on mount [Fix #9]
  useEffect(() => {
    const saved = userStore.getRememberMe();
    if (saved.enabled && saved.email) {
      setEmail(saved.email);
      setRememberMe(true);
    }
  }, []);

  const handleRememberMeToggle = () => {
    const newValue = !rememberMe;
    setRememberMe(newValue);

    if (newValue) {
      userStore.setRememberMe(true, email.trim() || null);
    } else {
      userStore.setRememberMe(false, null);
    }
  };

  const handleEmailChange = (text: string) => {
    setEmail(text);
    if (rememberMe) {
      userStore.setRememberMe(true, text.trim() || null);
    }
  };

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Small simulated delay for native feel
      await new Promise<void>(resolve => setTimeout(resolve, 800));
      
      const user = await userStore.login(email.trim(), password);
      if (user) {
        userStore.setCurrentUser(user.id);
        if (rememberMe) {
          userStore.setRememberMe(true, email.trim());
        }
        onLoginSuccess(user.id);
      } else {
        setError('Invalid email or password');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during login');
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
          <Text style={[styles.cardTitle, themed.cardTitle]}>Welcome Back</Text>
          <Text style={[styles.cardSubtitle, themed.cardSubtitle]}>Sign in to access your offline schedule</Text>

          {error && <Text style={styles.errorText}>{error}</Text>}

          {/* Email Field */}
          <Text style={[styles.fieldLabel, themed.fieldLabel]}>Email Address</Text>
          <View style={[styles.inputContainer, themed.inputContainer]}>
            <Mail size={20} color={colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, themed.input]}
              placeholder="student@ustp.edu.ph"
              placeholderTextColor={colors.textSecondary}
              value={email}
              onChangeText={handleEmailChange}
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

          {/* Remember Me Checkbox [Fix #9] */}
          <TouchableOpacity
            style={styles.rememberMeRow}
            onPress={handleRememberMeToggle}
            activeOpacity={0.7}
          >
            <View style={[
              styles.checkbox,
              themed.checkbox,
              rememberMe && styles.checkboxChecked,
              rememberMe && themed.checkboxChecked,
            ]}>
              {rememberMe && <Check size={14} color="#FFFFFF" />}
            </View>
            <Text style={[styles.rememberMeText, themed.rememberMeText]}>
              Remember me
            </Text>
          </TouchableOpacity>

          {/* Log In Button */}
          <TouchableOpacity
            style={[styles.loginButton, loading && styles.disabledButton]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.loginButtonText}>Sign In</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Footer Navigation */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, themed.footerText]}>Don't have an account? </Text>
          <TouchableOpacity onPress={onNavigateToRegister}>
            <Text style={styles.registerLink}>Register</Text>
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
    rememberMeText: {
      color: colors.textSecondary,
    },
    checkbox: {
      borderColor: colors.border,
      backgroundColor: colors.cardBg,
    },
    checkboxChecked: {
      backgroundColor: colors.blue,
      borderColor: colors.blue,
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
    marginBottom: 32,
  },
  logoIcon: {
    width: 72,
    height: 72,
    marginBottom: 12,
  },
  logoText: {
    width: 140,
    height: 80,
  },
  subtitle: {
    fontFamily: Fonts.body,
    fontSize: 12,
    marginTop: 4,
    letterSpacing: 0.5,
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
  rememberMeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 4,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  checkboxChecked: {
    // themed styles handle background and borders
  },
  rememberMeText: {
    fontFamily: Fonts.body,
    fontSize: 14,
  },
  loginButton: {
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
  loginButtonText: {
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
  registerLink: {
    fontFamily: Fonts.body,
    color: Colors.red,
    fontWeight: 'bold',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});

