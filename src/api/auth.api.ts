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

    // ¿Por qué no usamos Buffer.from()?
    // Buffer es una API de Node.js. React Native corre sobre el motor JavaScript
    // Hermes (o JavaScriptCore), NO sobre Node.js, así que Buffer no existe.
    // Usamos atob(), que sí está disponible globalmente en React Native 0.70+.
    //
    // Un JWT tiene 3 partes separadas por puntos: header.payload.signature
    // El payload está en base64url (variante de base64 que usa - en vez de + y _ en vez de /)
    // Necesitamos convertirlo a base64 estándar antes de decodificarlo.
    const base64url = token.split(".")[1];
    const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
    // base64 debe ser múltiplo de 4 caracteres; añadimos padding si falta
    const padded = base64 + "==".slice((base64.length + 3) % 4);
    const payload = JSON.parse(atob(padded)) as { exp: number };

    if (Date.now() >= payload.exp * 1000) {
      // El accessToken venció — intentamos renovarlo silenciosamente con el refreshToken.
      // El usuario NO nota nada; la app sigue funcionando sin pedirle login.
      const newToken = await tryRefreshToken();
      if (!newToken) return null; // refreshToken también venció → hay que hacer login
    }

    return JSON.parse(userJson) as AuthUser;
  } catch {
    // Si algo falla (JWT malformado, SecureStore corrupto, etc.) tratamos como sesión inválida.
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
