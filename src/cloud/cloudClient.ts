import { secureKeystore } from '../utils/keystore';
import { userStore } from '../storage/userStore';
import { NativeModules, Platform } from 'react-native';

export type CloudResultStatus =
  | 'success'
  | 'offline'
  | 'auth_required'
  | 'account_disabled'
  | 'conflict'
  | 'subscription_required'
  | 'server_unavailable'
  | 'rate_limited'
  | 'validation_error'
  | 'server_error';

export interface CloudResult<T> {
  status: CloudResultStatus;
  data?: T;
  error?: string;
  httpStatus?: number;
}

let inMemoryAccessToken: string | null = null;
let inMemoryUserId: string | null = null;
let apiBaseUrl: string = 'http://127.0.0.1:8000'; // Default dev URL (supports adb reverse tcp:8000 tcp:8000)
const androidConnectivityModule = NativeModules.AndroidConnectivityModule as
  | { isOnline: () => Promise<boolean> }
  | undefined;

let isOnlineMockState: boolean | null = null;

export const setMockOnlineState = (online: boolean | null) => {
  isOnlineMockState = online;
};

export const cloudClient = {
  setBaseUrl: (url: string) => {
    apiBaseUrl = url;
  },

  getBaseUrl: (): string => {
    return apiBaseUrl;
  },

  /** Persists a replacement access token for the active local user. */
  setAccessToken: (token: string | null) => {
    try {
      const session = userStore.getActiveSessionToken();
      if (session.userId) {
        userStore.saveSessionTokens(session.userId, token);
      }
      inMemoryUserId = session.userId;
      inMemoryAccessToken = token;
    } catch (e) {
      console.warn('Error saving access token to userStore:', e);
    }
  },

  /** Returns the access token associated with the currently active local user. */
  getAccessToken: (): string | null => {
    try {
      const session = userStore.getActiveSessionToken();
      if (session.userId !== inMemoryUserId) {
        inMemoryUserId = session.userId;
        inMemoryAccessToken = session.accessToken;
      } else if (!inMemoryAccessToken && session.accessToken) {
        inMemoryAccessToken = session.accessToken;
      }
    } catch (e) {
      console.warn('Error restoring active session token:', e);
    }
    return inMemoryAccessToken;
  },

  /** Encrypts and binds FastAPI tokens to one active local SQLite user. */
  establishSession: async (
    localUserId: string,
    accessToken: string,
    refreshToken: string
  ): Promise<void> => {
    const session = userStore.getActiveSessionToken();
    if (session.userId !== localUserId) {
      throw new Error('Cloud credentials could not be associated with the active local account.');
    }
    const encryptedRefreshToken = await secureKeystore.encryptString(refreshToken);
    userStore.saveSessionTokens(localUserId, accessToken, encryptedRefreshToken);
    inMemoryUserId = localUserId;
    inMemoryAccessToken = accessToken;
  },

  /** Encrypts a rotated refresh token before replacing the active cloud session. */
  storeEncryptedRefreshToken: async (refreshToken: string): Promise<void> => {
    const session = userStore.getActiveSessionToken();
    if (!session.userId || !inMemoryAccessToken) {
      throw new Error('No active local cloud session is available.');
    }
    await cloudClient.establishSession(session.userId, inMemoryAccessToken, refreshToken);
  },

  /** Decrypts the active refresh token only for a renewal request. */
  getEncryptedRefreshToken: async (): Promise<string | null> => {
    const session = userStore.getActiveSessionToken();
    if (!session.refreshToken) {
      return null;
    }
    return await secureKeystore.decryptString(session.refreshToken);
  },

  /** Clears cloud tokens but preserves the active local account and its data. */
  clearActiveSession: (): void => {
    const session = userStore.getActiveSessionToken();
    try {
      if (session.userId) {
        userStore.clearSessionTokens(session.userId);
      }
    } finally {
      inMemoryAccessToken = null;
      inMemoryUserId = session.userId;
    }
  },

  /** Clears only the in-memory cache when the active local user changes. */
  resetSessionCache: (): void => {
    inMemoryAccessToken = null;
    inMemoryUserId = null;
  },

  /** Reports device connectivity without making a cloud request. */
  isOnline: async (): Promise<boolean> => {
    if (isOnlineMockState !== null) {
      return isOnlineMockState;
    }
    if (Platform.OS === 'android' && androidConnectivityModule) {
      try {
        return await androidConnectivityModule.isOnline();
      } catch {
        return false;
      }
    }
    const navigatorState = globalThis.navigator as Navigator & { onLine?: boolean };
    return navigatorState.onLine !== false;
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
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      const response = await fetch(`${apiBaseUrl}${endpoint}`, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: null }));
        const detail =
          typeof errorData.detail === 'string' ? errorData.detail : 'FastAPI request failed.';

        if (response.status === 401) {
          return {
            status: 'auth_required',
            error: requiresAuth ? 'Cloud session expired. Sign in again while online.' : detail,
            httpStatus: response.status,
          };
        }
        if (response.status === 403) {
          const isDisabled = detail.toLowerCase().includes('disabled');
          return {
            status: isDisabled ? 'account_disabled' : 'subscription_required',
            error: detail,
            httpStatus: response.status,
          };
        }
        if (response.status === 409) {
          return { status: 'conflict', error: detail, httpStatus: response.status };
        }
        if (response.status === 429) {
          return { status: 'rate_limited', error: detail, httpStatus: response.status };
        }
        if (response.status >= 500) {
          return {
            status: 'server_error',
            error: 'FastAPI encountered a server error. Please try again.',
            httpStatus: response.status,
          };
        }
        return { status: 'validation_error', error: detail, httpStatus: response.status };
      }

      const data = await response.json().catch(() => ({}));
      return { status: 'success', data: data as T, httpStatus: response.status };
    } catch (error: unknown) {
      return {
        status: 'server_unavailable',
        error: error instanceof Error
          ? `FastAPI server unavailable: ${error.message}`
          : 'FastAPI server unavailable.',
      };
    }
  }
};
