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
export const CLOUD_API_BASE_URL = 'https://lafina.onrender.com';
export const LOCAL_API_BASE_URL = 'http://127.0.0.1:8000';

const defaultApiBaseUrls: readonly string[] = [CLOUD_API_BASE_URL, LOCAL_API_BASE_URL];
let apiBaseUrls: readonly string[] = defaultApiBaseUrls;
const androidConnectivityModule = NativeModules.AndroidConnectivityModule as
  | { isOnline: () => Promise<boolean> }
  | undefined;

let isOnlineMockState: boolean | null = null;

export const setMockOnlineState = (online: boolean | null) => {
  isOnlineMockState = online;
};

export const cloudClient = {
  /** Overrides endpoint failover for local development and isolated tests. */
  setBaseUrl: (url: string) => {
    apiBaseUrls = [url.replace(/\/+$/, '')];
  },

  /** Returns the currently configured primary FastAPI endpoint. */
  getBaseUrl: (): string => {
    return apiBaseUrls[0];
  },

  /** Restores the deployed-cloud-first endpoint order. */
  resetBaseUrls: (): void => {
    apiBaseUrls = defaultApiBaseUrls;
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

    let response: Response | null = null;
    let lastConnectionError: unknown = null;

    for (let index = 0; index < apiBaseUrls.length; index += 1) {
      const baseUrl = apiBaseUrls[index];
      const hasFallback = index < apiBaseUrls.length - 1;

      try {
        const candidateResponse = await fetch(`${baseUrl}${endpoint}`, {
          ...options,
          headers,
        });

        const isTemporarilyUnavailable = [502, 503, 504].includes(candidateResponse.status);
        if (isTemporarilyUnavailable && hasFallback) {
          continue;
        }

        response = candidateResponse;
        break;
      } catch (error: unknown) {
        lastConnectionError = error;
        if (!hasFallback) {
          break;
        }
      }
    }

    if (!response) {
      return {
        status: 'server_unavailable',
        error: lastConnectionError instanceof Error
          ? `FastAPI servers unavailable: ${lastConnectionError.message}`
          : 'FastAPI cloud and local servers are unavailable.',
      };
    }

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
  }
};
