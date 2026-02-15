# strava-mcp

A [Model Context Protocol](https://modelcontextprotocol.io/) server for the [Strava API](https://developers.strava.com/). Exposes 29 read-only Strava tools over HTTP+SSE transport with full OAuth 2.0 authentication.

## Hosted version

A public instance is available at `https://strava-mcp.fly.dev/mcp` — no setup required. Point your MCP client to this URL and authenticate with your Strava account.

## Prerequisites

- [Node.js](https://nodejs.org/) >= 24
- [pnpm](https://pnpm.io/)
- A [Strava API application](https://www.strava.com/settings/api) (client ID and secret)

## Setup

```bash
pnpm install
cp .env.example .env
```

Edit `.env` with your Strava API credentials:

| Variable               | Required | Default                 | Description                                  |
| ---------------------- | -------- | ----------------------- | -------------------------------------------- |
| `STRAVA_CLIENT_ID`     | Yes      |                         | Your Strava API application client ID        |
| `STRAVA_CLIENT_SECRET` | Yes      |                         | Your Strava API application client secret    |
| `PORT`                 | No       | `3000`                  | HTTP server port                             |
| `BASE_URL`             | No       | `http://localhost:3000` | Public URL (must be HTTPS in production)     |
| `DB_PATH`              | No       | `data/strava-mcp.db`    | SQLite database file path                    |
| `LOG_LEVEL`            | No       | `info`                  | Log level (`debug`, `info`, `warn`, `error`) |

Set the **Authorization Callback Domain** in your [Strava API settings](https://www.strava.com/settings/api) to match your `BASE_URL` (e.g. `localhost` for local development).

## Usage

```bash
pnpm build
pnpm start
```

The server starts on the configured port and exposes:

- `POST /mcp` — JSON-RPC requests (stateless — no sessions)
- `/authorize`, `/token`, `/register` — OAuth 2.0 endpoints
- `/.well-known/oauth-authorization-server` — OAuth authorization server metadata
- `/.well-known/oauth-protected-resource/mcp` — OAuth protected resource metadata
- `/strava/callback` — Strava OAuth redirect

## Tools

All tools are **read-only**. Organized by domain:

| Domain     | Tools                                                                                                                               |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Activities | `get_activity`, `list_athlete_activities`, `get_activity_comments`, `get_activity_kudos`, `get_activity_laps`, `get_activity_zones` |
| Athletes   | `get_authenticated_athlete`, `get_athlete_zones`, `get_athlete_stats`                                                               |
| Clubs      | `get_club`, `list_athlete_clubs`, `list_club_members`, `list_club_admins`, `list_club_activities`                                   |
| Gear       | `get_gear`                                                                                                                          |
| Routes     | `get_route`, `list_athlete_routes`, `export_route_gpx`, `export_route_tcx`                                                          |
| Segments   | `get_segment`, `explore_segments`, `list_starred_segments`, `get_segment_effort`, `list_segment_efforts`                            |
| Streams    | `get_activity_streams`, `get_route_streams`, `get_segment_effort_streams`, `get_segment_streams`                                    |
| Uploads    | `get_upload_status`                                                                                                                 |

## Development

```bash
pnpm dev            # Watch mode (recompiles on change)
pnpm test           # Run tests
pnpm lint           # ESLint check
pnpm lint:fix       # ESLint auto-fix
pnpm format         # Prettier format
pnpm format:check   # Prettier check
```

## License

[MIT](LICENSE)
