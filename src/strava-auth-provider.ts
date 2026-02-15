import { randomUUID, randomBytes } from 'node:crypto';
import type { Response } from 'express';
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type {
  OAuthClientInformationFull,
  OAuthTokens,
  OAuthTokenRevocationRequest,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import type { DatabaseSync } from './db.js';
import * as db from './db.js';
import { createLogger } from './logger.js';

const log = createLogger('auth');

export interface StravaConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
}

class SqliteClientsStore implements OAuthRegisteredClientsStore {
  constructor(private database: DatabaseSync) {}

  getClient(clientId: string): OAuthClientInformationFull | undefined {
    const data = db.getClient(this.database, clientId);
    if (!data) return undefined;
    return data as unknown as OAuthClientInformationFull;
  }

  registerClient(
    client: Omit<OAuthClientInformationFull, 'client_id' | 'client_id_issued_at'>,
  ): OAuthClientInformationFull {
    const fullClient: OAuthClientInformationFull = {
      ...client,
      client_id: randomUUID(),
      client_id_issued_at: Math.floor(Date.now() / 1000),
    };
    db.saveClient(
      this.database,
      fullClient.client_id,
      fullClient as unknown as Record<string, unknown>,
    );
    return fullClient;
  }
}

export class StravaOAuthProvider implements OAuthServerProvider {
  private _clientsStore: SqliteClientsStore;

  constructor(
    private config: StravaConfig,
    private database: DatabaseSync,
  ) {
    this._clientsStore = new SqliteClientsStore(database);
  }

  get clientsStore(): OAuthRegisteredClientsStore {
    return this._clientsStore;
  }

  /**
   * Begins authorization by storing PKCE challenge locally and redirecting to Strava.
   * Strava doesn't support PKCE, so we handle it ourselves.
   */
  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    // Generate a state parameter for the Strava request that maps back to the MCP flow
    const stravaState = randomBytes(32).toString('hex');

    // Store the pending authorization so we can complete the flow in the callback
    db.savePendingAuth(this.database, stravaState, {
      codeChallenge: params.codeChallenge,
      redirectUri: params.redirectUri,
      mcpState: params.state,
      clientId: client.client_id,
    });

    // Redirect to Strava OAuth (no PKCE — Strava doesn't support it)
    const stravaAuthUrl = new URL(this.config.authorizeUrl);
    stravaAuthUrl.searchParams.set('client_id', this.config.clientId);
    stravaAuthUrl.searchParams.set('redirect_uri', this.config.callbackUrl);
    stravaAuthUrl.searchParams.set('response_type', 'code');
    stravaAuthUrl.searchParams.set('approval_prompt', 'auto');
    stravaAuthUrl.searchParams.set('scope', this.config.scopes.join(','));
    stravaAuthUrl.searchParams.set('state', stravaState);

    log.info(`Starting Strava authorization for client ${client.client_id}`);
    res.redirect(stravaAuthUrl.toString());
  }

  /**
   * Returns the stored PKCE challenge for SDK-side validation.
   */
  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const stored = db.getAuthCode(this.database, authorizationCode);
    if (!stored) {
      throw new Error('Unknown authorization code');
    }
    return stored.codeChallenge;
  }

  /**
   * Returns the Strava tokens we already exchanged during the callback.
   * The SDK has already validated PKCE by this point.
   */
  async exchangeAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<OAuthTokens> {
    const stored = db.getAuthCode(this.database, authorizationCode);
    if (!stored) {
      throw new Error('Unknown authorization code');
    }

    // Remove the code — it's single-use
    db.deleteAuthCode(this.database, authorizationCode);

    // Store the access token for later verification
    db.saveAccessToken(this.database, stored.stravaAccessToken, {
      clientId: stored.clientId,
      scopes: stored.scopes,
      expiresAt: stored.stravaExpiresAt,
      stravaRefreshToken: stored.stravaRefreshToken,
    });

    return {
      access_token: stored.stravaAccessToken,
      token_type: 'bearer',
      expires_in: stored.stravaExpiresAt - Math.floor(Date.now() / 1000),
      refresh_token: stored.stravaRefreshToken,
      scope: stored.scopes.join(','),
    };
  }

  /**
   * Refreshes tokens by calling Strava's token endpoint.
   */
  async exchangeRefreshToken(
    _client: OAuthClientInformationFull,
    refreshToken: string,
  ): Promise<OAuthTokens> {
    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      log.error(`Strava token refresh failed: ${response.status} ${errorBody}`);
      throw new Error(`Strava token refresh failed: ${response.status} ${errorBody}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      expires_at: number;
      expires_in: number;
    };

    // Update stored token
    db.saveAccessToken(this.database, data.access_token, {
      clientId: _client.client_id,
      scopes: this.config.scopes,
      expiresAt: data.expires_at,
      stravaRefreshToken: data.refresh_token,
    });

    return {
      access_token: data.access_token,
      token_type: 'bearer',
      expires_in: data.expires_in,
      refresh_token: data.refresh_token,
    };
  }

  /**
   * Validates that a token exists and is not expired.
   */
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const stored = db.getAccessToken(this.database, token);
    if (!stored) {
      throw new Error('Invalid access token');
    }

    const now = Math.floor(Date.now() / 1000);
    if (stored.expiresAt <= now) {
      log.debug(`Removing expired access token for client ${stored.clientId}`);
      db.deleteAccessToken(this.database, token);
      throw new Error('Access token expired');
    }

    return {
      token,
      clientId: stored.clientId,
      scopes: stored.scopes,
      expiresAt: stored.expiresAt,
    };
  }

  async revokeToken(
    _client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ): Promise<void> {
    db.deleteAccessToken(this.database, request.token);
  }

  /**
   * Called by the /strava/callback route after Strava redirects back.
   * Exchanges the Strava auth code for tokens, generates our own auth code,
   * and redirects the MCP client.
   */
  async handleStravaCallback(
    stravaCode: string,
    stravaState: string,
  ): Promise<{ redirectUri: string }> {
    log.info(`Processing Strava callback (state=${stravaState.slice(0, 8)}...)`);
    const pending = db.getPendingAuth(this.database, stravaState);
    if (!pending) {
      throw new Error('Unknown state parameter — possible CSRF or expired session');
    }
    db.deletePendingAuth(this.database, stravaState);

    // Exchange the Strava auth code for tokens
    const tokenResponse = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code: stravaCode,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      throw new Error(`Strava token exchange failed: ${tokenResponse.status} ${errorBody}`);
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token: string;
      expires_at: number;
      expires_in: number;
      athlete: unknown;
    };

    // Generate our own authorization code that the MCP client will exchange
    const ourCode = randomBytes(32).toString('hex');

    db.saveAuthCode(this.database, ourCode, {
      stravaAccessToken: tokenData.access_token,
      stravaRefreshToken: tokenData.refresh_token,
      stravaExpiresAt: tokenData.expires_at,
      clientId: pending.clientId,
      codeChallenge: pending.codeChallenge,
      scopes: this.config.scopes,
    });

    // Build the redirect back to the MCP client
    const redirectUrl = new URL(pending.redirectUri);
    redirectUrl.searchParams.set('code', ourCode);
    if (pending.mcpState) {
      redirectUrl.searchParams.set('state', pending.mcpState);
    }

    log.info(`Authorization complete for client ${pending.clientId}`);
    return { redirectUri: redirectUrl.toString() };
  }
}
