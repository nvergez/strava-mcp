import { randomUUID } from 'node:crypto';
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { StravaOAuthProvider } from './strava-auth-provider.js';
import { initDb } from './db.js';
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
    res.status(400).send(`Strava authorization error: ${error}`);
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

// MCP transport management: one transport per session
const transports = new Map<string, StreamableHTTPServerTransport>();

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'strava-mcp',
    version: '0.1.0',
  });

  registerTools(server);

  return server;
}

function getTransport(sessionId: string | undefined): StreamableHTTPServerTransport | undefined {
  if (!sessionId) return undefined;
  return transports.get(sessionId);
}

// POST /mcp — handles JSON-RPC messages (including initialization)
app.post('/mcp', bearerAuth, async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  const existing = getTransport(sessionId);

  if (existing) {
    await existing.handleRequest(req, res, req.body);
    return;
  }

  if (sessionId) {
    log.warn(`Session not found: ${sessionId}`);
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  // New session — create transport and server
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });

  const server = createMcpServer();

  transport.onclose = () => {
    if (transport.sessionId) {
      log.debug(`Session closed: ${transport.sessionId}`);
      transports.delete(transport.sessionId);
    }
  };

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);

  if (transport.sessionId) {
    log.debug(`Session created: ${transport.sessionId}`);
    transports.set(transport.sessionId, transport);
  }
});

// GET /mcp — SSE stream for server-to-client notifications
app.get('/mcp', bearerAuth, async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  const transport = getTransport(sessionId);
  if (!transport) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  await transport.handleRequest(req, res);
});

// DELETE /mcp — close a session
app.delete('/mcp', bearerAuth, async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  const transport = getTransport(sessionId);
  if (!transport) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  await transport.handleRequest(req, res);
});

app.listen(config.port, () => {
  log.info(`Strava MCP server listening on ${config.baseUrl}`);
  log.info(`OAuth metadata: ${config.baseUrl}/.well-known/oauth-authorization-server`);
});
