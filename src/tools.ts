import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DatabaseSync } from './db.js';
import { register as activities } from './tools/activities.js';
import { register as athletes } from './tools/athletes.js';
import { register as clubs } from './tools/clubs.js';
import { register as gear } from './tools/gear.js';
import { register as routes } from './tools/routes.js';
import { register as segments } from './tools/segments.js';
import { register as streams } from './tools/streams.js';
import { register as uploads } from './tools/uploads.js';

export function registerTools(server: McpServer, database: DatabaseSync, apiBase: string): void {
  activities(server, database, apiBase);
  athletes(server, database, apiBase);
  clubs(server, database, apiBase);
  gear(server, database, apiBase);
  routes(server, database, apiBase);
  segments(server, database, apiBase);
  streams(server, database, apiBase);
  uploads(server, database, apiBase);
}
