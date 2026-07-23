import { authService, AuthResponseData, UserProfileData } from './authService';
import { cloudClient, CloudResultStatus } from './cloudClient';
import { normalizeEmail, validatePassword } from '../storage/authUtils';
import { userStore } from '../storage/userStore';

export type AccountFlowStatus =
  | 'success'
  | 'offline_only'
  | 'local_only'
  | 'validation_error'
  | 'local_email_exists'
  | 'incorrect_local_password'
  | 'incorrect_cloud_password'
  | 'account_disabled'
  | 'offline'
  | 'server_unavailable'
  | 'registration_failed'
  | 'profile_failed'
  | 'auth_required'
  | 'student_pro_required';

export interface AccountFlowResult {
  status: AccountFlowStatus;
  message: string;
  localUserId?: string;
  role?: string;
  cloudStatus?: AccountFlowStatus;
}

interface RegistrationInput {
  username: string;
  email: string;
  password: string;
}

const mapCloudFailure = (
  status: CloudResultStatus,
  fallbackMessage: string
): AccountFlowResult => {
  switch (status) {
    case 'offline':
      return {
        status: 'offline',
        message: 'The device is offline. FastAPI was not contacted.',
      };
    case 'server_unavailable':
    case 'server_error':
      return {
        status: 'server_unavailable',
        message: 'FastAPI could not be reached. The cloud account was not linked.',
      };
    case 'account_disabled':
      return {
        status: 'account_disabled',
        message: 'The FastAPI cloud account is disabled. Contact an administrator.',
      };
    case 'auth_required':
      return {
        status: 'incorrect_cloud_password',
        message:
          'This email already has a FastAPI account, but the password does not match. Enter the password for your existing cloud account to enable Online Mode.',
      };
    default:
      return { status: 'registration_failed', message: fallbackMessage };
  }
};

const attachAuthenticatedCloudSession = async (
  localUserId: string,
  authData: AuthResponseData
): Promise<AccountFlowResult> => {
  const localUser = userStore.getUserById(localUserId);
  if (!localUser?.email) {
    return {
      status: 'profile_failed',
      message: 'The active local account has no email address to link.',
    };
  }

  if (normalizeEmail(authData.email) !== normalizeEmail(localUser.email)) {
    return {
      status: 'profile_failed',
      message: 'FastAPI authenticated a different email. No local account was changed.',
    };
  }

  try {
    await cloudClient.establishSession(
      localUserId,
      authData.access_token,
      authData.refresh_token
    );
  } catch (error: unknown) {
    return {
      status: 'profile_failed',
      message: error instanceof Error
        ? error.message
        : 'Cloud credentials could not be stored securely.',
    };
  }

  const profileResult = await authService.getMe();
  if (profileResult.status !== 'success' || !profileResult.data) {
    cloudClient.clearActiveSession();
    return {
      status: profileResult.status === 'auth_required' ? 'auth_required' : 'profile_failed',
      message: profileResult.error || 'The live FastAPI profile could not be verified.',
    };
  }

  const profile = profileResult.data;
  if (normalizeEmail(profile.email) !== normalizeEmail(localUser.email)) {
    cloudClient.clearActiveSession();
    return {
      status: 'profile_failed',
      message: 'The FastAPI profile email does not match the active local account.',
    };
  }

  try {
    userStore.linkCloudAccount(localUserId, profile.id, profile.role);
  } catch {
    cloudClient.clearActiveSession();
    return {
      status: 'profile_failed',
      message: 'The FastAPI account authenticated, but the local link could not be saved.',
    };
  }

  return {
    status: 'success',
    localUserId,
    role: profile.role,
    message: 'FastAPI authentication succeeded and Online Mode is linked.',
  };
};

const authenticateExistingCloudAccount = async (
  email: string,
  password: string
): Promise<AccountFlowResult | AuthResponseData> => {
  const loginResult = await authService.login(email, password);
  if (loginResult.status === 'success' && loginResult.data) {
    return loginResult.data;
  }
  return mapCloudFailure(
    loginResult.status,
    loginResult.error || 'FastAPI login failed. Online Mode remains unavailable.'
  );
};

const registerOrAuthenticateCloudAccount = async (
  email: string,
  password: string
): Promise<AccountFlowResult | AuthResponseData> => {
  const registrationResult = await authService.register(email, password);
  if (registrationResult.status === 'success' && registrationResult.data) {
    return registrationResult.data;
  }
  if (registrationResult.status === 'conflict') {
    return await authenticateExistingCloudAccount(email, password);
  }
  return mapCloudFailure(
    registrationResult.status,
    registrationResult.error || 'FastAPI registration failed. No linked local account was created.'
  );
};

const isFlowResult = (
  result: AccountFlowResult | AuthResponseData
): result is AccountFlowResult => 'status' in result;

export const accountLinkService = {
  /**
   * Registers with FastAPI first, then creates a local user only after cloud success.
   */
  registerCloudFirst: async (
    input: RegistrationInput
  ): Promise<AccountFlowResult> => {
    const passwordValidation = validatePassword(input.password);
    if (!passwordValidation.isValid) {
      return {
        status: 'validation_error',
        message: passwordValidation.error || 'Password validation failed.',
      };
    }

    const normalizedEmail = normalizeEmail(input.email);
    if (userStore.getUserByEmail(normalizedEmail)) {
      return {
        status: 'local_email_exists',
        message: 'This email already exists locally. Sign in to preserve its local data.',
      };
    }

    if (!(await cloudClient.isOnline())) {
      return {
        status: 'offline',
        message: 'The device is offline. Choose offline-only registration to continue.',
      };
    }

    const cloudResult = await registerOrAuthenticateCloudAccount(
      normalizedEmail,
      input.password
    );
    if (isFlowResult(cloudResult)) {
      return cloudResult;
    }

    let localUserId: string;
    try {
      localUserId = await userStore.register(
        input.username.trim(),
        normalizedEmail,
        input.password
      );
      userStore.setCurrentUser(localUserId);
      cloudClient.resetSessionCache();
    } catch (error: unknown) {
      return {
        status: 'registration_failed',
        message: error instanceof Error
          ? `FastAPI registration succeeded, but local account creation failed: ${error.message}`
          : 'FastAPI registration succeeded, but local account creation failed.',
      };
    }

    const linkResult = await attachAuthenticatedCloudSession(localUserId, cloudResult);
    if (linkResult.status !== 'success') {
      return {
        ...linkResult,
        status: 'local_only',
        cloudStatus: linkResult.status,
        localUserId,
        message: `${linkResult.message} The new local account remains available offline.`,
      };
    }
    return linkResult;
  },

  /** Creates an explicitly requested offline-only local account. */
  registerOfflineOnly: async (
    input: RegistrationInput
  ): Promise<AccountFlowResult> => {
    const passwordValidation = validatePassword(input.password);
    if (!passwordValidation.isValid) {
      return {
        status: 'validation_error',
        message: passwordValidation.error || 'Password validation failed.',
      };
    }
    const normalizedEmail = normalizeEmail(input.email);
    if (userStore.getUserByEmail(normalizedEmail)) {
      return {
        status: 'local_email_exists',
        message: 'This email already exists locally. Sign in instead.',
      };
    }
    try {
      const localUserId = await userStore.register(
        input.username.trim(), normalizedEmail, input.password
      );
      userStore.setCurrentUser(localUserId);
      cloudClient.resetSessionCache();
      return {
        status: 'offline_only',
        localUserId,
        role: 'student',
        message: 'Offline-only account created. Link FastAPI later from Profile.',
      };
    } catch (error: unknown) {
      return {
        status: 'registration_failed',
        message: error instanceof Error ? error.message : 'Local registration failed.',
      };
    }
  },

  /**
   * Authenticates locally first and attempts FastAPI login without sacrificing offline access.
   */
  login: async (email: string, password: string): Promise<AccountFlowResult> => {
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return {
        status: 'validation_error',
        message: passwordValidation.error || 'Password validation failed.',
      };
    }
    const normalizedEmail = normalizeEmail(email);
    const localUser = userStore.getUserByEmail(normalizedEmail);
    if (!localUser) {
      return {
        status: 'incorrect_local_password',
        message: 'No local account exists for this email.',
      };
    }
    const authenticatedLocalUser = await userStore.login(normalizedEmail, password);
    if (!authenticatedLocalUser) {
      return {
        status: 'incorrect_local_password',
        message: 'The local password is incorrect.',
      };
    }

    userStore.setCurrentUser(authenticatedLocalUser.id);
    cloudClient.resetSessionCache();

    if (!(await cloudClient.isOnline())) {
      return {
        status: 'local_only',
        cloudStatus: 'offline',
        localUserId: authenticatedLocalUser.id,
        role: authenticatedLocalUser.role,
        message: 'Signed in locally while offline. Online Mode is unavailable.',
      };
    }

    const cloudLogin = await authenticateExistingCloudAccount(normalizedEmail, password);
    if (isFlowResult(cloudLogin)) {
      return {
        status: 'local_only',
        cloudStatus: cloudLogin.status,
        localUserId: authenticatedLocalUser.id,
        role: authenticatedLocalUser.role,
        message: `${cloudLogin.message} Offline access remains available.`,
      };
    }

    const linkResult = await attachAuthenticatedCloudSession(
      authenticatedLocalUser.id,
      cloudLogin
    );
    if (linkResult.status !== 'success') {
      return {
        ...linkResult,
        status: 'local_only',
        cloudStatus: linkResult.status,
        localUserId: authenticatedLocalUser.id,
        role: authenticatedLocalUser.role,
        message: `${linkResult.message} Offline access remains available.`,
      };
    }
    return linkResult;
  },

  /**
   * Creates or links FastAPI for an existing active local user without changing local data.
   */
  createOrLinkCloudAccount: async (
    localUserId: string,
    cloudPassword: string
  ): Promise<AccountFlowResult> => {
    const passwordValidation = validatePassword(cloudPassword);
    if (!passwordValidation.isValid) {
      return {
        status: 'validation_error',
        message: passwordValidation.error || 'Password validation failed.',
      };
    }
    const localUser = userStore.getUserById(localUserId);
    const activeSession = userStore.getActiveSessionToken();
    if (!localUser?.email || activeSession.userId !== localUserId) {
      return {
        status: 'auth_required',
        message: 'Sign in to the local account before linking FastAPI.',
      };
    }
    if (!(await cloudClient.isOnline())) {
      return {
        status: 'offline',
        message: 'The device is offline. The local account was not changed.',
      };
    }

    const cloudResult = await registerOrAuthenticateCloudAccount(
      normalizeEmail(localUser.email), cloudPassword
    );
    if (isFlowResult(cloudResult)) {
      return cloudResult;
    }
    return await attachAuthenticatedCloudSession(localUserId, cloudResult);
  },

  /** Synchronizes the authoritative live FastAPI role into one active local user. */
  refreshCloudProfile: async (localUserId: string): Promise<AccountFlowResult> => {
    const localUser = userStore.getUserById(localUserId);
    const activeSession = userStore.getActiveSessionToken();
    if (!localUser?.email || activeSession.userId !== localUserId || !activeSession.accessToken) {
      return {
        status: 'auth_required',
        message: 'No valid FastAPI-authenticated session is stored for this local account.',
      };
    }
    const profileResult = await authService.getMe();
    if (profileResult.status !== 'success' || !profileResult.data) {
      const mapped = mapCloudFailure(
        profileResult.status,
        profileResult.error || 'The live FastAPI profile could not be loaded.'
      );
      return profileResult.status === 'auth_required'
        ? { ...mapped, status: 'auth_required', message: profileResult.error || mapped.message }
        : mapped;
    }
    const profile: UserProfileData = profileResult.data;
    if (normalizeEmail(profile.email) !== normalizeEmail(localUser.email)) {
      cloudClient.clearActiveSession();
      return {
        status: 'auth_required',
        message: 'The stored cloud session belongs to a different email. Link again.',
      };
    }
    userStore.linkCloudAccount(localUserId, profile.id, profile.role);
    return {
      status: 'success',
      localUserId,
      role: profile.role,
      message: 'Cloud profile and role synchronized.',
    };
  },

  /** Requires a verified live Student Pro or admin FastAPI profile for Online Chat. */
  authorizeOnlineMode: async (localUserId: string): Promise<AccountFlowResult> => {
    const profileResult = await accountLinkService.refreshCloudProfile(localUserId);
    if (profileResult.status !== 'success') {
      return profileResult;
    }
    if (profileResult.role !== 'student_pro' && profileResult.role !== 'admin') {
      return {
        status: 'student_pro_required',
        localUserId,
        role: profileResult.role,
        message: 'The live FastAPI account does not have Student Pro access.',
      };
    }
    return profileResult;
  },
};
