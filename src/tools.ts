import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger } from './logger.js';

const log = createLogger('tools');

export function registerTools(server: McpServer): void {
  server.registerTool(
    'ping',
    { description: 'Returns pong — use this to verify the server is reachable' },
    (extra) => {
      log.info(`tool=ping session=${extra.sessionId ?? 'unknown'}`);
      return { content: [{ type: 'text', text: 'pong' }] };
    },
  );
}
