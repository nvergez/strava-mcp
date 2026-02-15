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

const log = createLogger('tools:segments');

export function register(server: McpServer, database: DatabaseSync, apiBase: string): void {
  server.registerTool(
    'get_segment',
    {
      title: 'Get Segment',
      description:
        'Get detailed information about a specific segment, including distance, elevation, climb category, and map.',
      inputSchema: {
        id: z.number().describe('The segment ID'),
      },
    },
    async (args, extra) => {
      log.info(`tool=get_segment id=${args.id} session=${extra.sessionId ?? 'unknown'}`);

      const token = getStravaToken(database, extra.authInfo);

      const data = await stravaFetch(apiBase, token, `/segments/${args.id}`);

      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.registerTool(
    'explore_segments',
    {
      title: 'Explore Segments',
      description:
        'Find popular segments within a geographic bounding box. Useful for discovering segments in a specific area.',
      inputSchema: {
        bounds: z
          .string()
          .describe(
            'Bounding box as "south_lat,west_lng,north_lat,east_lng" (e.g. "37.821362,-122.505373,37.842038,-122.465977")',
          ),
        activity_type: z
          .enum(['running', 'riding'])
          .optional()
          .describe('Filter by activity type: "running" or "riding"'),
        min_cat: z
          .number()
          .int()
          .min(0)
          .max(5)
          .optional()
          .describe('Minimum climb category (0-5, where 0 is the steepest)'),
        max_cat: z
          .number()
          .int()
          .min(0)
          .max(5)
          .optional()
          .describe('Maximum climb category (0-5, where 0 is the steepest)'),
      },
    },
    async (args, extra) => {
      log.info(`tool=explore_segments session=${extra.sessionId ?? 'unknown'}`);

      const token = getStravaToken(database, extra.authInfo);

      const params = new URLSearchParams();
      params.set('bounds', args.bounds);
      if (args.activity_type) params.set('activity_type', args.activity_type);
      if (args.min_cat != null) params.set('min_cat', String(args.min_cat));
      if (args.max_cat != null) params.set('max_cat', String(args.max_cat));

      const data = await stravaFetch(apiBase, token, `/segments/explore${qs(params)}`);

      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.registerTool(
    'list_starred_segments',
    {
      title: 'List Starred Segments',
      description: 'List segments starred by the authenticated athlete.',
      inputSchema: {
        ...paginationSchema,
      },
    },
    async (args, extra) => {
      log.info(`tool=list_starred_segments session=${extra.sessionId ?? 'unknown'}`);

      const token = getStravaToken(database, extra.authInfo);

      const params = new URLSearchParams();
      addPagination(params, args);

      const data = await stravaFetch(apiBase, token, `/segments/starred${qs(params)}`);

      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.registerTool(
    'get_segment_effort',
    {
      title: 'Get Segment Effort',
      description:
        'Get a specific segment effort by its ID, including timing, speed, heart rate, and power data.',
      inputSchema: {
        id: z.number().describe('The segment effort ID'),
      },
    },
    async (args, extra) => {
      log.info(`tool=get_segment_effort id=${args.id} session=${extra.sessionId ?? 'unknown'}`);

      const token = getStravaToken(database, extra.authInfo);

      const data = await stravaFetch(apiBase, token, `/segment_efforts/${args.id}`);

      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.registerTool(
    'list_segment_efforts',
    {
      title: 'List Segment Efforts',
      description:
        "List efforts on a given segment, optionally filtered by date range. Returns the authenticated athlete's efforts by default.",
      inputSchema: {
        segment_id: z.number().describe('The segment ID'),
        start_date_local: z
          .string()
          .optional()
          .describe('Filter: only efforts after this ISO 8601 date (e.g. "2024-01-01T00:00:00Z")'),
        end_date_local: z
          .string()
          .optional()
          .describe('Filter: only efforts before this ISO 8601 date (e.g. "2024-12-31T23:59:59Z")'),
        per_page: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe('Items per page (default 30, max 200)'),
      },
    },
    async (args, extra) => {
      log.info(
        `tool=list_segment_efforts segment_id=${args.segment_id} session=${extra.sessionId ?? 'unknown'}`,
      );

      const token = getStravaToken(database, extra.authInfo);

      const params = new URLSearchParams();
      if (args.start_date_local) params.set('start_date_local', args.start_date_local);
      if (args.end_date_local) params.set('end_date_local', args.end_date_local);
      if (args.per_page != null) params.set('per_page', String(args.per_page));

      const data = await stravaFetch(
        apiBase,
        token,
        `/segments/${args.segment_id}/all_efforts${qs(params)}`,
      );

      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    },
  );
}
