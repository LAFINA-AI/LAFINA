import { secureKeystore } from '../utils/keystore';
import { userStore } from '../storage/userStore';

export type CloudResultStatus =
  | 'success'
  | 'offline'
  | 'auth_required'
  | 'subscription_required'
  | 'rate_limited'
  | 'validation_error'
  | 'server_error';

export interface CloudResult<T> {
  status: CloudResultStatus;
  data?: T;
  error?: string;
}

let inMemoryAccessToken: string | null = null;
let apiBaseUrl: string = 'http://10.0.2.2:8000'; // Render production endpoint or localhost dev URL
let isOnlineMockState: boolean = true;

export const setMockOnlineState = (online: boolean) => {
  isOnlineMockState = online;
};

export const cloudClient = {
  setBaseUrl: (url: string) => {
    apiBaseUrl = url;
  },

  setAccessToken: (token: string | null) => {
    inMemoryAccessToken = token;
    try {
      const session = userStore.getActiveSessionToken();
      if (session.userId) {
        userStore.saveSessionTokens(session.userId, token);
      }
    } catch (e) {
      console.warn('Error saving access token to userStore:', e);
    }
  },

  getAccessToken: (): string | null => {
    if (!inMemoryAccessToken) {
      try {
        const session = userStore.getActiveSessionToken();
        if (session.accessToken) {
          inMemoryAccessToken = session.accessToken;
        }
      } catch (e) {
        console.warn('Error restoring active session token:', e);
      }
    }
    return inMemoryAccessToken;
  },

  storeEncryptedRefreshToken: async (refreshToken: string): Promise<void> => {
    await secureKeystore.encryptString(refreshToken);
    try {
      const session = userStore.getActiveSessionToken();
      if (session.userId) {
        userStore.saveSessionTokens(session.userId, inMemoryAccessToken, refreshToken);
      }
    } catch (e) {
      console.warn('Error saving refresh token to userStore:', e);
    }
  },

  getEncryptedRefreshToken: async (): Promise<string | null> => {
    try {
      const session = userStore.getActiveSessionToken();
      return session.refreshToken || null;
    } catch {
      return null;
    }
  },

  isOnline: async (): Promise<boolean> => {
    return isOnlineMockState;
  },

  /**
   * Universal fetch wrapper returning typed CloudResult<T>
   */
  request: async <T>(
    endpoint: string,
    options: RequestInit = {},
    requiresAuth: boolean = true
  ): Promise<CloudResult<T>> => {
    const online = await cloudClient.isOnline();
    if (!online) {
      return { status: 'offline', error: 'Device is offline. Cloud feature unavailable.' };
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    if (requiresAuth) {
      const token = cloudClient.getAccessToken();
      if (!token) {
        return { status: 'auth_required', error: 'Authentication required. Please sign in.' };
      }
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(`${apiBaseUrl}${endpoint}`, {
        ...options,
        headers,
      });

      if (response.status === 401 && requiresAuth) {
        return { status: 'auth_required', error: 'Session expired. Sign-in required.' };
      }
      if (response.status === 403) {
        const errorData = await response.json().catch(() => ({ detail: 'Access denied.' }));
        return { status: 'subscription_required', error: errorData.detail || 'Online AI requires a student_pro subscription.' };
      }
      if (response.status === 429) {
        return { status: 'rate_limited', error: 'Rate limit exceeded. Please try again later.' };
      }
      if (response.status >= 400 && response.status < 500) {
        const errorData = await response.json().catch(() => ({ detail: 'Validation error' }));
        return { status: 'validation_error', error: errorData.detail || 'Validation error' };
      }
      if (response.status >= 500) {
        return { status: 'server_error', error: 'Server error encountered.' };
      }

      const data = await response.json().catch(() => ({}));
      return { status: 'success', data: data as T };
    } catch (err: any) {
      return { status: 'offline', error: err.message || 'Network error encountered.' };
    }
  }
};
