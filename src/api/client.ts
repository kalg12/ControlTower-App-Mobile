import axios, { AxiosInstance, InternalAxiosRequestConfig } from "axios";
import * as SecureStore from "expo-secure-store";
import { useAuthStore } from "@/stores/auth.store";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:8080";

export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15_000,
  headers: { "Content-Type": "application/json" },
});

// Attach JWT to every request
apiClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await SecureStore.getItemAsync("accessToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Unwrap { success, data } envelope and handle 401
apiClient.interceptors.response.use(
  (response) => {
    if (response.data && "data" in response.data) {
      response.data = response.data.data;
    }
    return response;
  },
  async (error) => {
    if (error.response?.status === 401) {
      // Attempt token refresh
      try {
        const refreshToken = await SecureStore.getItemAsync("refreshToken");
        if (refreshToken) {
          const res = await axios.post(`${BASE_URL}/api/v1/auth/refresh`, { refreshToken });
          const { accessToken } = res.data.data;
          await SecureStore.setItemAsync("accessToken", accessToken);
          error.config.headers.Authorization = `Bearer ${accessToken}`;
          return apiClient.request(error.config);
        }
      } catch {
        // Refresh failed — logout
        await useAuthStore.getState().logout();
      }
    }
    return Promise.reject(error);
  }
);
