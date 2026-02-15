# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm build              # Compile TypeScript (uses tsconfig.build.json)
pnpm dev                # Watch mode compilation
pnpm start              # Run compiled server (requires .env file)
pnpm test               # Run tests with Node built-in test runner
pnpm lint               # ESLint check
pnpm lint:fix           # ESLint auto-fix
pnpm format             # Prettier format
pnpm format:check       # Prettier check
```

Pre-commit hook runs lint-staged (ESLint + Prettier on staged files).

## Environment

- **Node >= 24 required** (uses experimental `node:sqlite`). Pin managed via `.nvmrc`.
- **pnpm** is the package manager.
- ESM-only (`"type": "module"` in package.json).
- Copy `.env.example` to `.env` for local development. Required vars: `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`.

## Architecture

This is a **Model Context Protocol (MCP) server** that exposes Strava's read-only API as 28 MCP tools. It uses HTTP+SSE transport (not stdio).

### Key layers

- **`src/index.ts`** — Express HTTP server. Handles MCP session lifecycle (create/resume/destroy via POST/GET/DELETE on `/mcp`), OAuth endpoints (`/authorize`, `/token`, `/register`), and the Strava callback (`/strava/callback`). Rate-limited auth endpoints, max 100 concurrent sessions with 30-min idle timeout.

- **`src/strava-auth-provider.ts`** — Bridges MCP OAuth to Strava OAuth. Strava doesn't support PKCE, so PKCE is validated locally. Issues **opaque bearer tokens** to MCP clients (real Strava tokens are never exposed). Implements `OAuthServerProvider` from the MCP SDK.

- **`src/db.ts`** — SQLite persistence via `node:sqlite` (DatabaseSync). Four tables: `oauth_clients`, `pending_authorizations`, `authorization_codes`, `access_tokens`. TTL-based expiry with periodic cleanup (15-min interval).

- **`src/strava-client.ts`** — Shared utilities for calling Strava API: resolves opaque tokens to real Strava tokens, authenticated fetch helpers, pagination/query-string builders.

- **`src/tools.ts`** + **`src/tools/*.ts`** — Tool registration hub dispatching to 8 domain modules (activities, athletes, clubs, gear, routes, segments, streams, uploads). Each tool extracts the auth token from `extra.authInfo`, calls Strava, and returns JSON text.

### Adding a new tool

1. Add the tool function in the appropriate `src/tools/<domain>.ts` file.
2. Follow the existing pattern: define a Zod input schema, register with `server.tool()`, extract token via `getStravaToken()`, call `stravaFetch()`, return `{ content: [{ type: 'text', text }] }`.
3. Import and call it from `src/tools.ts`.

### Design decisions

- **Opaque tokens**: MCP clients never see real Strava credentials. The server maps its own bearer tokens to stored Strava access/refresh tokens.
- **All tools are read-only**: No mutation tools exist by design. Strava API rate limits apply (100 req/15 min, 1000/day).
- **Zod v4**: Input validation uses Zod v4 (not v3) — the API surface differs (e.g., `z.string().optional()` vs `z.optional(z.string())`).
