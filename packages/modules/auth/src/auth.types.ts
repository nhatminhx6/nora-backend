export interface JwtPayload {
  sub: string;
  email: string;
}

export interface JwtUser {
  id: string;
  email: string;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: AuthUser;
}
