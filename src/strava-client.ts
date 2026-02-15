import { z } from 'zod';
import type { DatabaseSync } from './db.js';
import { getAccessToken } from './db.js';

/**
 * Resolves the Strava access token for the current session from the opaque
 * MCP bearer token stored in `extra.authInfo`.
 */
export function getStravaToken(database: DatabaseSync, authInfo?: { token: string }): string {
  if (!authInfo?.token) {
    throw new Error('Not authenticated — no access token in request');
  }
  const stored = getAccessToken(database, authInfo.token);
  if (!stored) {
    throw new Error('Invalid or expired access token');
  }
  return stored.stravaAccessToken;
}

/**
 * Calls a Strava API endpoint and returns the parsed JSON response.
 * Throws on HTTP errors with the Strava error body for debuggability.
 */
export async function stravaFetch(apiBase: string, token: string, path: string): Promise<unknown> {
  const url = `${apiBase}${path}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Strava API error ${response.status}: ${body}`);
  }

  return response.json();
}

/**
 * Calls a Strava API endpoint and returns the raw text response.
 * Used for endpoints that return non-JSON data (e.g. GPX/TCX exports).
 */
export async function stravaFetchText(
  apiBase: string,
  token: string,
  path: string,
): Promise<string> {
  const url = `${apiBase}${path}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Strava API error ${response.status}: ${body}`);
  }

  return response.text();
}

/** Builds a query string from a URLSearchParams, prefixed with '?' if non-empty. */
export function qs(params: URLSearchParams): string {
  const s = params.toString();
  return s ? `?${s}` : '';
}

/** Pagination schema reused across list endpoints. */
export const paginationSchema = {
  page: z.number().int().min(1).optional().describe('Page number (default 1)'),
  per_page: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe('Items per page (default 30, max 200)'),
};

/** Adds pagination params to URLSearchParams if provided. */
export function addPagination(
  params: URLSearchParams,
  args: { page?: number; per_page?: number },
): void {
  if (args.page != null) params.set('page', String(args.page));
  if (args.per_page != null) params.set('per_page', String(args.per_page));
}
