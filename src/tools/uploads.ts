import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DatabaseSync } from '../db.js';
import { createLogger } from '../logger.js';
import { getStravaToken, stravaFetch } from '../strava-client.js';

const log = createLogger('tools:uploads');

export function register(server: McpServer, database: DatabaseSync, apiBase: string): void {
  server.registerTool(
    'get_upload_status',
    {
      title: 'Get Upload Status',
      description:
        'Check the processing status of an uploaded activity. Returns the upload status, any errors, and the resulting activity ID once processing is complete.',
      inputSchema: {
        id: z.number().describe('The upload ID'),
      },
    },
    async (args, extra) => {
      log.info(`tool=get_upload_status id=${args.id} session=${extra.sessionId ?? 'unknown'}`);

      const token = getStravaToken(database, extra.authInfo);

      const data = await stravaFetch(apiBase, token, `/uploads/${args.id}`);

      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    },
  );
}
