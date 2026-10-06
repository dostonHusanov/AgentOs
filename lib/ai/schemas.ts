import { z } from "zod";
export const planSchema = z.object({
  summary: z.string().min(1),
  tasks: z
    .array(
      z.object({
        id: z.string().min(1),
        capability: z.string().min(1),
        objective: z.string().min(1),
        dependsOn: z.array(z.string()),
      }),
    )
    .min(1)
    .max(8),
});
export const researchTextSchema = z.object({
  summary: z.string().min(80),
  findings: z.array(z.string().min(10)).min(2),
  sources: z.array(z.object({ title: z.string(), url: z.url() })),
});
export const researchSchema = researchTextSchema.extend({
  purchasedData: z.unknown().optional(),
});
export const dataSchema = z.object({
  dataset: z.literal("illustrative-city-data"),
  asOf: z.string(),
  limitations: z.string(),
  cities: z
    .array(
      z.object({
        city: z.string(),
        monthlyCostEstimate: z.number().positive(),
        internetScore: z.number().min(0).max(10),
        safetyScore: z.number().min(0).max(10),
        coworkingScore: z.number().min(0).max(10),
      }),
    )
    .min(1),
});
export const reportSchema = z.object({
  title: z.string().min(1),
  recommendation: z.string().min(80),
  comparison: z
    .array(z.object({ option: z.string(), assessment: z.string().min(10) }))
    .min(1),
  evidence: z.array(z.string()).min(1),
  limitations: z.array(z.string()).min(1),
});
