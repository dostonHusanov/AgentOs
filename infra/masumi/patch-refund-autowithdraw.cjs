const { readFileSync, writeFileSync } = require("node:fs");
const file =
  "packages/payment-source-v2/src/services/payments/automatic-decisions/service.ts";
const marker =
  "// AgentOS: authorized refunds do not require a null historical result hash.";
let source = readFileSync(file, "utf8");
if (!source.includes(marker)) {
  const globalGuard = /([\t ]*)resultHash: null,\n([\t ]*)OR: \[/g;
  const timedGuard =
    /\n([\t ]*)onChainState: \{ in: \[OnChainState.RefundRequested, OnChainState.FundsLocked\] \},/g;
  if (
    [...source.matchAll(globalGuard)].length !== 1 ||
    [...source.matchAll(timedGuard)].length !== 1
  )
    throw new Error(
      "Pinned Masumi refund selector changed; review the patch before building",
    );
  source = source.replace(globalGuard, "$1" + marker + "\n$2OR: [");
  source = source.replace(
    timedGuard,
    "\n$1resultHash: null,\n$1onChainState: { in: [OnChainState.RefundRequested, OnChainState.FundsLocked] },",
  );
  writeFileSync(file, source);
}
const collectorFile =
  "packages/payment-source-v2/src/services/purchases/collect-refund/service.ts";
const collectorMarker =
  "// AgentOS: L1 authorized refund collection accepts historical result hashes.";
let collector = readFileSync(collectorFile, "utf8");
if (!collector.includes(collectorMarker)) {
  const blocks = [
    ...collector.matchAll(
      /const paymentContractsWithWalletLocked = await lockAndQueryPurchases\(\{[\s\S]*?\n\t\t\}\);/g,
    ),
  ];
  if (blocks.length !== 1)
    throw new Error("Pinned L1 refund collection query changed; review patch");
  const block = blocks[0][0];
  const guard = /\n([\t ]*)resultHash: null,\n/g;
  const timed =
    /\n([\t ]*)onChainState: \{ in: \[OnChainState.RefundRequested, OnChainState.FundsLocked\] \},/g;
  if (
    [...block.matchAll(guard)].length !== 1 ||
    [...block.matchAll(timed)].length !== 1
  )
    throw new Error("Pinned L1 refund collection guards changed; review patch");
  const fixed = block
    .replace(guard, "\n$1" + collectorMarker + "\n")
    .replace(
      timed,
      "\n$1resultHash: null,\n$1onChainState: { in: [OnChainState.RefundRequested, OnChainState.FundsLocked] },",
    );
  collector = collector.replace(block, fixed);
  writeFileSync(collectorFile, collector);
}
console.log(
  "Applied authorized-refund selection and L1 collection fixes; timed guards retained.",
);
