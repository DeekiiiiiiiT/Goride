/**
 * deno test --no-check --allow-env --allow-read vehicle_picture_imagen.test.ts
 */
import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";

if (!Deno.env.get("SUPABASE_URL")) Deno.env.set("SUPABASE_URL", "http://127.0.0.1:54321");
if (!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
}
import { createProductionImagenCaller } from "./vehicle_picture_imagen.ts";
import type { VehicleLook } from "../_shared/vehiclePictures/lookKey.ts";

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

const TEST_LOOK: VehicleLook = {
  key: "toyota|roomy|1st gen|hatchback|standard|white",
  make: "toyota",
  model: "roomy",
  generation: "1st gen",
  bodyType: "hatchback",
  faceliftStage: "standard",
  startYear: 2018,
  endYear: 2022,
  color: "white",
};

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

function pngB64(): string {
  return btoa(String.fromCharCode(...PNG_BYTES));
}

Deno.test("production imagen: generateContent URL, header, body, PNG", async () => {
  const restore = installFetchMock(async (input, init) => {
    const url = String(input);
    assert(url.endsWith("/v1beta/models/gemini-3.1-flash-image:generateContent"));
    assertEquals(init?.method, "POST");
    const headers = init?.headers as Record<string, string>;
    assertEquals(headers["x-goog-api-key"], "test-gemini-key");
    const body = JSON.parse(String(init?.body));
    assertEquals(body.contents[0].parts[0].text.length > 0, true);
    assertEquals(body.generationConfig.responseModalities, ["IMAGE"]);
    assertEquals(body.generationConfig.imageConfig.aspectRatio, "4:3");
    return new Response(
      JSON.stringify({
        candidates: [{
          content: {
            parts: [{ inlineData: { mimeType: "image/png", data: pngB64() } }],
          },
        }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });

  try {
    const caller = createProductionImagenCaller(() => "test-gemini-key");
    const result = await caller({
      model: "gemini-3.1-flash-image",
      look: TEST_LOOK,
      timeoutMs: 5_000,
    });
    assertEquals(result.pngBytes.length, PNG_BYTES.length);
    assertEquals(result.pngBytes[0], 0x89);
    assert(result.costUsd > 0);
    assert(result.prompt.length > 0);
  } finally {
    restore();
  }
});

Deno.test("production imagen: non-PNG inlineData throws no image", async () => {
  const junk = btoa(String.fromCharCode(0x00, 0x01, 0x02, 0x03));
  const restore = installFetchMock(async () =>
    new Response(
      JSON.stringify({
        candidates: [{
          content: { parts: [{ inlineData: { mimeType: "image/jpeg", data: junk } }] },
        }],
      }),
      { status: 200 },
    )
  );

  try {
    const caller = createProductionImagenCaller(() => "test-gemini-key");
    await assertRejects(
      () => caller({ model: "gemini-3.1-flash-image", look: TEST_LOOK, timeoutMs: 5_000 }),
      Error,
      "Imagen returned no image",
    );
  } finally {
    restore();
  }
});

Deno.test("production imagen: missing inlineData throws no image", async () => {
  const restore = installFetchMock(async () =>
    new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: "no image" }] } }] }),
      { status: 200 },
    )
  );

  try {
    const caller = createProductionImagenCaller(() => "test-gemini-key");
    await assertRejects(
      () => caller({ model: "gemini-3.1-flash-image", look: TEST_LOOK, timeoutMs: 5_000 }),
      Error,
      "Imagen returned no image",
    );
  } finally {
    restore();
  }
});