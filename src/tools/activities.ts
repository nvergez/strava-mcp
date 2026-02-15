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
  parseISOToEpoch,
} from '../strava-client.js';

const log = createLogger('tools:activities');

export function register(server: McpServer, database: DatabaseSync, apiBase: string): void {
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
      const path = `/activities/${args.id}${qs(params)}`;

      const data = await stravaFetch(apiBase, token, path);

      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.registerTool(
    'list_athlete_activities',
    {
      title: 'List Athlete Activities',
      description:
        "List the authenticated athlete's activities. Results are sorted newest-first. Use before/after ISO 8601 dates to filter by date range. Strava rate limits apply (100 req/15 min, 1000/day).",
      inputSchema: {
        before: z
          .string()
          .optional()
          .describe(
            'Only return activities before this date (ISO 8601, e.g. "2026-02-09" or "2026-02-09T00:00:00Z")',
          ),
        after: z
          .string()
          .optional()
          .describe(
            'Only return activities after this date (ISO 8601, e.g. "2026-02-01" or "2026-02-01T00:00:00Z")',
          ),
        ...paginationSchema,
      },
    },
    async (args, extra) => {
      log.info(`tool=list_athlete_activities session=${extra.sessionId ?? 'unknown'}`);

      const token = getStravaToken(database, extra.authInfo);

      const params = new URLSearchParams();
      if (args.before != null) params.set('before', String(parseISOToEpoch(args.before)));
      if (args.after != null) params.set('after', String(parseISOToEpoch(args.after)));
      addPagination(params, args);

      const data = await stravaFetch(apiBase, token, `/athlete/activities${qs(params)}`);

      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.registerTool(
    'get_activity_comments',
    {
      title: 'Get Activity Comments',
      description:
        'List comments on an activity. Returns paginated results with cursor-based navigation.',
      inputSchema: {
        id: z.number().describe('The activity ID'),
        after_cursor: z
          .string()
          .optional()
          .describe("Cursor for pagination — value from the previous response's next_cursor field"),
        ...paginationSchema,
      },
    },
    async (args, extra) => {
      log.info(`tool=get_activity_comments id=${args.id} session=${extra.sessionId ?? 'unknown'}`);

      const token = getStravaToken(database, extra.authInfo);

      const params = new URLSearchParams();
      if (args.after_cursor) params.set('after_cursor', args.after_cursor);
      addPagination(params, args);

      const data = await stravaFetch(
        apiBase,
        token,
        `/activities/${args.id}/comments${qs(params)}`,
      );

      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.registerTool(
    'get_activity_kudos',
    {
      title: 'Get Activity Kudos',
      description: 'List athletes who gave kudos on an activity.',
      inputSchema: {
        id: z.number().describe('The activity ID'),
        ...paginationSchema,
      },
    },
    async (args, extra) => {
      log.info(`tool=get_activity_kudos id=${args.id} session=${extra.sessionId ?? 'unknown'}`);

      const token = getStravaToken(database, extra.authInfo);

      const params = new URLSearchParams();
      addPagination(params, args);

      const data = await stravaFetch(apiBase, token, `/activities/${args.id}/kudos${qs(params)}`);

      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.registerTool(
    'get_activity_laps',
    {
      title: 'Get Activity Laps',
      description:
        'Get lap data for an activity. Returns auto-detected or manual laps with timing, distance, speed, and other metrics.',
      inputSchema: {
        id: z.number().describe('The activity ID'),
      },
    },
    async (args, extra) => {
      log.info(`tool=get_activity_laps id=${args.id} session=${extra.sessionId ?? 'unknown'}`);

      const token = getStravaToken(database, extra.authInfo);

      const data = await stravaFetch(apiBase, token, `/activities/${args.id}/laps`);

      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.registerTool(
    'get_activity_zones',
    {
      title: 'Get Activity Zones',
      description:
        'Get heart rate and power zone distribution for an activity. Requires the activity to have heart rate or power data.',
      inputSchema: {
        id: z.number().describe('The activity ID'),
      },
    },
    async (args, extra) => {
      log.info(`tool=get_activity_zones id=${args.id} session=${extra.sessionId ?? 'unknown'}`);

      const token = getStravaToken(database, extra.authInfo);

      const data = await stravaFetch(apiBase, token, `/activities/${args.id}/zones`);

      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    },
  );
}
