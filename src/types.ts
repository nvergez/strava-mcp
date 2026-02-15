// ---------------------------------------------------------------------------
// Domain types shared between the DB layer and the auth provider
// ---------------------------------------------------------------------------

export interface PendingAuthorization {
  codeChallenge: string;
  redirectUri: string;
  mcpState?: string;
  clientId: string;
}

export interface StoredAuthCode {
  stravaAccessToken: string;
  stravaRefreshToken: string;
  stravaExpiresAt: number;
  clientId: string;
  codeChallenge: string;
  scopes: string[];
}

export interface StoredToken {
  clientId: string;
  scopes: string[];
  expiresAt: number;
  stravaAccessToken: string;
  stravaRefreshToken: string;
}
