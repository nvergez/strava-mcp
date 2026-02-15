import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DatabaseSync } from '../db.js';
import { createLogger } from '../logger.js';
import { getStravaToken, stravaFetch } from '../strava-client.js';

const log = createLogger('tools:athletes');

export function register(server: McpServer, database: DatabaseSync, apiBase: string): void {
  server.registerTool(
    'get_authenticated_athlete',
    {
      title: 'Get Authenticated Athlete',
      description:
        'Get the profile of the currently authenticated athlete, including name, stats, and preferences.',
      inputSchema: {},
    },
    async (_args, extra) => {
      log.info(`tool=get_authenticated_athlete session=${extra.sessionId ?? 'unknown'}`);

      const token = getStravaToken(database, extra.authInfo);

      const data = await stravaFetch(apiBase, token, '/athlete');

      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.registerTool(
    'get_athlete_zones',
    {
      title: 'Get Athlete Zones',
      description: "Get the authenticated athlete's heart rate and power zones configuration.",
      inputSchema: {},
    },
    async (_args, extra) => {
      log.info(`tool=get_athlete_zones session=${extra.sessionId ?? 'unknown'}`);

      const token = getStravaToken(database, extra.authInfo);

      const data = await stravaFetch(apiBase, token, '/athlete/zones');

      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.registerTool(
    'get_athlete_stats',
    {
      title: 'Get Athlete Stats',
      description:
        'Get activity totals and stats for an athlete, including recent, year-to-date, and all-time summaries for running, riding, and swimming.',
      inputSchema: {
        id: z.number().describe('The athlete ID'),
      },
    },
    async (args, extra) => {
      log.info(`tool=get_athlete_stats id=${args.id} session=${extra.sessionId ?? 'unknown'}`);

      const token = getStravaToken(database, extra.authInfo);

      const data = await stravaFetch(apiBase, token, `/athletes/${args.id}/stats`);

      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    },
  );
}
