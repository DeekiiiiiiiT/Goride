/**
 * deno test --no-check --allow-env --allow-read vehicle_document_read_runtime.test.ts
 */
import { assert, assertEquals } from "jsr:@std/assert@1";

if (!Deno.env.get("SUPABASE_URL")) Deno.env.set("SUPABASE_URL", "http://127.0.0.1:54321");
if (!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
}
import { buildProductionDocumentReadDeps } from "./vehicle_document_read_runtime.ts";

let nativeFetch: typeof fetch | null = null;
let fetchHandler: ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) | null = null;

function installFetchMock(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): () => void {
  if (!nativeFetch) {
    nativeFetch = globalThis.fetch.bind(globalThis);
  }
  fetchHandler = handler;
  globalThis.fetch = (input, init) => {
    const url = String(input);
    if (url.includes("generativelanguage.googleapis.com") && fetchHandler) {
      return fetchHandler(input, init);
    }
    if (url.includes("127.0.0.1:54321") || url.includes("localhost:54321")) {
      const method = init?.method ?? "GET";
      const body = method === "POST" ? "null" : "[]";
      return Promise.resolve(
        new Response(body, { status: 200, headers: { "Content-Type": "application/json" } }),
      );
    }
    if (fetchHandler) return fetchHandler(input, init);
    return nativeFetch!(input, init);
  };
  return () => {
    fetchHandler = null;
    if (nativeFetch) globalThis.fetch = nativeFetch;
  };
}

const FAKE_SUPABASE = {
  schema: () => ({
    rpc: async () => ({ data: [{ user_hour_count: 0, org_day_count: 0 }], error: null }),
    from: () => ({
      insert: async () => ({ error: null }),
    }),
  }),
} as never;

Deno.test("callReader gemini: generateContent with inline image and JSON text", async () => {
  const restore = installFetchMock(async (input, init) => {
    const url = String(input);
    assert(url.includes("/v1beta/models/gemini-3.8-flash:generateContent"));
    const headers = init?.headers as Record<string, string>;
    assertEquals(headers["x-goog-api-key"], "reader-gemini-key");
    const body = JSON.parse(String(init?.body));
    assertEquals(body.generationConfig.responseMimeType, "application/json");
    assertEquals(body.contents[0].parts[0].text, "extract fields");
    assertEquals(body.contents[0].parts[1].inlineData.mimeType, "image/jpeg");
    assert(body.contents[0].parts[1].inlineData.data.length > 0);
    return new Response(
      JSON.stringify({
        candidates: [{
          content: { parts: [{ text: JSON.stringify({ plate: "ABC123", chassis: "CH1" }) }] },
        }],
      }),
      { status: 200 },
    );
  });

  try {
    const deps = buildProductionDocumentReadDeps(
      FAKE_SUPABASE,
      () => "openai-unused",
      () => "reader-gemini-key",
    );
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0x00]);
    const out = await deps.callReader({
      provider: "gemini",
      model: "gemini-3.8-flash",
      prompt: "extract fields",
      imageBytes: bytes,
      mime: "image/jpeg",
      userId: "u1",
      orgId: "o1",
    });
    assertEquals(out.plate, "ABC123");
    assertEquals(out.chassis, "CH1");
  } finally {
    restore();
  }
});