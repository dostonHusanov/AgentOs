# Docker deployment

Docker Engine and Docker Compose 2.24+ are required. On this Mac the installed executable is `docker-compose`; substitute it for `docker compose` in the commands below. The image runs as the unprivileged `node` user and builds both Next.js and the stdio MCP server. `.env.local`, private state, wallet phrases and tunnel binaries are excluded from the build context. Supply credentials only at runtime.

## Start an isolated fixture demo

```sh
docker compose up -d --build
docker compose ps
```

Open http://127.0.0.1:3010. This stack deliberately uses fixture AI and simulated payments. It does not replace the current live server on port 3001. Mission state is stored in a Docker volume; it does not import local `.agentos` files. Run one application instance: the current store is a single-process file store.

```sh
docker compose logs -f app
docker compose down
```

`down` preserves mission data. `down -v` deletes it; do not use it for a live deployment. Container restart preserves snapshots but does not automatically resume interrupted execution. Do not restart during active missions or blindly retry signing requests.

## Live Cardano and Masumi

The live override includes the existing three Masumi nodes and PostgreSQL volumes. On a fresh machine, prepare the patched Masumi source with the existing `npm run masumi:prepare` workflow first, or distribute the prebuilt `agentos-masumi:local` image separately. The patched source is private/generated under `.agentos/masumi-node/source` and is not part of the application image.

```sh
docker compose --env-file .env.local -f compose.yaml -f compose.live.yaml config --quiet
docker compose --env-file .env.local -f compose.yaml -f compose.live.yaml up -d --build
```

Use the real settings from `.env.local`. Compose routes Masumi traffic over its internal network instead of host localhost. Provider identities, node wallets and registrations are database-backed: a new stack needs bootstrap/registration against its new nodes. Existing local registration IDs must not be assumed to exist in fresh databases. Do not start live missions until registry and wallet checks pass. PostgreSQL and Masumi host ports remain bound to loopback.

## Existing stdio MCP in Docker

The application image includes `/app/dist/mcp/server.js`. A local MCP client can launch it using:

```sh
docker compose exec -T app node /app/dist/mcp/server.js
```

Set `AGENTOS_BASE_URL=http://127.0.0.1:3000` for this command (the MCP server runs inside the app container); for example `docker compose exec -T -e AGENTOS_BASE_URL=http://127.0.0.1:3000 app node /app/dist/mcp/server.js`. No TTY, shell banner or npm wrapper should precede stdio MCP messages.

## Server hosting boundary

Upload the repository and runtime secrets separately, then run Compose on your server. Bind the app to loopback behind a reverse proxy with HTTPS, streaming enabled and suitable timeouts. For direct testing on a private network, set `AGENTOS_BIND_ADDRESS=0.0.0.0`; public exposure requires visitor ownership and spending protections.

This packaging does not yet provide a public HTTP `/mcp` endpoint. The current MCP transport is stdio; judges cannot connect it by URL. Streamable HTTP, remote-client identity/isolation, public download authorization, spending caps and HTTPS still need implementation before sharing a public judge endpoint. Docker packaging alone does not make the existing local-only MCP/browser bridge a multi-user service.
