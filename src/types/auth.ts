export interface LoginRequest {
  email: string;
  password: string;
  totpCode?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  tenantId: string;
  avatarUrl?: string;
}

export interface LoginResponse {
  user: AuthUser;
  tokens: AuthTokens;
}
