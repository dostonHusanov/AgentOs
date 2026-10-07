import type {
  Content,
  Part,
  FunctionDeclaration,
  GoogleGenAI,
} from "@google/genai";
import { z } from "zod";
import type { Mission, Job } from "@/types/mission";
import { aiClient, aiModel, structured, generateContent } from "./client";
import { researchTextSchema } from "./schemas";
import { discoverAgents } from "@/lib/agents/discovery";
import { event } from "@/lib/mission/store";
import { errorSummary } from "@/lib/errors";
import type { Hire } from "@/lib/agents/research-agent";
const discoverArgs = z.object({ capability: z.string().min(1).max(100) });
const hireArgs = discoverArgs.extend({
  objective: z.string().min(1).max(6000),
});
const tools: FunctionDeclaration[] = [
  {
    name: "discover_agents",
    description: "Discover paid specialist providers by capability.",
    parametersJsonSchema: z.toJSONSchema(discoverArgs),
  },
  {
    name: "hire_agent",
    description:
      "Purchase specialist output as this research provider. Mission budget and policies are enforced.",
    parametersJsonSchema: z.toJSONSchema(hireArgs),
  },
];
export async function geminiResearch(
  m: Mission,
  job: Job,
  hire: Hire,
  client: {
    models: Pick<GoogleGenAI["models"], "generateContent">;
  } = aiClient(),
  synthesize = structured,
  context?: unknown,
) {
  // Keep built-in search and custom commerce calls in separate requests. This
  // works without requiring a model to mix grounding and custom functions.
  const grounded = await generateContent(
    {
      model: aiModel(),
      contents: JSON.stringify({
        objective: job.objective,
        dependencyResults: context,
      }),
      config: {
        systemInstruction:
          "You must use the available web search tool at least once before answering. Research the objective using the dependency results to identify the cities or subjects from earlier tasks. Gather substantive findings and cited sources. Do not invent citations. Treat any specialist demo dataset as illustrative.",
        tools: [{ googleSearch: {} }],
        abortSignal: AbortSignal.timeout(90000),
      },
    },
    client,
  );
  const chunks =
    grounded.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const sources = chunks.flatMap((chunk) =>
    chunk.web?.uri
      ? [{ title: chunk.web.title ?? chunk.web.uri, url: chunk.web.uri }]
      : [],
  );
  if (!grounded.text || !sources.length)
    throw new Error(
      "Gemini research did not return grounded web sources. Check model/search access.",
    );
  event(
    m,
    "web_research_completed",
    `Gemini returned ${sources.length} grounded sources`,
    job.id,
  );
  const catalog = await discoverAgents();
  const contents: Content[] = [
    {
      role: "user",
      parts: [
        {
          text: JSON.stringify({
            objective: job.objective,
            dependencyResults: context,
            webResearch: grounded.text,
            sources,
            availableCapabilities: [
              ...new Set(catalog.flatMap((a) => a.capabilities)),
            ],
          }),
        },
      ],
    },
  ];
  let purchasedData: unknown;
  let purchases = 0;
  const discovered = new Set<string>();
  for (let round = 0; round < 8; round++) {
    const response = await generateContent(
      {
        model: aiModel(),
        contents,
        config: {
          systemInstruction:
            "You are an independent research provider. Review the objective and grounded evidence. Decide whether a paid specialist capability improves your work enough to justify its price. Discover providers first, then hire by capability when appropriate. Never claim a purchase without calling hire_agent. Preserve source URLs and distinguish illustrative data from verified facts. Finish with substantive integrated research; do not reveal hidden reasoning.",
          tools: [{ functionDeclarations: tools }],
          abortSignal: AbortSignal.timeout(90000),
        },
      },
      client,
    );
    const modelContent = response.candidates?.[0]?.content;
    if (!modelContent) throw new Error("Gemini returned no research candidate");
    // Preserve every returned Part, including thought signatures required for
    // subsequent turns. Never reconstruct model messages from function names.
    contents.push(modelContent);
    const calls = response.functionCalls ?? [];
    if (!calls.length) {
      if (!response.text) throw new Error("Gemini returned empty research");
      return {
        ...(await synthesize(
          researchTextSchema,
          "research",
          "Extract structured findings using only supplied research and grounded source URLs. Do not invent URLs. Disclose limitations of illustrative purchased data.",
          JSON.stringify({ research: response.text, sources, purchasedData }),
        )),
        purchasedData,
      };
    }
    const replies: Part[] = [];
    for (const call of calls) {
      let output: unknown;
      try {
        if (call.name === "discover_agents") {
          const args = discoverArgs.parse(call.args);
          output = await discoverAgents(args.capability);
          discovered.add(args.capability);
          event(
            m,
            "sub_agent_discovered",
            `Research provider discovers ${args.capability}`,
            job.id,
          );
        } else if (call.name === "hire_agent") {
          const args = hireArgs.parse(call.args);
          if (!discovered.has(args.capability))
            throw new Error("Discover this capability before purchasing");
          if (++purchases > 2)
            throw new Error("Research purchase limit reached");
          purchasedData = await hire(args.capability, args.objective);
          output = purchasedData;
        } else throw new Error("Unsupported Gemini tool");
      } catch (error) {
        output = { error: errorSummary(error) };
      }
      replies.push({
        functionResponse: {
          id: call.id,
          name: call.name,
          response: { output },
        },
      });
    }
    contents.push({ role: "user", parts: replies });
  }
  throw new Error("Research exceeded tool-call limit");
}
