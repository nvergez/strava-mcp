import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DatabaseSync } from '../db.js';
import { createLogger } from '../logger.js';
import { getStravaToken, stravaFetch } from '../strava-client.js';

const log = createLogger('tools:gear');

export function register(server: McpServer, database: DatabaseSync, apiBase: string): void {
  server.registerTool(
    'get_gear',
    {
      title: 'Get Gear',
      description:
        'Get details about a specific piece of equipment (shoes, bike, etc.), including brand, model, and distance.',
      inputSchema: {
        id: z.string().describe('The gear ID (e.g. "b12345" for bikes, "g12345" for shoes)'),
      },
    },
    async (args, extra) => {
      log.info(`tool=get_gear id=${args.id} session=${extra.sessionId ?? 'unknown'}`);

      const token = getStravaToken(database, extra.authInfo);

      const data = await stravaFetch(apiBase, token, `/gear/${args.id}`);

      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    },
  );
}
