# Native Masumi and escrow setup

AgentOS includes a native Masumi Payment Service V2 adapter for its own local providers: registration, confirmed identity discovery, escrow purchase, verified result-hash submission, staged refund request/authorization, and reconciliation. Four registrations and completed direct-payment and escrow-delivery missions are live verified on Preprod. See [live evidence](LIVE_VERIFICATION.md) for the precise lifecycle states and remaining release checks.

The local node setup targets official source commit `d569a338ca54d5be7441564770d75ebf89b71f12` from [masumi-payment-service](https://github.com/masumi-network/masumi-payment-service/tree/d569a338ca54d5be7441564770d75ebf89b71f12). API requests use its published OpenAPI/schema definitions, `token` header, `/api/v1` base path, and `Web3CardanoV2` payment sources. This is separate from the older normalization gateway.

The image applies [a local refund selector fix](../infra/masumi/patch-refund-autowithdraw.cjs). Upstream applies `resultHash: null` to all automatic refund collection candidates, which excludes a confirmed `RefundAuthorized` purchase when its database retains a historical result hash. The fix covers automatic selection and the L1 collection query. It retains that condition for timed refunds and accepts explicitly authorized refunds regardless of historical hash. Hydra L2 collection is outside this patch and remains unverified. The contract builder still validates the on-chain datum and original buyer return address. The patch refuses unexpected source layouts rather than silently modifying another version.

## Prerequisites

- Free at least 10 GB for the build; more space may be needed by your container runtime.
- A running Docker-compatible runtime with Docker Compose. On macOS, Docker Desktop or Colima can provide it.
- Valid, distinct Manager, Research, and Backup test-wallet phrases in `.env.local` and a valid Blockfrost Preprod project ID.
- Buyer wallets funded with Preprod test ADA and tUSDM. Seller result/registry transactions also consume test ADA. Cardano fees and returned ADA collateral are separate from the mission's tUSDM budget.

No mainnet source or wallet is configured. Secrets are passed into containers at runtime, not baked into images. PostgreSQL stores node wallet secrets encrypted; keep the node encryption key and database volumes together. `docker compose config` and `docker inspect` can display runtime secrets: do not paste their output.

## Start and register

```bash
npm run wallet:sync
npm run masumi:prepare
npm run masumi:start
npm run masumi:check
npm run masumi:bootstrap
npm run agents:register -- --submit
```

`masumi:prepare` generates missing local keys in `.env.local` with permissions 0600. It does not select native discovery, enable escrow or transfer funds. `masumi:start` checks disk, runtime, and wallet validity, fetches the pinned upstream source into ignored `.agentos/masumi-node/source`, then builds and starts three local nodes and databases. The upstream container startup migrates and seeds its database. Startup, wallet identities, and four Preprod registrations are verified on this machine. The shared image builds once, with this project's node services temporarily stopped to keep the compiler within VM memory; databases remain intact. If a build fails and a prior image exists, startup attempts to restore the prior services. Startup supports the Compose plugin or standalone `docker-compose`. The isolated Colima runtime uses profile `agentos`; after reboot run `colima start --profile agentos`.

The seller/Manager node listens on 3002. Research and Backup buyer nodes listen on 3003 and 3004. They use separate databases so each buyer has exactly one purchasing wallet. Masumi prevents importing the same payment key twice within one database, so Research's seller and buyer roles run in separate nodes. These are test-only hot wallets; concurrent node operations on the same Cardano wallet can still conflict at the ledger, and uncertain settlements stop execution for reconciliation.

`masumi:bootstrap` checks each buyer wallet and imports the Backup seller into the local seller node's encrypted storage when needed. It only sends wallet phrases to a loopback node. Data and Report use the Research wallet to own their registry identities, with their configured recipient addresses as escrow payout destinations; their owner addresses are saved separately from direct-payment recipient addresses.

Registration requests spend test ADA to mint identities. Intents and returned IDs are persisted under `.agentos/registrations`. Repeat `agents:register -- --submit` to observe existing requests; confirmed IDs select native discovery only when all four providers are confirmed. An uncertain registration response blocks duplicates and requires manual node inspection.

The registered endpoints use AgentOS's authenticated local job transport. This adapter does not execute arbitrary remote MIP-003 services or claim public marketplace interoperability. Native discovery checks identity, registration status, endpoint, capability, seller wallet, network and price. Reputation and reliability remain configured AgentOS metadata, not independently attested Masumi scores. Changing APP_URL after registration requires updating/re-registering the advertised endpoint.

## Verify direct payments and escrow

```bash
npm run setup:live
# Restart AgentOS after changing environment settings.
npm run demo:check
npm run demo:live
npm run masumi:enable
# Restart AgentOS again.
npm run demo:check
npm run demo:live -- --escrow
```

The direct demo uses ordinary x402 address payments. The escrow demo sets the purchase threshold to zero and routes all paid jobs through the native node, including nested hires. A native purchase is requested only after checking that the node's purchasing wallet matches the mission buyer. Before executing work, the adapter requires a confirmed node lock record and independently checks the Preprod transaction outputs through Blockfrost.

The x402 SDK's `assetTransferMethod=masumi` signatures differ from node-native authorization. AgentOS therefore uses **native node-issued quotes and purchases** for escrow, rather than producing an SDK lock the node cannot drive. See the installed SDK's [compatibility notes](../node_modules/@x402/cardano/README.md).

A completed deliverable queues its canonical SHA-256 result hash for node submission. The dashboard distinguishes a real escrow lock from a direct payment and shows result-submission/release/refund state. Delivery completion does **not** prove funds were released: the default terms allow a two-hour delivery period, release after 26 hours and external dispute eligibility after 50 hours. Reconciliation is required to observe on-chain submission and eventual release.

## Reconcile and refund

```bash
npm run escrow:reconcile -- <mission-id> <payment-id>
npm run escrow:reconcile -- <mission-id> <payment-id> --refund
# Wait for confirmed RefundRequested or Disputed on the seller node.
npm run escrow:reconcile -- <mission-id> <payment-id> --authorize-refund
```

Read-only reconciliation observes the stored purchase. `--refund` queues the buyer request. After the seller observes confirmed `RefundRequested` or `Disputed`, `--authorize-refund` queues seller authorization. Authorization intent is persisted before sending; uncertain authorization is not automatically repeated. Failed deliverable verification requests the buyer refund after a confirmed lock; the seller phase needs explicit authorization once the request is confirmed. These requests are not a confirmed return of funds. The budget is credited once, only after the node reports a confirmed refund withdrawal and Blockfrost shows the buyer receiving the mission asset. Replacement hiring stops while escrow recovery is unresolved.

Ambiguous mutating requests are not automatically repeated. Signed identifiers and commitments are stored before a purchase; a quote or purchase with an uncertain response keeps the reservation. A missing returned quote identifier requires inspecting node records before recovery. Jobs/missions do not automatically resume after process crashes.

## Official references

- [Cardano agentic commerce](https://developers.cardano.org/x402/)
- [Masumi escrow lifecycle](https://www.masumi.network/dev/masumi/core-concepts/payments)
- [Official payment-service source and deployment guide](https://github.com/masumi-network/masumi-payment-service)
