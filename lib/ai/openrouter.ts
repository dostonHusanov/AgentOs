import {
  GenerateContentResponse,
  type GenerateContentParameters,
  type Content,
  type Part,
} from "@google/genai";
type Message = {
  role: string;
  content: string | null;
  tool_calls?: {
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
  reasoning_details?: unknown;
  annotations?: {
    type: string;
    url_citation?: { url: string; title?: string };
  }[];
};
const originals = new WeakMap<Content, Message>();
export async function openrouterGenerate(
  params: GenerateContentParameters,
): Promise<GenerateContentResponse> {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new Error("OPENROUTER_API_KEY is required");
  const base =
    process.env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1";
  if (base !== "https://openrouter.ai/api/v1")
    throw new Error("OPENROUTER_BASE_URL must be https://openrouter.ai/api/v1");
  const messages: Message[] = [];
  const system = params.config?.systemInstruction;
  if (typeof system === "string")
    messages.push({ role: "system", content: system });
  if (typeof params.contents === "string")
    messages.push({ role: "user", content: params.contents });
  else {
    const contents = Array.isArray(params.contents)
      ? params.contents
      : [params.contents];
    for (const item of contents) {
      if (typeof item === "string") {
        messages.push({ role: "user", content: item });
        continue;
      }
      if (!("parts" in item)) throw new Error("Unsupported OpenRouter content");
      const original = originals.get(item);
      if (original) {
        messages.push(original);
        continue;
      }
      const text = item.parts?.map((p) => p.text || "").join("") || "";
      if (text)
        messages.push({
          role: item.role === "model" ? "assistant" : "user",
          content: text,
        });
      for (const part of item.parts || []) {
        if (part.functionResponse)
          messages.push({
            role: "tool",
            tool_call_id: part.functionResponse.id,
            content: JSON.stringify(part.functionResponse.response),
          });
      }
    }
  }
  const search = params.config?.tools?.some((t) => "googleSearch" in t);
  const tools =
    params.config?.tools?.flatMap((t) =>
      "functionDeclarations" in t
        ? (t.functionDeclarations || []).map((f) => ({
            type: "function",
            function: {
              name: f.name,
              description: f.description,
              parameters: f.parametersJsonSchema || f.parameters,
            },
          }))
        : [],
    ) || [];
  if (search)
    tools.push({
      type: "openrouter:web_search",
      parameters: { max_results: 3, max_total_results: 3, max_uses: 1 },
    } as unknown as (typeof tools)[number]);
  const body = {
    model: process.env.OPENROUTER_MODEL?.trim() || "google/gemini-2.5-flash",
    messages,
    ...(tools.length ? { tools } : {}),
    ...(params.config?.responseJsonSchema
      ? {
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "agentos_output",
              strict: true,
              schema: params.config.responseJsonSchema,
            },
          },
        }
      : {}),
    ...(params.config?.maxOutputTokens
      ? { max_tokens: params.config.maxOutputTokens }
      : {}),
  };
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: params.config?.abortSignal || AbortSignal.timeout(90000),
  });
  const data = (await res.json()) as {
    error?: { message?: string; code?: number };
    choices?: { message: Message }[];
  };
  if (!res.ok || data.error)
    throw Object.assign(
      new Error(
        data.error?.message || `OpenRouter request failed (${res.status})`,
      ),
      { status: data.error?.code || res.status },
    );
  const message = data.choices?.[0]?.message;
  if (!message) throw new Error("OpenRouter returned no candidate");
  const parts: Part[] = [];
  if (message.content) parts.push({ text: message.content });
  for (const call of message.tool_calls || [])
    parts.push({
      functionCall: {
        id: call.id,
        name: call.function.name,
        args: JSON.parse(call.function.arguments),
      },
    });
  const content: Content = { role: "model", parts };
  originals.set(content, message);
  const sources =
    message.annotations?.flatMap((a) =>
      a.type === "url_citation" && a.url_citation
        ? [{ web: { uri: a.url_citation.url, title: a.url_citation.title } }]
        : [],
    ) || [];
  return Object.assign(new GenerateContentResponse(), {
    candidates: [
      {
        content,
        ...(sources.length
          ? { groundingMetadata: { groundingChunks: sources } }
          : {}),
      },
    ],
  });
}
