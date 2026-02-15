import { resolve } from 'node:path';
import { createLogger } from './logger.js';

const log = createLogger('config');

export interface Config {
  stravaClientId: string;
  stravaClientSecret: string;
  port: number;
  baseUrl: string;
  dbPath: string;
  stravaAuthorizeUrl: string;
  stravaTokenUrl: string;
  stravaCallbackPath: string;
  scopes: string[];
}

export function loadConfig(): Config {
  const stravaClientId = process.env.STRAVA_CLIENT_ID;
  const stravaClientSecret = process.env.STRAVA_CLIENT_SECRET;

  if (!stravaClientId || !stravaClientSecret) {
    log.error('STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET environment variables are required');
    process.exit(1);
  }

  const port = parseInt(process.env.PORT || '3000', 10);
  const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;

  return {
    stravaClientId,
    stravaClientSecret,
    port,
    baseUrl,
    dbPath: process.env.DB_PATH || resolve('data', 'strava-mcp.db'),
    stravaAuthorizeUrl: 'https://www.strava.com/oauth/authorize',
    stravaTokenUrl: 'https://www.strava.com/api/v3/oauth/token',
    stravaCallbackPath: '/strava/callback',
    scopes: ['read', 'read_all', 'activity:read', 'activity:read_all'],
  };
}
