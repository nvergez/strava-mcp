import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DatabaseSync } from '../db.js';
import { createLogger } from '../logger.js';
import { getStravaToken, stravaFetch, qs } from '../strava-client.js';

const log = createLogger('tools:streams');

const streamKeysSchema = z
  .array(
    z.enum([
      'time',
      'latlng',
      'altitude',
      'heartrate',
      'cadence',
      'watts',
      'temp',
      'velocity_smooth',
      'grade_smooth',
      'distance',
      'moving',
    ]),
  )
  .min(1)
  .describe(
    'Stream types to fetch. Available keys: time, latlng, altitude, heartrate, cadence, watts, temp, velocity_smooth, grade_smooth, distance, moving',
  );

export function register(server: McpServer, database: DatabaseSync, apiBase: string): void {
  server.registerTool(
    'get_activity_streams',
    {
      title: 'Get Activity Streams',
      description:
        'Get time-series data for an activity. Returns arrays of data points for the requested stream types (e.g. heart rate, power, GPS coordinates). Warning: responses can be large for long activities — request only the stream keys you need.',
      inputSchema: {
        id: z.number().describe('The activity ID'),
        keys: streamKeysSchema,
        key_by_type: z
          .boolean()
          .optional()
          .describe('Key the result by stream type (default true)'),
      },
    },
    async (args, extra) => {
      log.info(`tool=get_activity_streams id=${args.id} session=${extra.sessionId ?? 'unknown'}`);

      const token = getStravaToken(database, extra.authInfo);

      const params = new URLSearchParams();
      params.set('keys', args.keys.join(','));
      if (args.key_by_type != null) params.set('key_by_type', String(args.key_by_type));

      const data = await stravaFetch(apiBase, token, `/activities/${args.id}/streams${qs(params)}`);

      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.registerTool(
    'get_route_streams',
    {
      title: 'Get Route Streams',
      description:
        'Get time-series data for a route (latlng, altitude, distance). Warning: responses can be large for long routes.',
      inputSchema: {
        id: z.number().describe('The route ID'),
      },
    },
    async (args, extra) => {
      log.info(`tool=get_route_streams id=${args.id} session=${extra.sessionId ?? 'unknown'}`);

      const token = getStravaToken(database, extra.authInfo);

      const data = await stravaFetch(apiBase, token, `/routes/${args.id}/streams`);

      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.registerTool(
    'get_segment_effort_streams',
    {
      title: 'Get Segment Effort Streams',
      description:
        'Get time-series data for a specific segment effort. Warning: responses can be large — request only the stream keys you need.',
      inputSchema: {
        id: z.number().describe('The segment effort ID'),
        keys: streamKeysSchema,
        key_by_type: z
          .boolean()
          .optional()
          .describe('Key the result by stream type (default true)'),
      },
    },
    async (args, extra) => {
      log.info(
        `tool=get_segment_effort_streams id=${args.id} session=${extra.sessionId ?? 'unknown'}`,
      );

      const token = getStravaToken(database, extra.authInfo);

      const params = new URLSearchParams();
      params.set('keys', args.keys.join(','));
      if (args.key_by_type != null) params.set('key_by_type', String(args.key_by_type));

      const data = await stravaFetch(
        apiBase,
        token,
        `/segment_efforts/${args.id}/streams${qs(params)}`,
      );

      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.registerTool(
    'get_segment_streams',
    {
      title: 'Get Segment Streams',
      description:
        'Get time-series data for a segment (latlng, altitude, distance). Warning: responses can be large for long segments.',
      inputSchema: {
        id: z.number().describe('The segment ID'),
        keys: z
          .array(z.enum(['latlng', 'altitude', 'distance']))
          .min(1)
          .describe('Stream types to fetch. Available keys: latlng, altitude, distance'),
        key_by_type: z
          .boolean()
          .optional()
          .describe('Key the result by stream type (default true)'),
      },
    },
    async (args, extra) => {
      log.info(`tool=get_segment_streams id=${args.id} session=${extra.sessionId ?? 'unknown'}`);

      const token = getStravaToken(database, extra.authInfo);

      const params = new URLSearchParams();
      params.set('keys', args.keys.join(','));
      if (args.key_by_type != null) params.set('key_by_type', String(args.key_by_type));

      const data = await stravaFetch(apiBase, token, `/segments/${args.id}/streams${qs(params)}`);

      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    },
  );
}
