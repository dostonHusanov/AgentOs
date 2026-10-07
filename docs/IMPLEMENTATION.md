# Implementation checkpoints

The initial workspace was empty. No existing components or code were replaced.

## P0

| Item                                                     | Status                                                          |
| -------------------------------------------------------- | --------------------------------------------------------------- |
| Next.js 15 / strict TypeScript / React / Tailwind        | Built                                                           |
| Mission creation and async start                         | HTTP tested                                                     |
| Manager plan and DAG validation                          | Live exercised; plan cost checked before payment                |
| Capability registry / multiple providers / scoring       | HTTP tested; four native Masumi Preprod registrations confirmed |
| Fixed-point budget and policies                          | Unit and HTTP tested                                            |
| Research / Data / Report providers                       | Live Gemini through OpenRouter and deliverables verified        |
| Nested Research → Data buying                            | HTTP tested with separate buyer and parent job                  |
| Paid HTTP 402 / proof retry / resource gating            | HTTP tested in simulation and real Preprod direct payments      |
| SDK Cardano signing / settlement / durable replay claims | Built and type checked against @x402/cardano 2.28.0             |
| Confirmed real Preprod payment                           | Confirmed; three direct receipts and completed nested mission   |
| Persisted events / live SSE                              | HTTP tested                                                     |
| Agent tree / decision summaries / receipts / result UI   | Built; browser visual QA pending                                |

## P1

Local reputation, spending policies, verified result schemas, replacement-provider recovery, and explorer URL validation are implemented. Native Masumi V2 registry mappings and registration requests are implemented for owned providers. A normalized gateway remains available. Native registration and escrow-backed delivery are live verified; independent reputation and remote service execution are not implemented.

## P2

Three escrow locks and completed nested delivery are verified on Preprod (see LIVE_VERIFICATION.md). Refund request and seller authorization are separate on-chain phases. A 0.20 tUSDM refund withdrawal is confirmed and credited once. Research/Report seller release still requires reconciliation after the contract deadlines. History UI, transactional PostgreSQL storage, distributed workers, and crash resumption are deferred. Escrow-required purchases fail closed unless a confirmed native provider and node wallet scopes are configured. A pending transaction cannot be represented as refunded or failed spending.

## Validation

- `npm run lint`: strict TypeScript
- `npm run test`: 21 tests
- `npm run build`: production build
- `npm run test:integration`: simulation completion, true nested HTTP calls, replacement recovery, budget rejection, SSE snapshots, unauthorized access, duplicate start
- `npm run demo:check`: explicit readiness distinction
- `npm run demo:live`: requires live modes, performs real payments, verifies completed mission, nested hire, confirmed receipt evidence, and exports a receipt artifact

The initial production integration run completed at 1.70 tUSDM simulated spending. Recovery completed at 2.55, retaining the failed first purchase as spent. Insufficient budget failed with zero payments. Neither case is an on-chain success claim.
