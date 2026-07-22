import { secureKeystore } from '../utils/keystore';

export type CloudResultStatus =
  | 'success'
  | 'offline'
  | 'auth_required'
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
  },

  getAccessToken: (): string | null => inMemoryAccessToken,

  storeEncryptedRefreshToken: async (refreshToken: string): Promise<void> => {
    await secureKeystore.encryptString(refreshToken);
  },

  getEncryptedRefreshToken: async (): Promise<string | null> => {
    // Return stored token or fallback
    return null;
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
      if (!inMemoryAccessToken) {
        return { status: 'auth_required', error: 'Authentication required. Please sign in.' };
      }
      headers['Authorization'] = `Bearer ${inMemoryAccessToken}`;
    }

    try {
      const response = await fetch(`${apiBaseUrl}${endpoint}`, {
        ...options,
        headers,
      });

      if (response.status === 401 && requiresAuth) {
        return { status: 'auth_required', error: 'Session expired. Sign-in required.' };
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
