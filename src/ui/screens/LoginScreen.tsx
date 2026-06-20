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
import { Eye, EyeOff, Mail, Lock } from 'lucide-react-native';
import { Colors, Fonts, Layout, Shadows } from '../theme';
import { userStore } from '../../storage/userStore';

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
      style={styles.container}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#FAF9F6" />
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        
        {/* Header Section */}
        <View style={styles.header}>
          <Image
            source={require('../../assets/lafina_default_logo.png')}
            style={styles.logoText}
            resizeMode="contain"
          />
          {/* <Text style={styles.subtitle}>USTP Academic Scheduler</Text> */}
        </View>

        {/* Card Form */}
        <View style={[styles.card, Shadows.card]}>
          <Text style={styles.cardTitle}>Welcome Back</Text>
          <Text style={styles.cardSubtitle}>Sign in to access your offline schedule</Text>

          {error && <Text style={styles.errorText}>{error}</Text>}

          {/* Email Field */}
          <Text style={styles.fieldLabel}>Email Address</Text>
          <View style={styles.inputContainer}>
            <Mail size={20} color={Colors.textMuted} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="student@ustp.edu.ph"
              placeholderTextColor={Colors.textMutedLight}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Password Field */}
          <Text style={styles.fieldLabel}>Password</Text>
          <View style={styles.inputContainer}>
            <Lock size={20} color={Colors.textMuted} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={Colors.textMutedLight}
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
                <EyeOff size={20} color={Colors.textMuted} />
              ) : (
                <Eye size={20} color={Colors.textMuted} />
              )}
            </TouchableOpacity>
          </View>

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
          <Text style={styles.footerText}>Don't have an account? </Text>
          <TouchableOpacity onPress={onNavigateToRegister}>
            <Text style={styles.registerLink}>Register</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
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
    color: Colors.textMuted,
    marginTop: 4,
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: Colors.cardBg,
    borderRadius: Layout.borderRadiusCard,
    padding: 24,
    width: '100%',
  },
  cardTitle: {
    fontFamily: Fonts.heading,
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.textDark,
  },
  cardSubtitle: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Colors.textMuted,
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
    color: Colors.textDark,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Layout.borderRadiusButton,
    marginBottom: 16,
    paddingHorizontal: 12,
    backgroundColor: '#FAF9F6',
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    height: 48,
    fontFamily: Fonts.body,
    fontSize: 14,
    color: Colors.textDark,
  },
  eyeIcon: {
    padding: 8,
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
    color: Colors.textMuted,
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
