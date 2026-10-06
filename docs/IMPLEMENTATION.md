# Implementation checkpoints

The initial workspace was empty. No existing components or code were replaced.

## P0

| Item | Status |
| --- | --- |
| Next.js 15 / strict TypeScript / React / Tailwind | Built |
| Mission creation and async start | HTTP tested |
| Manager plan and DAG validation | Built; fixture exercised, live Gemini requires credentials |
| Capability registry / multiple providers / scoring | HTTP tested with local registry |
| Fixed-point budget and policies | Unit and HTTP tested |
| Research / Data / Report providers | Fixture services tested; live model calls not yet verified |
| Nested Research → Data buying | HTTP tested with separate buyer and parent job |
| Paid HTTP 402 / proof retry / resource gating | HTTP tested in simulation |
| SDK Cardano signing / settlement / durable replay claims | Built and type checked against @x402/cardano 2.28.0 |
| Confirmed real Preprod payment | Pending funded wallets and credentials |
| Persisted events / live SSE | HTTP tested |
| Agent tree / decision summaries / receipts / result UI | Built; browser visual QA pending |

## P1

Local reputation, spending policies, verified result schemas, replacement-provider recovery, and explorer URL validation are implemented. Native Masumi integration is partial: a normalized gateway adapter is available; native schema mappings, attested identity/reputation, and remote execution are not implemented.

## P2

Escrow and refund lifecycle, history UI, transactional PostgreSQL storage, distributed workers, and crash resumption are deferred. Escrow-required purchases fail closed. A pending transaction cannot be represented as refunded or failed spending.

## Validation

- `npm run lint`: strict TypeScript
- `npm run test`: eleven safety tests
- `npm run build`: production build
- `npm run test:integration`: simulation completion, true nested HTTP calls, replacement recovery, budget rejection, SSE snapshots, unauthorized access, duplicate start
- `npm run demo:check`: explicit readiness distinction
- `npm run demo:live`: requires live modes, performs real payments, verifies completed mission, nested hire, confirmed receipt evidence, and exports a receipt artifact

The initial production integration run completed at 1.70 tUSDM simulated spending. Recovery completed at 2.55, retaining the failed first purchase as spent. Insufficient budget failed with zero payments. Neither case is an on-chain success claim.
