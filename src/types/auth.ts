export interface LoginRequest {
  email: string;
  password: string;
}

/** Exact shape returned by POST /api/v1/auth/login (flat, inside ApiResponse.data) */
export interface RawLoginResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  userId: string;
  tenantId: string;
  email: string;
  fullName: string;
  totpEnabled: boolean;
  requiresMfa: boolean;
  mfaToken?: string;
  permissions: string[];
  roles: string[];
  superAdmin: boolean;
  avatarUrl?: string;
}

/** Internal user object stored in Zustand and SecureStore */
export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  tenantId: string;
  roles: string[];
  permissions: string[];
  superAdmin: boolean;
  avatarUrl?: string;
  totpEnabled: boolean;
}
