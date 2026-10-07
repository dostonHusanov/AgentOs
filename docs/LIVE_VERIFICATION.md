# Live verification — 7 October 2026

Verified on Cardano Preprod with Gemini 2.5 Flash through OpenRouter. No mainnet funds were used.

## Runtime and discovery

Three local Masumi nodes and PostgreSQL databases are running under the isolated Colima profile `agentos`. Manager, Research, and Backup purchasing wallets match their local signers. Four native Masumi V2 registrations are confirmed. Discovery verifies their identities, endpoints, capabilities, owner wallets, and tUSDM prices. These are locally managed providers; public remote MIP-003 execution and independently attested reputation are not claimed.

The production build passed and AgentOS runs at http://127.0.0.1:3001. The final `demo:check` reports READY, including live AI, funded wallets, registry, escrow, and the HTTP server.

## Direct payment mission

Mission ac7c398e-b4a3-463c-9f5b-83766abc9ea8 completed with three confirmed direct payments, a real nested Research → Data hire, grounded research, validated deliverables, and a final report. Spending: 1.70 tUSDM. [Full receipt](live-receipts-ac7c398e-b4a3-463c-9f5b-83766abc9ea8.json).

| Buyer → seller     | tUSDM | Preprod transaction                                              |
| ------------------ | ----- | ---------------------------------------------------------------- |
| manager → research | 1     | c59e5a98c72e370938dfa1d3b5867cbf031fdcef7a9371fb499ddfce71f52d25 |
| research → data    | 0.2   | 276f712bd826eace83f3f347aa10561f24971894c47712d54e725238b0cca598 |
| manager → report   | 0.5   | de8f2735f4c7c1a4cbabfb4b472afc120d574e4dc5cf447f574f8cfab8e613f0 |

## Escrow delivery mission

Mission b629f3ee-9be6-408a-a0ba-55c5727bb0f6 completed with three confirmed native Masumi escrow locks, a nested hire, verified outputs, and on-chain result-hash submission observed for all three jobs. Lock outputs were independently checked through Blockfrost. Committed spending: 1.70 tUSDM. [Reconciled receipt](live-receipts-b629f3ee-9be6-408a-a0ba-55c5727bb0f6.json).

| Buyer → seller     | tUSDM locked | Preprod lock transaction                                         |
| ------------------ | ------------ | ---------------------------------------------------------------- |
| manager → research | 1            | f61ad243475ba30e67dabda358737f504f5066ca4959793229cdd6ae5c86b9c0 |
| research → data    | 0.2          | 36ee62a128d6b95e5ea9df751d84cc5cc429d95a23c4fe29212aa4f298b4c709 |
| manager → report   | 0.5          | 11a4d118267250148e8b188aa96b14001ffe180bc12b2d9019fac0d1eab7e5c3 |

A 0.20 tUSDM refund test was requested for the existing Data purchase. The on-chain buyer request reached Disputed; local seller authorization was queued only after confirmed observation. Refund withdrawal is confirmed in transaction `cbfdd67cc238176a9148072a96914b3d24ba7691ec5bb70fc61f1ba3bb1ad133`. Blockfrost independently verifies return to the original Research buyer. Reconciliation was run twice; the budget was credited exactly once, leaving 1.50 tUSDM spent and 3.50 remaining. Use the staged refund commands in [MASUMI.md](MASUMI.md); do not repeat an uncertain request or authorization.

Delivery and result submission do not prove seller release. The Research and Report release deadlines are:

- research: 2026-10-08T06:38:07.557Z (UTC).
- report: 2026-10-08T06:44:45.537Z (UTC).

Research and Report seller release must be reconciled after their deadlines. The Data refund is complete. Browser visual QA remains unverified.

## Failures fixed during verification

An earlier mission submitted 1.00 tUSDM but timed out before the required newer block was observed; its exact saved proof was reconciled to confirmed without a replacement signature. Its failed job was not restarted. The facilitator confirmation window was increased from 45 to 120 seconds per attempt.

A second mission confirmed 2.85 tUSDM in direct payments but stopped after two research attempts returned no grounded citations. Research requests now receive dependency outputs and explicitly require web search. Two unpaid live grounding checks returned three cited sources each before the successful mission was run.

Planning now checks the prices of the providers actually selected by ranking, including an implicit final report, before spending. Unaffordable plans are replanned once and then rejected if still unaffordable. The demo explicitly requests a compact comparison and nested specialist hire.

The native wallet query uses `walletType`, and a zero escrow threshold is accepted to require escrow for all jobs. Refund authorization is a separate phase after on-chain RefundRequested or Disputed; persisted intent prevents blind repeats. The local image also patches the pinned upstream automatic selector and L1 collector: a confirmed RefundAuthorized purchase can retain a historical result hash, which incorrectly excludes it under the upstream global null-hash filters. The patch moves the null-hash condition into the timed-refund branch and retains all contract validation. Both patched node builds and the resulting real refund were verified.

Earlier failed attempts spent 3.85 test tUSDM. Together with the successful direct mission and escrow commitment, verification spent or locked 7.25 test tUSDM before the verified 0.20 refund, or 7.05 net. ADA network fees are separate.

## Checks

- 21 tests passed, including plan affordability, dependency context, proof replay protection, staged refund authorization, and one-time refund credit. The refund was also verified live, including repeated reconciliation without duplicate credit.
- Strict TypeScript checks passed.
- Production build passed.
- Both live delivery demos completed; final native-node/AI/wallet/server health reports READY.

Persistence and native credentials remain local. Mission receipt exports omit access tokens and internal proof digests. Mission crash resumption, distributed workers, public remote execution, and browser visual QA are outside this verified scope.
