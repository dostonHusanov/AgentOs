import { test } from "node:test";
import assert from "node:assert/strict";
import { openrouterGenerate } from "../lib/ai/openrouter";
test("OpenRouter preserves tool IDs and reasoning while mapping citations", async () => {
  const originalFetch = globalThis.fetch;
  const oldKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-only-key";
  let round = 0;
  const message = {
    role: "assistant",
    content: null,
    reasoning_details: [{ type: "reasoning.encrypted", data: "opaque" }],
    tool_calls: [
      {
        id: "call_1",
        type: "function",
        function: {
          name: "discover_agents",
          arguments: '{"capability":"data"}',
        },
      },
    ],
  };
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer test-only-key",
    );
    if (round++ === 0) {
      assert.equal(body.tools[0].function.name, "discover_agents");
      return Response.json({ choices: [{ message }] });
    }
    assert.deepEqual(body.messages[1], message);
    assert.equal(body.messages[2].tool_call_id, "call_1");
    return Response.json({
      choices: [
        {
          message: {
            role: "assistant",
            content: "Verified",
            annotations: [
              {
                type: "url_citation",
                url_citation: { url: "https://example.com", title: "Source" },
              },
            ],
          },
        },
      ],
    });
  };
  try {
    const first = await openrouterGenerate({
      model: "ignored",
      contents: "Find data",
      config: {
        tools: [
          {
            functionDeclarations: [
              {
                name: "discover_agents",
                parametersJsonSchema: { type: "object" },
              },
            ],
          },
        ],
      },
    });
    assert.equal(first.functionCalls?.[0].id, "call_1");
    const second = await openrouterGenerate({
      model: "ignored",
      contents: [
        { role: "user", parts: [{ text: "Find data" }] },
        first.candidates![0].content!,
        {
          role: "user",
          parts: [
            {
              functionResponse: {
                id: "call_1",
                name: "discover_agents",
                response: { output: [] },
              },
            },
          ],
        },
      ],
    });
    assert.equal(second.text, "Verified");
    assert.equal(
      second.candidates?.[0].groundingMetadata?.groundingChunks?.[0].web?.uri,
      "https://example.com",
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = oldKey;
  }
});
