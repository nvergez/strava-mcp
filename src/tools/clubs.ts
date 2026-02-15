import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DatabaseSync } from '../db.js';
import { createLogger } from '../logger.js';
import {
  getStravaToken,
  stravaFetch,
  qs,
  paginationSchema,
  addPagination,
} from '../strava-client.js';

const log = createLogger('tools:clubs');

export function register(server: McpServer, database: DatabaseSync, apiBase: string): void {
  server.registerTool(
    'get_club',
    {
      title: 'Get Club',
      description:
        'Get details about a specific club, including name, member count, sport type, and location.',
      inputSchema: {
        id: z.number().describe('The club ID'),
      },
    },
    async (args, extra) => {
      log.info(`tool=get_club id=${args.id} session=${extra.sessionId ?? 'unknown'}`);

      const token = getStravaToken(database, extra.authInfo);

      const data = await stravaFetch(apiBase, token, `/clubs/${args.id}`);

      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.registerTool(
    'list_athlete_clubs',
    {
      title: 'List Athlete Clubs',
      description: 'List the clubs the authenticated athlete is a member of.',
      inputSchema: {
        ...paginationSchema,
      },
    },
    async (args, extra) => {
      log.info(`tool=list_athlete_clubs session=${extra.sessionId ?? 'unknown'}`);

      const token = getStravaToken(database, extra.authInfo);

      const params = new URLSearchParams();
      addPagination(params, args);

      const data = await stravaFetch(apiBase, token, `/athlete/clubs${qs(params)}`);

      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.registerTool(
    'list_club_members',
    {
      title: 'List Club Members',
      description: 'List the members of a specific club.',
      inputSchema: {
        id: z.number().describe('The club ID'),
        ...paginationSchema,
      },
    },
    async (args, extra) => {
      log.info(`tool=list_club_members id=${args.id} session=${extra.sessionId ?? 'unknown'}`);

      const token = getStravaToken(database, extra.authInfo);

      const params = new URLSearchParams();
      addPagination(params, args);

      const data = await stravaFetch(apiBase, token, `/clubs/${args.id}/members${qs(params)}`);

      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.registerTool(
    'list_club_admins',
    {
      title: 'List Club Admins',
      description: 'List the administrators of a specific club.',
      inputSchema: {
        id: z.number().describe('The club ID'),
        ...paginationSchema,
      },
    },
    async (args, extra) => {
      log.info(`tool=list_club_admins id=${args.id} session=${extra.sessionId ?? 'unknown'}`);

      const token = getStravaToken(database, extra.authInfo);

      const params = new URLSearchParams();
      addPagination(params, args);

      const data = await stravaFetch(apiBase, token, `/clubs/${args.id}/admins${qs(params)}`);

      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.registerTool(
    'list_club_activities',
    {
      title: 'List Club Activities',
      description: 'List recent activities posted by members of a specific club.',
      inputSchema: {
        id: z.number().describe('The club ID'),
        ...paginationSchema,
      },
    },
    async (args, extra) => {
      log.info(`tool=list_club_activities id=${args.id} session=${extra.sessionId ?? 'unknown'}`);

      const token = getStravaToken(database, extra.authInfo);

      const params = new URLSearchParams();
      addPagination(params, args);

      const data = await stravaFetch(apiBase, token, `/clubs/${args.id}/activities${qs(params)}`);

      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    },
  );
}
