import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DatabaseSync } from './db.js';
import { getAccessToken } from './db.js';
import { createLogger } from './logger.js';

const log = createLogger('tools');

/**
 * Resolves the Strava access token for the current session from the opaque
 * MCP bearer token stored in `extra.authInfo`.
 */
function getStravaToken(database: DatabaseSync, authInfo?: { token: string }): string {
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
async function stravaFetch(apiBase: string, token: string, path: string): Promise<unknown> {
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

export function registerTools(server: McpServer, database: DatabaseSync, apiBase: string): void {
  server.registerTool(
    'get_activity',
    {
      title: 'Get Activity',
      description:
        'Get detailed information about a specific Strava activity, including distance, time, elevation, map, splits, and segment efforts.',
      inputSchema: {
        id: z.number().describe('The unique identifier of the activity'),
        include_all_efforts: z
          .boolean()
          .optional()
          .describe(
            'Include all segment efforts in the response (default false). When true, every segment effort is returned rather than just the most notable.',
          ),
      },
    },
    async (args, extra) => {
      log.info(`tool=get_activity id=${args.id} session=${extra.sessionId ?? 'unknown'}`);

      const token = getStravaToken(database, extra.authInfo);

      const params = new URLSearchParams();
      if (args.include_all_efforts) {
        params.set('include_all_efforts', 'true');
      }
      const qs = params.toString();
      const path = `/activities/${args.id}${qs ? `?${qs}` : ''}`;

      const data = await stravaFetch(apiBase, token, path);

      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    },
  );
}
