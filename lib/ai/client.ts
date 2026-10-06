import { GoogleGenAI, type GenerateContentParameters } from "@google/genai";
import { openrouterGenerate } from "./openrouter";
import { z } from "zod";
export const aiProvider = () =>
  process.env.AI_PROVIDER === "openrouter" ? "openrouter" : "google";
export const aiKeyConfigured = () =>
  Boolean(
    (aiProvider() === "openrouter"
      ? process.env.OPENROUTER_API_KEY
      : process.env.GEMINI_API_KEY
    )?.trim(),
  );
export const aiModel = () =>
  aiProvider() === "openrouter"
    ? process.env.OPENROUTER_MODEL?.trim() || "google/gemini-2.5-flash"
    : process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";
export function aiClient() {
  if (aiProvider() === "openrouter")
    return { models: { generateContent: openrouterGenerate } };
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is required for live AI");
  return new GoogleGenAI({ apiKey, httpOptions: { timeout: 90000 } });
}
export async function retryUnavailable<T>(
  operation: () => Promise<T>,
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (
        !error ||
        typeof error !== "object" ||
        !("status" in error) ||
        error.status !== 503 ||
        attempt >= 3
      )
        throw error;
      const delay = 2000 * 2 ** attempt + Math.floor(Math.random() * 500);
      console.warn(
        `Gemini temporarily unavailable (503); retry ${attempt + 1}/3 in ${(delay / 1000).toFixed(1)}s.`,
      );
      await sleep(delay);
    }
  }
}
export function generateContent(
  params: GenerateContentParameters,
  client: {
    models: Pick<GoogleGenAI["models"], "generateContent">;
  } = aiClient(),
) {
  return retryUnavailable(() => client.models.generateContent(params));
}
export async function structured<T>(
  schema: z.ZodType<T>,
  name: string,
  instructions: string,
  input: string,
): Promise<T> {
  const response = await generateContent({
    model: aiModel(),
    contents: input,
    config: {
      systemInstruction: instructions,
      responseMimeType: "application/json",
      responseJsonSchema: z.toJSONSchema(schema),
      abortSignal: AbortSignal.timeout(90000),
    },
  });
  if (!response.text) throw new Error(`Gemini did not return ${name}`);
  return schema.parse(JSON.parse(response.text));
}
