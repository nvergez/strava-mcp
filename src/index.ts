import { randomUUID } from 'node:crypto';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { StravaOAuthProvider } from './strava-auth-provider.js';
import { initDb, deleteExpiredRecords } from './db.js';
import { loadConfig } from './config.js';
import { registerTools } from './tools.js';
import { createLogger } from './logger.js';

const log = createLogger('server');

const config = loadConfig();
const database = initDb(config.dbPath);

const provider = new StravaOAuthProvider(
  {
    clientId: config.stravaClientId,
    clientSecret: config.stravaClientSecret,
    callbackUrl: `${config.baseUrl}${config.stravaCallbackPath}`,
    authorizeUrl: config.stravaAuthorizeUrl,
    tokenUrl: config.stravaTokenUrl,
    scopes: config.scopes,
  },
  database,
);

const app = express();

// Trust the first proxy (Fly.io reverse proxy) so X-Forwarded-For is used for
// rate limiting and req.ip reflects the real client address.
app.set('trust proxy', 1);

// Health check for load balancers / Fly.io
app.get('/healthz', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Rate limiting for auth endpoints (applies to /authorize, /token, /register, /strava/callback)
const authLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  limit: 50,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});
app.use(['/authorize', '/token', '/register', '/strava/callback'], authLimiter);

// Mount the OAuth auth router at the root (handles /authorize, /token, /register,
// /.well-known/oauth-authorization-server, /.well-known/oauth-protected-resource)
app.use(
  mcpAuthRouter({
    provider,
    issuerUrl: new URL(config.baseUrl),
    scopesSupported: config.scopes,
  }),
);

// Strava OAuth callback — Strava redirects here after user consent
app.get('/strava/callback', async (req, res) => {
  const { code, state, error } = req.query as Record<string, string | undefined>;

  if (error) {
    res.status(400).type('text/plain').send(`Strava authorization error: ${error}`);
    return;
  }

  if (!code || !state) {
    res.status(400).send('Missing code or state parameter');
    return;
  }

  try {
    const result = await provider.handleStravaCallback(code, state);
    res.redirect(result.redirectUri);
  } catch (err) {
    log.error('Strava callback error:', err);
    res.status(500).send('Authorization failed');
  }
});

// Bearer auth middleware for MCP endpoints
const bearerAuth = requireBearerAuth({ verifier: provider });

// MCP transport management: LRU cache of transports, capped at MAX_SESSIONS.
// When a client sends an unknown session ID (e.g. after server restart), a new
// transport is created with that same ID instead of returning 404. This makes
// sessions resilient to server restarts without requiring client-side retry logic.
const MAX_SESSIONS = 100;
const transports = new Map<string, StreamableHTTPServerTransport>();

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'strava-mcp',
    version: '0.1.0',
  });

  registerTools(server, database, config.stravaApiBase);

  return server;
}

/** Evict the oldest entry from the transports map (first key = oldest insertion). */
function evictOldestTransport(): void {
  const oldest = transports.keys().next();
  if (!oldest.done) {
    const id = oldest.value;
    const transport = transports.get(id);
    log.debug(`Evicting LRU session: ${id}`);
    transport?.close?.();
    transports.delete(id);
  }
}

/**
 * Create a new MCP session. If `sessionId` is provided, the transport reuses
 * that ID (resilient reconnection); otherwise a new UUID is generated.
 * Enforces the MAX_SESSIONS cap via LRU eviction before inserting.
 */
async function createSession(sessionId?: string): Promise<StreamableHTTPServerTransport> {
  if (transports.size >= MAX_SESSIONS) {
    evictOldestTransport();
  }

  const id = sessionId ?? randomUUID();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => id,
  });

  transport.onclose = () => {
    if (transport.sessionId) {
      log.debug(`Session closed: ${transport.sessionId}`);
      transports.delete(transport.sessionId);
    }
  };

  const server = createMcpServer();
  await server.connect(transport);

  transports.set(id, transport);
  log.debug(`Session created: ${id}`);

  return transport;
}

/**
 * Return an existing transport for `sessionId`, refreshing its LRU position,
 * or create a new one. When called without a sessionId, always creates new.
 */
async function getOrCreateTransport(sessionId?: string): Promise<StreamableHTTPServerTransport> {
  if (sessionId) {
    const existing = transports.get(sessionId);
    if (existing) {
      // Refresh LRU position: delete and re-insert at the end of the Map
      transports.delete(sessionId);
      transports.set(sessionId, existing);
      return existing;
    }
  }
  return createSession(sessionId);
}

// POST /mcp — handles JSON-RPC messages (including initialization)
app.post('/mcp', bearerAuth, async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  const transport = await getOrCreateTransport(sessionId);
  await transport.handleRequest(req, res, req.body);
});

// GET /mcp — SSE stream for server-to-client notifications
app.get('/mcp', bearerAuth, async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId) {
    res.status(400).json({ error: 'Missing mcp-session-id header' });
    return;
  }
  const transport = await getOrCreateTransport(sessionId);
  await transport.handleRequest(req, res);
});

// DELETE /mcp — close a session
app.delete('/mcp', bearerAuth, async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId) {
    res.status(400).json({ error: 'Missing mcp-session-id header' });
    return;
  }
  const transport = await getOrCreateTransport(sessionId);
  await transport.handleRequest(req, res);
});

// Periodic cleanup of expired tokens, auth codes, and pending authorizations
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
function runCleanup(): void {
  const deleted = deleteExpiredRecords(database);
  if (deleted > 0) {
    log.info(`Cleanup: removed ${deleted} expired record(s)`);
  }
}
runCleanup(); // Run at startup
setInterval(runCleanup, CLEANUP_INTERVAL_MS);

app.listen(config.port, () => {
  log.info(`Strava MCP server listening on ${config.baseUrl}`);
  log.info(`OAuth metadata: ${config.baseUrl}/.well-known/oauth-authorization-server`);
});
