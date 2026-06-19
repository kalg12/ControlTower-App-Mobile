import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { AuthUser, LoginRequest, LoginResponse } from "@/types/auth";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:8080";

export async function login(req: LoginRequest): Promise<LoginResponse> {
  const res = await axios.post(`${BASE_URL}/api/v1/auth/login`, req);
  return res.data.data as LoginResponse;
}

export async function saveTokens(tokens: LoginResponse["tokens"]): Promise<void> {
  await SecureStore.setItemAsync("accessToken", tokens.accessToken);
  await SecureStore.setItemAsync("refreshToken", tokens.refreshToken);
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync("accessToken");
  await SecureStore.deleteItemAsync("refreshToken");
}

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync("accessToken");
}

/** Called on app start to restore session from stored token. */
export async function hydrateUser(): Promise<AuthUser | null> {
  const token = await SecureStore.getItemAsync("accessToken");
  if (!token) return null;
  try {
    const res = await axios.get(`${BASE_URL}/api/v1/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10_000,
    });
    return (res.data.data ?? res.data) as AuthUser;
  } catch {
    // Token expired or server unreachable — force fresh login
    await clearTokens();
    return null;
  }
}
