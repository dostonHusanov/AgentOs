# AgentOS runtime check — 8 October 2026

## Deployment follow-up

After the operator deployed the live-payment override and rebuilt the image,
the supplied VPS output showed healthy app and MCP containers, a running proxy,
and `/api/health` reporting `READY`, `paymentMode: cardano`, `aiMode: gemini`.
Wallet signers and recipient addresses validated. That endpoint does not perform
a live AI request or check wallet balances.

Independent external checks then confirmed:

- Hosted MCP initializes and lists all five tools.
- The deployed wait schema uses the new 25-second default and 30-second maximum.
- Both authenticated `/history` and `/history/data` return HTTP 200.
- History contains six accessible missions, zero unavailable missions, and 18
  receipts, all from earlier simulated payments without transaction hashes.

The previously missing history endpoint is fixed. Existing simulated receipts
remain simulated; a new authorized mission is needed to demonstrate a new live
settlement. Native Masumi registry and escrow remain disabled on this VPS.
The earlier findings below describe the state before this deployment.

Local services were stopped at the start of this check. The existing Colima VM,
Next.js app on port 3001, and ChatGPT tunnel were restarted. No paid mission was
created or retried. AI health checks made minimal model requests; wallet checks
were read-only. Fixture tests used simulated payments and mocked integrations.

## Verified

| Check | Result |
| --- | --- |
| Complete automated suite | 30 tests passed, including stdio and HTTP MCP |
| Isolated MCP mission | Completed with nested hiring, three simulated receipts, report, PDF resource and browser download |
| Local `npm run demo:check` | READY: AI connectivity, funded buyer wallets, recipient addresses, native Masumi registry and escrow buyer scopes |
| Local infrastructure | Three Masumi nodes running; three PostgreSQL containers healthy |
| Local ChatGPT tunnel | Diagnostic checks passed; `/healthz` and `/readyz` returned HTTP 200 |
| Hosted HTTPS | `66.42.90.134.sslip.io` returned HTTP 200 with valid certificate verification |
| Hosted MCP | Protocol initialization and three tool-discovery calls passed; five tools available |

## Remaining hosted verification

The private hosted `/history/data` endpoint returned HTTP 404. The endpoint exists
in the current local source, so the deployed service needs inspection and likely
a rebuild with the current MCP code. The private connection URL is deliberately
omitted from this document.

SSH with existing key authentication was denied. Consequently, VPS container
health, deployed source version, AI mode and Cardano payment mode could not be
verified from inside the VPS. An MCP handshake alone does not verify these.

Run these read-only commands in the existing VPS terminal and inspect their output:

```sh
cd /opt/agentos
docker compose ps
curl -fsS http://127.0.0.1:3010/api/health
```

Do not paste environment files or private connection keys. Apply deployment
updates with the same Compose overrides currently used by the VPS, preserving
its credentials and mission volume. Local fixes are not automatically deployed.

## Fixes made during this check

- MCP waits now use 25-second windows, at most 30 seconds per call. Responses
  explicitly request continued monitoring of the same mission until terminal
  status. Historical tunnel logs recorded a response deadline being reached;
  the previous 900-second default could exceed it. This does not establish the
  cause of the earlier creation-time “Session terminated” error.
- HTTP MCP now exposes backend-aware `/readyz`; Docker checks this instead of
  process liveness alone. Unreachable or blocked backends return HTTP 503.
- HTTP MCP validates its public HTTPS origin and supplies hosted history links
  instead of localhost dashboard links.
- HTTP protocol tests cover initialization, reconnection, authorization,
  readiness failures and existing PDF/history delivery without duplicate starts.
- The isolated mission smoke test now copies all compiled shared dependencies.

## Limits

No fresh live Cardano purchase or escrow settlement was performed. Local readiness
confirms configuration and connectivity, not a new settlement. The audit also did
not run a new ChatGPT conversation; SDK and tunnel checks verify the transport,
while the chat host still controls whether it continues calling tools.

Local tunnel access depends on the runtime remaining active. See the
[official Secure MCP Tunnel guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels).
