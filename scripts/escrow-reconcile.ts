import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
async function main() {
  const missionId = process.argv[2],
    paymentId = process.argv[3];
  if (!missionId || !paymentId)
    throw new Error(
      "Usage: npm run escrow:reconcile -- <mission-id> <payment-id> [--refund | --authorize-refund]",
    );
  const { getMission } = await import("../lib/mission/store");
  const { reconcileEscrow, requestEscrowRefund, authorizeEscrowRefund } =
    await import("../lib/masumi/escrow");
  const m = getMission(missionId),
    p = m.payments.find((p) => p.id === paymentId && p.escrow);
  if (!p) throw new Error("Escrow payment not found");
  if (
    process.argv.includes("--refund") &&
    process.argv.includes("--authorize-refund")
  )
    throw new Error("Request and authorization are separate on-chain phases");
  if (process.argv.includes("--refund")) await requestEscrowRefund(m, p);
  else if (process.argv.includes("--authorize-refund"))
    await authorizeEscrowRefund(m, p);
  else await reconcileEscrow(m, p);
  console.log(
    `Payment ${p.id}: ${p.status}, escrow ${p.escrow!.state}. Budget ${m.budget.remaining} tUSDM available.`,
  );
}
main().catch(async (error) => {
  const { errorSummary } = await import("../lib/errors");
  console.error(errorSummary(error));
  process.exitCode = 1;
});
