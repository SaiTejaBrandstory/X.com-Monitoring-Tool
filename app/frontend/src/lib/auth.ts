import axios, { AxiosInstance } from 'axios';
import { getAPIBaseURL } from './config';

class RPApi {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      withCredentials: true,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  private getBaseURL() {
    return getAPIBaseURL();
  }

  async getCurrentUser() {
    try {
      const response = await this.client.get(
        `${this.getBaseURL()}/api/v1/auth/me`
      );
      return response.data;
    } catch (error) {
      if (error.response?.status === 401) {
        return null;
      }
      throw new Error(
        error.response?.data?.detail || 'Failed to get user info'
      );
    }
  }

  /**
   * OIDC login: backend returns JSON { redirect_url } (not a 302). Do not use
   * client.auth.toLogin() from web-sdk — that only full-page navigates and shows raw JSON.
   */
  async login(fromUrl?: string) {
    try {
      const qs =
        fromUrl != null && fromUrl !== ''
          ? `?from_url=${encodeURIComponent(fromUrl)}`
          : '';
      const response = await this.client.get(
        `${this.getBaseURL()}/api/v1/auth/login${qs}`
      );
      const url = response.data?.redirect_url;
      if (!url || typeof url !== 'string') {
        throw new Error('Login response missing redirect_url');
      }
      window.location.href = url;
    } catch (error) {
      throw new Error(
        error.response?.data?.detail || 'Failed to initiate login'
      );
    }
  }

  async logout() {
    try {
      const response = await this.client.get(
        `${this.getBaseURL()}/api/v1/auth/logout`
      );
      // The backend will redirect to OIDC provider logout
      window.location.href = response.data.redirect_url;
    } catch (error) {
      throw new Error(error.response?.data?.detail || 'Failed to logout');
    }
  }
}

export const authApi = new RPApi();
