import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { GenerateContentResponse, type Content } from "@google/genai";
import { geminiResearch } from "../lib/ai/research";
import { aiClient, retryUnavailable } from "../lib/ai/client";
test("Gemini retries temporary overload with bounded backoff", async () => {
  const delays: number[] = [];
  let calls = 0;
  const result = await retryUnavailable(
    async () => {
      if (++calls < 4) throw Object.assign(new Error("busy"), { status: 503 });
      return "ready";
    },
    async (ms) => {
      delays.push(ms);
    },
  );
  assert.equal(result, "ready");
  assert.equal(calls, 4);
  delays.forEach((ms, index) =>
    assert.ok(ms >= 2000 * 2 ** index && ms < 2000 * 2 ** index + 500),
  );
});
test("Gemini stops after three overload retries and does not retry quota errors", async () => {
  for (const status of [503, 429, 401]) {
    let calls = 0;
    const error = Object.assign(new Error("failed"), { status });
    await assert.rejects(
      retryUnavailable(
        async () => {
          calls++;
          throw error;
        },
        async () => {},
      ),
      (actual) => actual === error,
    );
    assert.equal(calls, status === 503 ? 4 : 1);
  }
});
import type { Mission, Job } from "../types/mission";
function mission(): Mission {
  return {
    id: randomUUID(),
    accessToken: "test",
    goal: "Research options using a specialist dataset",
    status: "executing",
    budget: { initial: 5, spent: 0, reserved: 0, remaining: 5, asset: "tUSDM" },
    policy: { maxSinglePurchase: 2, minimumReputation: 80, escrowThreshold: 1 },
    jobs: [],
    payments: [],
    events: [],
    createdAt: new Date().toISOString(),
    failNextProvider: false,
    paymentMode: "simulation",
    aiMode: "gemini",
  };
}
function job(m: Mission): Job {
  return {
    id: randomUUID(),
    missionId: m.id,
    buyerAgentId: "manager",
    sellerAgentId: "research",
    capability: "web_research",
    objective: m.goal,
    status: "executing",
    price: 1,
    reason: "Test provider",
    sellerName: "ResearchPro",
    reputation: 95,
    registrySource: "local",
    depth: 1,
    createdAt: m.createdAt,
  };
}
function response(content: Content, grounded = false) {
  return Object.assign(new GenerateContentResponse(), {
    candidates: [
      {
        content,
        ...(grounded
          ? {
              groundingMetadata: {
                groundingChunks: [
                  {
                    web: {
                      uri: "https://example.com/evidence",
                      title: "Evidence",
                    },
                  },
                ],
              },
            }
          : {}),
      },
    ],
  });
}
test("Gemini research executes discover and hire tools while preserving model signatures", async () => {
  const m = mission(),
    j = job(m);
  const discovery: Content = {
    role: "model",
    parts: [
      {
        functionCall: {
          id: "discover",
          name: "discover_agents",
          args: { capability: "structured_city_data" },
        },
        thoughtSignature: "signature-to-preserve",
      },
    ],
  };
  const responses = [
    response(
      { role: "model", parts: [{ text: "Grounded research evidence" }] },
      true,
    ),
    response(discovery),
    response({
      role: "model",
      parts: [
        {
          functionCall: {
            id: "hire",
            name: "hire_agent",
            args: { capability: "structured_city_data", objective: m.goal },
          },
          thoughtSignature: "next-signature",
        },
      ],
    }),
    response({
      role: "model",
      parts: [{ text: "Final research incorporating purchased data" }],
    }),
  ];
  let index = 0;
  const purchased = { dataset: "purchased" };
  const hires: string[] = [];
  try {
    const result = await geminiResearch(
      m,
      j,
      async (capability) => {
        hires.push(capability);
        return purchased;
      },
      {
        models: {
          generateContent: async (params) => {
            if (index === 0)
              assert.deepEqual(params.config?.tools, [{ googleSearch: {} }]);
            if (index === 2) {
              const history = params.contents as Content[];
              assert.ok(history.includes(discovery));
              assert.equal(
                history[1].parts?.[0].thoughtSignature,
                "signature-to-preserve",
              );
              assert.equal(
                history[2].parts?.[0].functionResponse?.id,
                "discover",
              );
            }
            const next = responses[index++];
            assert.ok(next);
            return next;
          },
        },
      },
      async (schema, _name, _instructions, input) => {
        assert.ok(input.includes("purchased"));
        return schema.parse({
          summary:
            "Grounded findings and paid specialist data support a substantive comparison of the available options for this objective.",
          findings: [
            "A substantive source-backed finding.",
            "A second finding integrates specialist output.",
          ],
          sources: [{ title: "Evidence", url: "https://example.com/evidence" }],
        });
      },
    );
    assert.deepEqual(hires, ["structured_city_data"]);
    assert.deepEqual(result.purchasedData, purchased);
    assert.equal(index, 4);
  } finally {
    rmSync(join(process.cwd(), ".agentos", m.id + ".json"), { force: true });
  }
});
test("Gemini research fails when search has no grounding evidence", async () => {
  const m = mission();
  await assert.rejects(
    () =>
      geminiResearch(
        m,
        job(m),
        async () => {
          throw new Error("Must not hire");
        },
        {
          models: {
            generateContent: async () =>
              response({ role: "model", parts: [{ text: "Unverified text" }] }),
          },
        },
      ),
    /grounded web sources/,
  );
});
test("Gemini requires its own API key and never falls back to an OpenAI key", () => {
  const previous = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    assert.throws(() => aiClient(), /GEMINI_API_KEY/);
  } finally {
    if (previous !== undefined) process.env.GEMINI_API_KEY = previous;
  }
});
