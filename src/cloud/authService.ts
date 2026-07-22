import { cloudClient, CloudResult } from './cloudClient';

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

export const authService = {
  register: async (email: string, password: string): Promise<CloudResult<AuthResponseData>> => {
    const res = await cloudClient.request<AuthResponseData>(
      '/v1/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      },
      false
    );
    if (res.status === 'success' && res.data) {
      cloudClient.setAccessToken(res.data.access_token);
      await cloudClient.storeEncryptedRefreshToken(res.data.refresh_token);
    }
    return res;
  },

  login: async (email: string, password: string, deviceInfo?: string): Promise<CloudResult<AuthResponseData>> => {
    const res = await cloudClient.request<AuthResponseData>(
      '/v1/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password, device_info: deviceInfo || 'Android Client' }),
      },
      false
    );
    if (res.status === 'success' && res.data) {
      cloudClient.setAccessToken(res.data.access_token);
      await cloudClient.storeEncryptedRefreshToken(res.data.refresh_token);
    }
    return res;
  },

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
      cloudClient.setAccessToken(res.data.access_token);
      await cloudClient.storeEncryptedRefreshToken(res.data.refresh_token);
    }
    return res;
  },

  logout: async (): Promise<CloudResult<null>> => {
    const res = await cloudClient.request<null>('/v1/auth/logout', { method: 'POST' }, true);
    cloudClient.setAccessToken(null);
    return res;
  }
};
