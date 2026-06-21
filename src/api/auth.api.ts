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

/**
 * PERSISTENCIA DE SESIÓN — se llama una vez al abrir la app.
 *
 * ¿Por qué SecureStore y no AsyncStorage?
 * AsyncStorage escribe en texto plano en el disco del dispositivo.
 * SecureStore usa el Keychain (iOS) o EncryptedSharedPreferences (Android),
 * que son zonas cifradas por el SO y solo accesibles por nuestra app.
 * Los tokens JWT son credenciales sensibles: si alguien extrae el APK o hace
 * backup del dispositivo, con AsyncStorage los robaría fácilmente.
 *
 * ¿Qué hace esta función?
 * 1. Lee el accessToken y el usuario guardado en SecureStore.
 * 2. Decodifica el JWT para saber si ya venció (sin llamar al servidor).
 * 3. Si venció, intenta renovarlo con el refreshToken (token de larga vida).
 * 4. Si la renovación falla, limpia todo y devuelve null → pantalla de login.
 * 5. Si todo está bien, devuelve el usuario y la sesión se restaura.
 */
export async function hydrateUser(): Promise<AuthUser | null> {
  try {
    const [token, userJson] = await Promise.all([
      SecureStore.getItemAsync("accessToken"),
      SecureStore.getItemAsync("authUser"),
    ]);
    if (!token || !userJson) return null;

    // Check expiry by decoding the JWT payload. If decode fails for any reason
    // (Hermes atob quirks on Android, malformed token, etc.) we fall through to
    // refresh rather than crashing or silently logging the user out.
    let isExpired = false;
    try {
      const base64url = token.split(".")[1];
      const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
      // "=".repeat(...) produces correct padding for all cases; the prior
      // "==".slice(n) idiom was wrong for length%4===2 (produces "=" instead of "=="),
      // which Hermes on Android enforces strictly causing a silent catch → logout.
      const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
      const payload = JSON.parse(atob(padded)) as { exp: number };
      isExpired = Date.now() >= payload.exp * 1000;
    } catch {
      // Can't decode — assume expired and try refresh
      isExpired = true;
    }

    if (isExpired) {
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
