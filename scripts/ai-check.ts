import { loadEnvConfig } from "@next/env";
import { z } from "zod";
loadEnvConfig(process.cwd());
let stage = "structured output";
async function main() {
  const { generateContent, aiModel, aiProvider, structured } =
    await import("../lib/ai/client");
  console.log(`Checking ${aiProvider()} model ${aiModel()}…`);
  const parsed = await structured(
    z.object({ ready: z.literal(true) }),
    "readiness",
    "Return ready=true as JSON.",
    "Check structured output.",
  );
  stage = "Google Search grounding";
  const response = await generateContent({
    model: aiModel(),
    contents: "Find the official Cardano developer website and give its URL.",
    config: {
      tools: [{ googleSearch: {} }],
      abortSignal: AbortSignal.timeout(90000),
    },
  });
  const sources =
    response.candidates?.[0]?.groundingMetadata?.groundingChunks?.filter(
      (c) => c.web?.uri,
    ) ?? [];
  if (!response.text || !sources.length)
    throw new Error(
      "Gemini did not return search grounding evidence. Check model and search access.",
    );
  console.log(
    `GEMINI READY · ${aiModel()} · structured output ${parsed.ready ? "verified" : "failed"} · ${sources.length} grounded sources. No wallet signing or agent purchases occurred.`,
  );
}
main().catch(async (error) => {
  const { errorSummary } = await import("../lib/errors");
  const { aiProvider } = await import("../lib/ai/client");
  if (aiProvider() === "openrouter") {
    console.error(`OpenRouter ${stage}: ${errorSummary(error)}`);
  } else if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    error.status === 429
  ) {
    console.error(
      `Gemini quota exhausted during ${stage} (HTTP 429).\n` +
        "Open https://ai.dev/rate-limit and select the project owning your API key.\n" +
        "Check the configured model's request, token, and daily limits. Wait for an exhausted limit to reset; if quota is zero, check model access and billing.\n" +
        "Google Search grounding also requires access for your project. Creating another key in the same project does not increase quota.\n" +
        "After resolving the project quota, run npm run ai:check again. No wallet signing or agent purchases occurred.",
    );
  } else if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    error.status === 503
  ) {
    console.error(
      `Gemini remains overloaded during ${stage} after 3 retries. Wait a few minutes and run npm run ai:check again. Live AI verification is incomplete.`,
    );
  } else {
    console.error(`${stage}: ${errorSummary(error)}`);
  }
  process.exitCode = 1;
});
