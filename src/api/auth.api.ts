import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { AuthUser, LoginRequest, RawLoginResponse } from "@/types/auth";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:8080";

export interface LoginResult {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  requiresMfa: boolean;
  mfaToken?: string;
}

export async function login(req: LoginRequest): Promise<LoginResult> {
  const res = await axios.post(`${BASE_URL}/api/v1/auth/login`, req);
  // Backend returns: { success, message, data: RawLoginResponse }
  const raw = res.data.data as RawLoginResponse;
  return {
    user: {
      id: raw.userId,
      email: raw.email,
      fullName: raw.fullName,
      tenantId: raw.tenantId,
      roles: raw.roles ?? [],
      permissions: raw.permissions ?? [],
      superAdmin: raw.superAdmin ?? false,
      avatarUrl: raw.avatarUrl,
      totpEnabled: raw.totpEnabled ?? false,
    },
    accessToken: raw.accessToken,
    refreshToken: raw.refreshToken,
    requiresMfa: raw.requiresMfa ?? false,
    mfaToken: raw.mfaToken,
  };
}

export async function saveTokens(accessToken: string, refreshToken: string): Promise<void> {
  await SecureStore.setItemAsync("accessToken", accessToken);
  await SecureStore.setItemAsync("refreshToken", refreshToken);
}

export async function saveUser(user: AuthUser): Promise<void> {
  await SecureStore.setItemAsync("authUser", JSON.stringify(user));
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync("accessToken");
  await SecureStore.deleteItemAsync("refreshToken");
  await SecureStore.deleteItemAsync("authUser");
}

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync("accessToken");
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync("refreshToken");
}

/** Restore session on app start — reads user from SecureStore, validates token is not expired. */
export async function hydrateUser(): Promise<AuthUser | null> {
  try {
    const [token, userJson] = await Promise.all([
      SecureStore.getItemAsync("accessToken"),
      SecureStore.getItemAsync("authUser"),
    ]);
    if (!token || !userJson) return null;

    // Decode JWT payload to check expiry (no external package needed)
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64").toString("utf-8")
    );
    if (Date.now() >= payload.exp * 1000) {
      // Token expired — try refresh
      const newToken = await tryRefreshToken();
      if (!newToken) return null;
    }

    return JSON.parse(userJson) as AuthUser;
  } catch {
    return null;
  }
}

async function tryRefreshToken(): Promise<string | null> {
  try {
    const refreshToken = await SecureStore.getItemAsync("refreshToken");
    if (!refreshToken) return null;
    const res = await axios.post(`${BASE_URL}/api/v1/auth/refresh`, { refreshToken });
    const raw = res.data.data as RawLoginResponse;
    await saveTokens(raw.accessToken, raw.refreshToken);
    return raw.accessToken;
  } catch {
    await clearTokens();
    return null;
  }
}
