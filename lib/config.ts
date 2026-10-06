export const config = () => {
  const paymentMode = process.env.PAYMENT_MODE ?? "simulation";
  const aiMode = process.env.AI_MODE ?? "fixture";
  if (
    !["simulation", "cardano"].includes(paymentMode) ||
    !["fixture", "gemini"].includes(aiMode)
  )
    throw new Error("Invalid execution mode");
  if (paymentMode === "cardano" && process.env.CARDANO_NETWORK !== "preprod")
    throw new Error("Only Cardano Preprod is permitted");
  return {
    paymentMode: paymentMode as "simulation" | "cardano",
    aiMode: aiMode as "fixture" | "gemini",
    appUrl: process.env.APP_URL ?? "http://127.0.0.1:3000",
    maxDepth: Math.min(
      3,
      Math.max(1, Number(process.env.MAX_AGENT_DEPTH) || 3),
    ),
  };
};
