import { config } from "@/lib/config";
import { localAgents, discoverAgents } from "@/lib/agents/discovery";
import {
  aiClient,
  aiModel,
  aiKeyConfigured,
  aiProvider,
} from "@/lib/ai/client";
import { buyerSigner } from "@/lib/cardano/wallet";
import { USDM_PREPROD_ASSET } from "@x402/cardano";
export interface HealthCheck {
  component: string;
  status: "ready" | "blocked" | "development";
  detail: string;
}
export async function checkHealth(connect = false) {
  const checks: HealthCheck[] = [];
  const cfg = config();
  checks.push({
    component: "Payment mode",
    status: cfg.paymentMode === "simulation" ? "development" : "ready",
    detail:
      cfg.paymentMode === "simulation"
        ? "SIMULATED PAYMENTS: no Cardano transaction will be created."
        : "Cardano Preprod, exact scheme, tUSDM, one newer block required.",
  });
  checks.push({
    component: "AI mode",
    status:
      cfg.aiMode === "fixture"
        ? "development"
        : aiKeyConfigured()
          ? "ready"
          : "blocked",
    detail:
      cfg.aiMode === "fixture"
        ? "Controlled AI fixtures. Arbitrary mission intelligence requires AI_MODE=gemini."
        : aiKeyConfigured()
          ? `${aiProvider()} key configured; connectivity checked by demo:check.`
          : `Missing ${aiProvider() === "openrouter" ? "OPENROUTER_API_KEY" : "GEMINI_API_KEY"}`,
  });
  if (connect && cfg.aiMode === "gemini" && aiKeyConfigured()) {
    try {
      await aiClient().models.generateContent({
        model: aiModel(),
        contents: "Reply READY",
        config: {
          maxOutputTokens: 100,
          abortSignal: AbortSignal.timeout(30000),
        },
      });
      checks.push({
        component: "Gemini connectivity",
        status: "ready",
        detail: "Model answered successfully.",
      });
    } catch {
      checks.push({
        component: "Gemini connectivity",
        status: "blocked",
        detail:
          "Model request failed. Check credentials, model access, and network.",
      });
    }
  }
  try {
    const agents = await discoverAgents();
    checks.push({
      component: "Registry",
      status: process.env.MASUMI_REGISTRY_URL ? "ready" : "development",
      detail: `${agents.length} providers · ${process.env.MASUMI_REGISTRY_URL ? "configured normalized Masumi adapter" : "local registry, no Masumi claim"}`,
    });
  } catch {
    checks.push({
      component: "Registry",
      status: "blocked",
      detail: "Configured registry unavailable or incompatible metadata.",
    });
  }
  checks.push({
    component: "Escrow",
    status: "development",
    detail:
      "Unavailable. Purchases above policy escrow threshold are rejected.",
  });
  if (cfg.paymentMode === "cardano") {
    for (const id of ["manager", "research", "research-backup"]) {
      try {
        const signer = buyerSigner(id);
        const address = signer.getAddress();
        if (connect) {
          const r = await fetch(
            `https://cardano-preprod.blockfrost.io/api/v0/addresses/${address}`,
            {
              headers: { project_id: process.env.BLOCKFROST_PROJECT_ID ?? "" },
              signal: AbortSignal.timeout(15000),
            },
          );
          if (!r.ok) throw new Error();
          const data = (await r.json()) as {
            amount: { unit: string; quantity: string }[];
          };
          const ada = BigInt(
            data.amount.find((a) => a.unit === "lovelace")?.quantity ?? "0",
          );
          const token = BigInt(
            data.amount.find(
              (a) => a.unit === USDM_PREPROD_ASSET.replace(".", ""),
            )?.quantity ?? "0",
          );
          if (ada < 5000000n || token < (id === "manager" ? 1700000n : 200000n))
            throw new Error();
          checks.push({
            component: `${id} wallet`,
            status: "ready",
            detail: `${Number(ada) / 1e6} tADA · ${Number(token) / 1e6} tUSDM`,
          });
        } else
          checks.push({
            component: `${id} wallet`,
            status: "ready",
            detail:
              "Signer and configured address match; balance check requires demo:check.",
          });
      } catch {
        checks.push({
          component: `${id} wallet`,
          status: "blocked",
          detail:
            "Missing wallet configuration, signer mismatch, provider unavailable, or insufficient tADA/tUSDM.",
        });
      }
    }
    const sellers = localAgents().filter((a) =>
      ["research", "research-backup", "data", "report"].includes(a.id),
    );
    for (const a of sellers)
      checks.push({
        component: `${a.name} recipient`,
        status: a.walletAddress?.startsWith("addr_test1") ? "ready" : "blocked",
        detail: a.walletAddress?.startsWith("addr_test1")
          ? "Preprod recipient configured."
          : "Missing Preprod recipient address.",
      });
  }
  if (connect) {
    try {
      const r = await fetch(`${cfg.appUrl}/api/agents`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) throw new Error();
      checks.push({
        component: "Agent HTTP server",
        status: "ready",
        detail:
          "Registry endpoint responding. Paid endpoints verified by npm test / integration smoke.",
      });
    } catch {
      checks.push({
        component: "Agent HTTP server",
        status: "blocked",
        detail: "Start npm run dev or npm start at APP_URL.",
      });
    }
  }
  const blocked = checks.some((c) => c.status === "blocked");
  return {
    status: blocked
      ? "BLOCKED"
      : cfg.paymentMode === "simulation" || cfg.aiMode === "fixture"
        ? "DEVELOPMENT READY"
        : "READY",
    paymentMode: cfg.paymentMode,
    aiMode: cfg.aiMode,
    checks,
  };
}
