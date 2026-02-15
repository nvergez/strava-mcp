import express from 'express';
import rateLimit from 'express-rate-limit';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  mcpAuthRouter,
  getOAuthProtectedResourceMetadataUrl,
} from '@modelcontextprotocol/sdk/server/auth/router.js';
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

// The MCP resource server URL — used for protected resource metadata
const mcpServerUrl = new URL('/mcp', config.baseUrl);

// Mount the OAuth auth router at the root (handles /authorize, /token, /register,
// /.well-known/oauth-authorization-server, /.well-known/oauth-protected-resource)
app.use(
  mcpAuthRouter({
    provider,
    issuerUrl: new URL(config.baseUrl),
    scopesSupported: config.scopes,
    resourceServerUrl: mcpServerUrl,
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
const bearerAuth = requireBearerAuth({
  verifier: provider,
  requiredScopes: config.scopes,
  resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpServerUrl),
});

// Stateless MCP transport: a fresh transport + McpServer is created per request.
// No session state is kept in memory, so server restarts are invisible to clients.
// Auth is handled entirely by bearer tokens (stored in SQLite), not sessions.
function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'strava-mcp',
    version: '0.1.0',
  });

  registerTools(server, database, config.stravaApiBase);

  return server;
}

// POST /mcp — handles all JSON-RPC messages
app.post('/mcp', bearerAuth, async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  const server = createMcpServer();
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// GET /mcp — SSE not supported in stateless mode
app.get('/mcp', bearerAuth, (_req, res) => {
  res.status(405).json({ error: 'SSE not supported — use POST for all requests' });
});

// DELETE /mcp — no sessions to close in stateless mode
app.delete('/mcp', bearerAuth, (_req, res) => {
  res.status(405).json({ error: 'No sessions to close in stateless mode' });
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
