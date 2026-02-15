import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DatabaseSync } from '../db.js';
import { createLogger } from '../logger.js';
import {
  getStravaToken,
  stravaFetch,
  stravaFetchText,
  qs,
  paginationSchema,
  addPagination,
} from '../strava-client.js';

const log = createLogger('tools:routes');

export function register(server: McpServer, database: DatabaseSync, apiBase: string): void {
  server.registerTool(
    'get_route',
    {
      title: 'Get Route',
      description:
        'Get details about a specific route, including name, distance, elevation gain, and map.',
      inputSchema: {
        id: z.number().describe('The route ID'),
      },
    },
    async (args, extra) => {
      log.info(`tool=get_route id=${args.id} session=${extra.sessionId ?? 'unknown'}`);

      const token = getStravaToken(database, extra.authInfo);

      const data = await stravaFetch(apiBase, token, `/routes/${args.id}`);

      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.registerTool(
    'list_athlete_routes',
    {
      title: 'List Athlete Routes',
      description: 'List routes created by a specific athlete.',
      inputSchema: {
        id: z.number().describe('The athlete ID'),
        ...paginationSchema,
      },
    },
    async (args, extra) => {
      log.info(`tool=list_athlete_routes id=${args.id} session=${extra.sessionId ?? 'unknown'}`);

      const token = getStravaToken(database, extra.authInfo);

      const params = new URLSearchParams();
      addPagination(params, args);

      const data = await stravaFetch(apiBase, token, `/athletes/${args.id}/routes${qs(params)}`);

      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.registerTool(
    'export_route_gpx',
    {
      title: 'Export Route as GPX',
      description:
        'Export a route as a GPX file. Returns raw GPX/XML content. Note: the response can be large for complex routes.',
      inputSchema: {
        id: z.number().describe('The route ID'),
      },
    },
    async (args, extra) => {
      log.info(`tool=export_route_gpx id=${args.id} session=${extra.sessionId ?? 'unknown'}`);

      const token = getStravaToken(database, extra.authInfo);

      const xml = await stravaFetchText(apiBase, token, `/routes/${args.id}/export_gpx`);

      return {
        content: [{ type: 'text', text: xml }],
      };
    },
  );

  server.registerTool(
    'export_route_tcx',
    {
      title: 'Export Route as TCX',
      description:
        'Export a route as a TCX file. Returns raw TCX/XML content. Note: the response can be large for complex routes.',
      inputSchema: {
        id: z.number().describe('The route ID'),
      },
    },
    async (args, extra) => {
      log.info(`tool=export_route_tcx id=${args.id} session=${extra.sessionId ?? 'unknown'}`);

      const token = getStravaToken(database, extra.authInfo);

      const xml = await stravaFetchText(apiBase, token, `/routes/${args.id}/export_tcx`);

      return {
        content: [{ type: 'text', text: xml }],
      };
    },
  );
}
