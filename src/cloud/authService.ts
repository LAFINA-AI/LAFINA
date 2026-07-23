import { cloudClient, CloudResult } from './cloudClient';
import { normalizeEmail, validatePassword } from '../storage/authUtils';
import { userStore } from '../storage/userStore';

export interface AuthResponseData {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user_id: string;
  email: string;
  role: string;
  recovery_codes?: string[];
}

export interface UserProfileData {
  id: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export const authService = {
  /** Registers a normalized FastAPI account without creating a local account. */
  register: async (email: string, password: string): Promise<CloudResult<AuthResponseData>> => {
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return {
        status: 'validation_error',
        error: passwordValidation.error || 'Password validation failed.',
      };
    }
    const res = await cloudClient.request<AuthResponseData>(
      '/v1/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({ email: normalizeEmail(email), password }),
      },
      false
    );
    return res;
  },

  /** Authenticates a normalized FastAPI account without changing the local password hash. */
  login: async (email: string, password: string, deviceInfo?: string): Promise<CloudResult<AuthResponseData>> => {
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return {
        status: 'validation_error',
        error: passwordValidation.error || 'Password validation failed.',
      };
    }
    const res = await cloudClient.request<AuthResponseData>(
      '/v1/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email: normalizeEmail(email), password, device_info: deviceInfo || 'Android Client' }),
      },
      false
    );
    return res;
  },

  /** Rotates the active FastAPI session and re-encrypts its refresh token. */
  refresh: async (refreshToken: string): Promise<CloudResult<AuthResponseData>> => {
    const res = await cloudClient.request<AuthResponseData>(
      '/v1/auth/refresh',
      {
        method: 'POST',
        body: JSON.stringify({ refresh_token: refreshToken }),
      },
      false
    );
    if (res.status === 'success' && res.data) {
      const activeSession = userStore.getActiveSessionToken();
      if (!activeSession.userId) {
        return { status: 'auth_required', error: 'No active local account is available.' };
      }
      await cloudClient.establishSession(
        activeSession.userId, res.data.access_token, res.data.refresh_token
      );
    }
    return res;
  },

  /** Revokes the remote session when possible and always clears local cloud tokens. */
  logout: async (): Promise<CloudResult<null>> => {
    try {
      return await cloudClient.request<null>('/v1/auth/logout', { method: 'POST' }, true);
    } finally {
      cloudClient.clearActiveSession();
    }
  },

  /** Fetches the live FastAPI profile, renewing an expired access token once. */
  getMe: async (): Promise<CloudResult<UserProfileData>> => {
    const requestProfile = (): Promise<CloudResult<UserProfileData>> =>
      cloudClient.request<UserProfileData>('/v1/auth/me', { method: 'GET' }, true);

    const initialResult = await requestProfile();
    if (initialResult.status !== 'auth_required') {
      return initialResult;
    }

    let refreshToken: string | null = null;
    try {
      refreshToken = await cloudClient.getEncryptedRefreshToken();
    } catch {
      cloudClient.clearActiveSession();
      return {
        status: 'auth_required',
        error: 'Refresh-token renewal failed. Sign in or link the cloud account again.',
      };
    }
    if (!refreshToken) {
      cloudClient.clearActiveSession();
      return initialResult;
    }

    let refreshResult: CloudResult<AuthResponseData>;
    try {
      refreshResult = await authService.refresh(refreshToken);
    } catch {
      cloudClient.clearActiveSession();
      return {
        status: 'auth_required',
        error: 'Refresh-token renewal failed. Sign in or link the cloud account again.',
      };
    }
    if (refreshResult.status !== 'success') {
      cloudClient.clearActiveSession();
      return {
        status: 'auth_required',
        error: 'Refresh-token renewal failed. Sign in or link the cloud account again.',
      };
    }

    const renewedProfile = await requestProfile();
    if (renewedProfile.status === 'auth_required') {
      cloudClient.clearActiveSession();
      return {
        status: 'auth_required',
        error: 'Cloud authentication expired. Sign in or link the cloud account again.',
      };
    }
    return renewedProfile;
  },
};
