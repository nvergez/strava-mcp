import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import type { PendingAuthorization, StoredAuthCode, StoredToken } from './types.js';
import { createLogger } from './logger.js';

const log = createLogger('db');

// Re-export the type so consumers don't need to import from node:sqlite
export type { DatabaseSync };
export type { PendingAuthorization, StoredAuthCode, StoredToken } from './types.js';

// ---------------------------------------------------------------------------
// Row shapes returned by SQLite queries (columns use snake_case)
// ---------------------------------------------------------------------------

interface ClientRow {
  client_id: string;
  client_data: string; // JSON
  created_at: number;
}

interface PendingAuthRow {
  state: string;
  code_challenge: string;
  redirect_uri: string;
  mcp_state: string | null;
  client_id: string;
  created_at: number;
}

interface AuthCodeRow {
  code: string;
  strava_access_token: string;
  strava_refresh_token: string;
  strava_expires_at: number;
  client_id: string;
  code_challenge: string;
  scopes: string; // JSON array
  created_at: number;
}

interface AccessTokenRow {
  token: string;
  client_id: string;
  scopes: string; // JSON array
  expires_at: number;
  strava_access_token: string;
  strava_refresh_token: string;
}

// ---------------------------------------------------------------------------
// Database initialization
// ---------------------------------------------------------------------------

export function initDb(dbPath: string): DatabaseSync {
  const dir = dirname(dbPath);
  mkdirSync(dir, { recursive: true });
  chmodSync(dir, 0o700);

  log.info(`Database opened at ${dbPath}`);
  const db = new DatabaseSync(dbPath);
  chmodSync(dbPath, 0o600);

  db.exec(`
    CREATE TABLE IF NOT EXISTS oauth_clients (
      client_id  TEXT PRIMARY KEY,
      client_data TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pending_authorizations (
      state          TEXT PRIMARY KEY,
      code_challenge TEXT NOT NULL,
      redirect_uri   TEXT NOT NULL,
      mcp_state      TEXT,
      client_id      TEXT NOT NULL,
      created_at     INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS authorization_codes (
      code                 TEXT PRIMARY KEY,
      strava_access_token  TEXT NOT NULL,
      strava_refresh_token TEXT NOT NULL,
      strava_expires_at    INTEGER NOT NULL,
      client_id            TEXT NOT NULL,
      code_challenge       TEXT NOT NULL,
      scopes               TEXT NOT NULL,
      created_at           INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS access_tokens (
      token                TEXT PRIMARY KEY,
      client_id            TEXT NOT NULL,
      scopes               TEXT NOT NULL,
      expires_at           INTEGER NOT NULL,
      strava_access_token  TEXT NOT NULL,
      strava_refresh_token TEXT NOT NULL
    );
  `);

  return db;
}

// ---------------------------------------------------------------------------
// OAuth clients
// ---------------------------------------------------------------------------

export function getClient(db: DatabaseSync, clientId: string): Record<string, unknown> | undefined {
  const row = db
    .prepare('SELECT client_data FROM oauth_clients WHERE client_id = ?')
    .get(clientId) as ClientRow | undefined;
  if (!row) return undefined;
  return JSON.parse(row.client_data) as Record<string, unknown>;
}

export function saveClient(
  db: DatabaseSync,
  clientId: string,
  clientData: Record<string, unknown>,
): void {
  db.prepare(
    'INSERT OR REPLACE INTO oauth_clients (client_id, client_data, created_at) VALUES (?, ?, ?)',
  ).run(clientId, JSON.stringify(clientData), Math.floor(Date.now() / 1000));
}

// ---------------------------------------------------------------------------
// TTL constants (seconds)
// ---------------------------------------------------------------------------

const PENDING_AUTH_TTL = 10 * 60; // 10 minutes
const AUTH_CODE_TTL = 60; // 60 seconds

// ---------------------------------------------------------------------------
// Pending authorizations
// ---------------------------------------------------------------------------

export function getPendingAuth(db: DatabaseSync, state: string): PendingAuthorization | undefined {
  const row = db.prepare('SELECT * FROM pending_authorizations WHERE state = ?').get(state) as
    | PendingAuthRow
    | undefined;
  if (!row) return undefined;

  const now = Math.floor(Date.now() / 1000);
  if (now - row.created_at > PENDING_AUTH_TTL) {
    db.prepare('DELETE FROM pending_authorizations WHERE state = ?').run(state);
    return undefined;
  }

  return {
    codeChallenge: row.code_challenge,
    redirectUri: row.redirect_uri,
    mcpState: row.mcp_state ?? undefined,
    clientId: row.client_id,
  };
}

export function savePendingAuth(db: DatabaseSync, state: string, data: PendingAuthorization): void {
  db.prepare(
    `INSERT INTO pending_authorizations
       (state, code_challenge, redirect_uri, mcp_state, client_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    state,
    data.codeChallenge,
    data.redirectUri,
    data.mcpState ?? null,
    data.clientId,
    Math.floor(Date.now() / 1000),
  );
}

export function deletePendingAuth(db: DatabaseSync, state: string): void {
  db.prepare('DELETE FROM pending_authorizations WHERE state = ?').run(state);
}

// ---------------------------------------------------------------------------
// Authorization codes
// ---------------------------------------------------------------------------

export function getAuthCode(db: DatabaseSync, code: string): StoredAuthCode | undefined {
  const row = db.prepare('SELECT * FROM authorization_codes WHERE code = ?').get(code) as
    | AuthCodeRow
    | undefined;
  if (!row) return undefined;

  const now = Math.floor(Date.now() / 1000);
  if (now - row.created_at > AUTH_CODE_TTL) {
    db.prepare('DELETE FROM authorization_codes WHERE code = ?').run(code);
    return undefined;
  }

  return {
    stravaAccessToken: row.strava_access_token,
    stravaRefreshToken: row.strava_refresh_token,
    stravaExpiresAt: row.strava_expires_at,
    clientId: row.client_id,
    codeChallenge: row.code_challenge,
    scopes: JSON.parse(row.scopes) as string[],
  };
}

export function saveAuthCode(db: DatabaseSync, code: string, data: StoredAuthCode): void {
  db.prepare(
    `INSERT INTO authorization_codes
       (code, strava_access_token, strava_refresh_token, strava_expires_at,
        client_id, code_challenge, scopes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    code,
    data.stravaAccessToken,
    data.stravaRefreshToken,
    data.stravaExpiresAt,
    data.clientId,
    data.codeChallenge,
    JSON.stringify(data.scopes),
    Math.floor(Date.now() / 1000),
  );
}

export function deleteAuthCode(db: DatabaseSync, code: string): void {
  db.prepare('DELETE FROM authorization_codes WHERE code = ?').run(code);
}

// ---------------------------------------------------------------------------
// Access tokens
// ---------------------------------------------------------------------------

export function getAccessToken(db: DatabaseSync, token: string): StoredToken | undefined {
  const row = db.prepare('SELECT * FROM access_tokens WHERE token = ?').get(token) as
    | AccessTokenRow
    | undefined;
  if (!row) return undefined;
  return {
    clientId: row.client_id,
    scopes: JSON.parse(row.scopes) as string[],
    expiresAt: row.expires_at,
    stravaAccessToken: row.strava_access_token,
    stravaRefreshToken: row.strava_refresh_token,
  };
}

export function saveAccessToken(db: DatabaseSync, token: string, data: StoredToken): void {
  db.prepare(
    `INSERT OR REPLACE INTO access_tokens
       (token, client_id, scopes, expires_at, strava_access_token, strava_refresh_token)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    token,
    data.clientId,
    JSON.stringify(data.scopes),
    data.expiresAt,
    data.stravaAccessToken,
    data.stravaRefreshToken,
  );
}

export function deleteAccessToken(db: DatabaseSync, token: string): void {
  db.prepare('DELETE FROM access_tokens WHERE token = ?').run(token);
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

export function deleteExpiredRecords(db: DatabaseSync): number {
  const now = Math.floor(Date.now() / 1000);
  const tokens = db.prepare('DELETE FROM access_tokens WHERE expires_at <= ?').run(now);
  const pending = db
    .prepare('DELETE FROM pending_authorizations WHERE created_at <= ?')
    .run(now - PENDING_AUTH_TTL);
  const codes = db
    .prepare('DELETE FROM authorization_codes WHERE created_at <= ?')
    .run(now - AUTH_CODE_TTL);
  return Number(tokens.changes) + Number(pending.changes) + Number(codes.changes);
}
