import { z } from "zod";
import { randomUUID, randomBytes } from "node:crypto";
import { config } from "@/lib/config";
import { save, publicMission } from "@/lib/mission/store";
import { apiError } from "@/lib/api";
import type { Mission } from "@/types/mission";
export const runtime = "nodejs";
const schema = z.object({
  goal: z.string().trim().min(20).max(6000),
  budget: z
    .number()
    .min(0.1)
    .max(1000)
    .refine(
      (n) =>
        Number.isInteger(Math.round(n * 1e6)) &&
        n === Math.round(n * 1e6) / 1e6,
    ),
  asset: z.literal("tUSDM").default("tUSDM"),
  policy: z
    .object({
      maxSinglePurchase: z.number().positive().max(1000),
      minimumReputation: z.number().min(0).max(100),
      escrowThreshold: z.number().positive().max(1000),
      allowedCapabilities: z.array(z.string()).optional(),
      blockedCapabilities: z.array(z.string()).optional(),
    })
    .default({
      maxSinglePurchase: 2,
      minimumReputation: 80,
      escrowThreshold: 1,
    }),
});
export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const cfg = config();
    const m: Mission = {
      id: randomUUID(),
      accessToken: randomBytes(32).toString("hex"),
      goal: body.goal,
      status: "created",
      budget: {
        initial: body.budget,
        spent: 0,
        reserved: 0,
        remaining: body.budget,
        asset: body.asset,
      },
      policy: body.policy,
      jobs: [],
      payments: [],
      events: [],
      createdAt: new Date().toISOString(),
      failNextProvider: false,
      paymentMode: cfg.paymentMode,
      aiMode: cfg.aiMode,
    };
    save(m);
    return Response.json(
      { ...publicMission(m), accessToken: m.accessToken },
      { status: 201 },
    );
  } catch (e) {
    return apiError(e);
  }
}
