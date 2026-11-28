/**
 * The manual page readers: DeepSeek (document upload + chat), the Gemini backup, the `manual_reader` setting that
 * picks one, and the fallback that keeps a failed page readable inside the same attempt.
 *
 * Everything here is a real request shape checked against a fake `fetch`; no model is called and no answer is
 * invented beyond what the fake returns.
 *
 * deno test --no-check supabase/functions/_fleet-server/maintenance_manual_reader.test.ts
 */
import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { Buffer } from "node:buffer";
import { type ProviderCallEntry, ProviderBlockedError } from "./api_usage_logger.ts";
import { DEEPSEEK_VISION_MODEL } from "./deepseek_models.ts";
import {
  callDeepSeekManualPageReader,
  callGeminiManualPageReader,
  createManualPageReader,
  pageAnswerIsEmpty,
  DEEPSEEK_API_BASE,
  DEEPSEEK_DOCUMENT_PURPOSE,
  type DeepSeekReaderDeps,
  ManualReaderJsonError,
  type SinglePageReader,
} from "./maintenance_manual_reader.ts";
import { parseManualPage } from "./maintenance_manual_prompt.ts";
import type { ManualPageReadInput } from "./maintenance_manual_worker.ts";

/** No database and no network: the shared guards and the shared call log are replaced with a local recorder. */
function testDeps(deps: DeepSeekReaderDeps = {}): { deps: DeepSeekReaderDeps; logged: ProviderCallEntry[] } {
  const logged: ProviderCallEntry[] = [];
  return {
    deps: {
      ...deps,
      guards: () => Promise.resolve(),
      log: (entry: ProviderCallEntry) => {
        logged.push(entry);
        return Promise.resolve();
      },
    },
    logged,
  };
}

type Recorded = { url: string; method: string; headers: Headers; body: unknown };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function fakeFetch(handler: (call: Recorded) => Response | Promise<Response>) {
  const calls: Recorded[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Recorded = {
      url: String(input),
      method: String(init?.method ?? "GET").toUpperCase(),
      headers: new Headers(init?.headers ?? {}),
      body: init?.body,
    };
    calls.push(call);
    return await handler(call);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function pageInput(over: Partial<ManualPageReadInput> = {}): ManualPageReadInput {
  return {
    model: "gemini-test-model",
    prompt: "Read page 4 of the test manual. Return JSON only.",
    pdfBytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]), // "%PDF-1"
    pageNo: 4,
    ...over,
  };
}

/**
 * One page answer as DeepSeek would answer it: a good row, two junk rows, a one-figure row, and the English name
 * the model gives for a Japanese row (エンジンフィルター -> Engine air filter).
 */
const PAGE_ANSWER = {
  rows: [
    {
      part: "Engine oil",
      normal_km: 10000,
      normal_months: 12,
      severe_km: 5000,
      severe_months: 6,
      one_figure: false,
      confidence: "high",
    },
    { part: "", normal_km: 10000, normal_months: 12 },
    { part: "Maintenance table", note: "km or months, whichever comes first" },
    {
      part: "Brake fluid",
      normal_km: 40000,
      normal_months: 24,
      severe_km: 20000,
      severe_months: 12,
      one_figure: true,
      confidence: "medium",
    },
    { part: "Engine air filter", normal_km: 30000, normal_months: 24, one_figure: true, confidence: "high" },
  ],
};

function deepSeekHappyPath(answer: unknown = PAGE_ANSWER) {
  return fakeFetch((call) => {
    if (call.url === `${DEEPSEEK_API_BASE}/files` && call.method === "POST") {
      return jsonResponse({ id: "file-api-1", object: "file", purpose: DEEPSEEK_DOCUMENT_PURPOSE });
    }
    if (call.url === `${DEEPSEEK_API_BASE}/chat/completions` && call.method === "POST") {
      return jsonResponse({
        choices: [{ message: { content: JSON.stringify(answer) } }],
        usage: { prompt_tokens: 1800, completion_tokens: 240 },
      });
    }
    if (call.url === `${DEEPSEEK_API_BASE}/files/file-api-1` && call.method === "DELETE") {
      return jsonResponse({ id: "file-api-1", object: "file", deleted: true });
    }
    return jsonResponse({ error: "unexpected call" }, 500);
  });
}

Deno.test("a DeepSeek reply becomes rows: good row, junk rows, one-figure row, Japanese name in English", async () => {
  const { fetchImpl, calls } = deepSeekHappyPath();
  const reader = callDeepSeekManualPageReader("sk-test", testDeps({ fetchImpl }).deps);

  const raw = await reader(pageInput());
  const parsed = parseManualPage(raw);

  assertEquals(parsed.dropped, 2);
  assertEquals(parsed.rows.map((r) => r.partAsPrinted), ["Engine oil", "Brake fluid", "Engine air filter"]);
  assertEquals(parsed.rows[0].severeKm, 5000);
  // One figure means one figure: the answer's severe columns are dropped.
  assertEquals(parsed.rows[1].oneFigure, true);
  assertEquals(parsed.rows[1].severeKm, null);
  assertEquals(parsed.rows[1].severeMonths, null);
  // The Japanese row is stored under the English name the prompt asks for; no Japanese is left in any row.
  assertEquals(parsed.rows[2].partAsPrinted, "Engine air filter");
  assertEquals(parsed.rows.some((r) => /[\u3040-\u30ff\u4e00-\u9faf]/.test(r.partAsPrinted)), false);

  // The same one-page PDF and the same prompt the Gemini reader sends.
  const upload = calls.find((c) => c.url === `${DEEPSEEK_API_BASE}/files`)!;
  const form = upload.body as FormData;
  assertEquals([...form.keys()], [
    "purpose",
    "expires_after[anchor]",
    "expires_after[seconds]",
    "file",
  ]); // the docs require purpose before file
  assertEquals(form.get("purpose"), DEEPSEEK_DOCUMENT_PURPOSE);
  assertEquals(form.get("expires_after[anchor]"), "created_at");
  assertEquals(form.get("expires_after[seconds]"), "3600");
  const file = form.get("file") as File;
  assertEquals(file.name, "manual-page-4.pdf");
  assertEquals(file.type, "application/pdf");
  assertEquals(new Uint8Array(await file.arrayBuffer()), pageInput().pdfBytes);

  const chat = calls.find((c) => c.url === `${DEEPSEEK_API_BASE}/chat/completions`)!;
  const body = JSON.parse(String(chat.body)) as {
    model: string;
    messages: Array<{ content: Array<{ type: string; text?: string; file_id?: string }> }>;
    response_format: { type: string };
    thinking: { type: string };
  };
  assertEquals(body.model, DEEPSEEK_VISION_MODEL);
  assertEquals(body.messages[0].content[0].text, pageInput().prompt);
  assertEquals(body.messages[0].content[1], { type: "file", file_id: "file-api-1" });
  assertEquals(body.response_format, { type: "json_object" });
  assertEquals(body.thinking, { type: "disabled" });
  assertEquals(chat.headers.get("authorization"), "Bearer sk-test");
});

Deno.test("every DeepSeek call is logged with its provider and tokens (the price comes from api_pricing)", async () => {
  const { fetchImpl } = deepSeekHappyPath();
  const { deps, logged } = testDeps({ fetchImpl });
  await callDeepSeekManualPageReader("sk-test", deps)(pageInput());

  assertEquals(logged.length, 2);
  const parse = logged[0];
  assertEquals(parse.provider, "deepseek");
  assertEquals(parse.service, "file_parsing");
  assertEquals(parse.requests, 1);
  assertEquals(parse.status, "success");

  const chat = logged[1];
  assertEquals(chat.provider, "deepseek");
  assertEquals(chat.service, "vision");
  assertEquals(chat.model, DEEPSEEK_VISION_MODEL);
  assertEquals(chat.inputTokens, 1800);
  assertEquals(chat.outputTokens, 240);
  assertEquals(chat.status, "success");
  // The shared logger turns these tokens into money through api_pricing's DeepSeek rates (tested there).
});

Deno.test("the Gemini reader sends the same prompt with the page PDF inline, and logs its tokens", async () => {
  const { fetchImpl, calls } = fakeFetch(() =>
    jsonResponse({
      candidates: [{ content: { parts: [{ text: JSON.stringify(PAGE_ANSWER) }] } }],
      usageMetadata: { promptTokenCount: 1500, candidatesTokenCount: 200 },
    })
  );
  const { deps, logged } = testDeps({ fetchImpl });
  const reader = callGeminiManualPageReader("gem-key", deps);

  const raw = await reader(pageInput());
  assertEquals(raw, PAGE_ANSWER);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].url.includes(encodeURIComponent("gemini-test-model")), true);
  assertEquals(calls[0].headers.get("x-goog-api-key"), "gem-key");

  const body = JSON.parse(String(calls[0].body)) as {
    contents: Array<{ parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> }>;
  };
  assertEquals(body.contents[0].parts[0].text, pageInput().prompt);
  assertEquals(body.contents[0].parts[1].inlineData?.mimeType, "application/pdf");
  assertEquals(
    body.contents[0].parts[1].inlineData?.data,
    Buffer.from(pageInput().pdfBytes).toString("base64"),
  );

  assertEquals(logged.length, 1);
  assertEquals(logged[0].provider, "gemini");
  assertEquals(logged[0].inputTokens, 1500);
  assertEquals(logged[0].outputTokens, 200);
});

Deno.test("the uploaded page file is deleted after the page is read", async () => {
  const { fetchImpl, calls } = deepSeekHappyPath();
  await callDeepSeekManualPageReader("sk-test", testDeps({ fetchImpl }).deps)(pageInput());

  const deletes = calls.filter((c) => c.method === "DELETE");
  assertEquals(deletes.length, 1);
  assertEquals(deletes[0].url, `${DEEPSEEK_API_BASE}/files/file-api-1`);
  // The delete comes after the chat, never before.
  const chatIndex = calls.findIndex((c) => c.url.endsWith("/chat/completions"));
  const deleteIndex = calls.findIndex((c) => c.method === "DELETE");
  if (!(deleteIndex > chatIndex)) throw new Error("the file must be deleted after the read");
});

Deno.test("a DeepSeek failure falls back to Gemini in the same attempt, and the result records it", async () => {
  const { fetchImpl, calls } = fakeFetch((call) => {
    if (call.url === `${DEEPSEEK_API_BASE}/files` && call.method === "POST") {
      return jsonResponse({ id: "file-api-2" });
    }
    if (call.url === `${DEEPSEEK_API_BASE}/chat/completions`) {
      return new Response("upstream exploded", { status: 500 });
    }
    if (call.method === "DELETE") return jsonResponse({ deleted: true });
    return jsonResponse({}, 404);
  });
  const deepseek = callDeepSeekManualPageReader("sk-test", testDeps({ fetchImpl }).deps);

  const geminiInputs: ManualPageReadInput[] = [];
  const gemini: SinglePageReader = (input) => {
    geminiInputs.push(input);
    return Promise.resolve(PAGE_ANSWER);
  };
  const reader = createManualPageReader({ choice: "deepseek", gemini, deepseek });

  const result = await reader(pageInput());
  assertEquals(result.reader, "gemini");
  assertEquals(geminiInputs.length, 1);
  // Gemini read the same one-page PDF with the same prompt.
  assertEquals(geminiInputs[0].prompt, pageInput().prompt);
  assertEquals(geminiInputs[0].pdfBytes, pageInput().pdfBytes);
  // The DeepSeek call failed, but its uploaded page file was still deleted.
  assertEquals(calls.filter((c) => c.method === "DELETE").length, 1);
});

Deno.test("bad JSON twice: DeepSeek is asked twice on the same upload, then Gemini reads the page", async () => {
  const { fetchImpl, calls } = fakeFetch((call) => {
    if (call.url === `${DEEPSEEK_API_BASE}/files` && call.method === "POST") {
      return jsonResponse({ id: "file-api-3" });
    }
    if (call.url === `${DEEPSEEK_API_BASE}/chat/completions`) {
      return jsonResponse({ choices: [{ message: { content: "not json at all" } }] });
    }
    if (call.method === "DELETE") return jsonResponse({ deleted: true });
    return jsonResponse({}, 404);
  });

  let geminiCalls = 0;
  const reader = createManualPageReader({
    choice: "deepseek",
    gemini: () => {
      geminiCalls += 1;
      return Promise.resolve(PAGE_ANSWER);
    },
    deepseek: callDeepSeekManualPageReader("sk-test", testDeps({ fetchImpl }).deps),
  });

  const result = await reader(pageInput());
  assertEquals(result.reader, "gemini");
  assertEquals(geminiCalls, 1);
  assertEquals(calls.filter((c) => c.url.endsWith("/chat/completions")).length, 2);
  assertEquals(calls.filter((c) => c.url === `${DEEPSEEK_API_BASE}/files`).length, 1);
  assertEquals(calls.filter((c) => c.method === "DELETE").length, 1);
});

Deno.test("a blank JSON-mode answer counts as bad JSON, not as an empty page", async () => {
  const { fetchImpl, calls } = fakeFetch((call) => {
    if (call.url === `${DEEPSEEK_API_BASE}/files`) return jsonResponse({ id: "file-api-4" });
    if (call.url.endsWith("/chat/completions")) {
      // DeepSeek's JSON mode replaces an unparseable answer with spaces.
      return jsonResponse({ choices: [{ message: { content: "   " } }] });
    }
    return jsonResponse({ deleted: true });
  });

  const gemini: SinglePageReader = () => Promise.resolve(PAGE_ANSWER);
  const result = await createManualPageReader({
    choice: "deepseek",
    gemini,
    deepseek: callDeepSeekManualPageReader("sk-test", testDeps({ fetchImpl }).deps),
  })(pageInput());

  assertEquals(result.reader, "gemini");
  assertEquals(calls.filter((c) => c.url.endsWith("/chat/completions")).length, 2);
});

Deno.test("the manual_reader setting picks the reader", async () => {
  let deepseekCalls = 0;
  let geminiCalls = 0;
  const deepseek: SinglePageReader = () => {
    deepseekCalls += 1;
    return Promise.resolve(PAGE_ANSWER);
  };
  const gemini: SinglePageReader = () => {
    geminiCalls += 1;
    return Promise.resolve(PAGE_ANSWER);
  };

  const onGemini = await createManualPageReader({ choice: "gemini", gemini, deepseek })(pageInput());
  assertEquals(onGemini.reader, "gemini");
  assertEquals(deepseekCalls, 0);
  assertEquals(geminiCalls, 1);

  const onDeepSeek = await createManualPageReader({ choice: "deepseek", gemini, deepseek })(pageInput());
  assertEquals(onDeepSeek.reader, "deepseek");
  assertEquals(deepseekCalls, 1);
  assertEquals(geminiCalls, 1);
});

Deno.test("a budget pause is a wait, not a reason to fall back to the other provider", async () => {
  let geminiCalls = 0;
  const blocked = new ProviderBlockedError("deepseek", "budget_monthly", "Monthly budget reached");
  const reader = createManualPageReader({
    choice: "deepseek",
    gemini: () => {
      geminiCalls += 1;
      return Promise.resolve(PAGE_ANSWER);
    },
    deepseek: () => {
      throw blocked;
    },
  });

  const err = await assertRejects(() => reader(pageInput()));
  if (!(err instanceof ProviderBlockedError)) throw new Error("the budget pause must reach the worker");
  assertEquals(geminiCalls, 0);
});

Deno.test("a Gemini budget pause on the fallback is also a wait, not a failed page", async () => {
  const reader = createManualPageReader({
    choice: "deepseek",
    gemini: () => {
      throw new ProviderBlockedError("gemini", "budget_daily", "Daily budget reached");
    },
    deepseek: () => {
      throw new ManualReaderJsonError("The page reader answered with something that is not JSON.");
    },
  });

  const err = await assertRejects(() => reader(pageInput()));
  if (!(err instanceof ProviderBlockedError)) throw new Error("the budget pause must reach the worker");
});

Deno.test("no DeepSeek key: the page is read by Gemini, and the fallback is recorded", async () => {
  let fetchCalls = 0;
  const fetchImpl = (() => {
    fetchCalls += 1;
    return jsonResponse({});
  }) as typeof fetch;
  const deepseek = callDeepSeekManualPageReader("", testDeps({ fetchImpl }).deps);

  const result = await createManualPageReader({
    choice: "deepseek",
    gemini: () => Promise.resolve(PAGE_ANSWER),
    deepseek,
  })(pageInput());

  assertEquals(result.reader, "gemini");
  assertEquals(fetchCalls, 0); // nothing was sent without a key
});

Deno.test("DeepSeek finds nothing on a page that has values: Gemini checks it, and an empty check keeps DeepSeek's answer", async () => {
  const empty = { specs: [], intervals: [] };
  const found = { specs: [{ kind: "fluid", key: "engine_oil_capacity_l", value: { value: "2.9", unit: "L" } }] };

  let geminiCalls = 0;
  const withValues = createManualPageReader({
    choice: "deepseek",
    deepseek: () => Promise.resolve(empty),
    gemini: () => {
      geminiCalls += 1;
      return Promise.resolve(found);
    },
    answeredNothing: pageAnswerIsEmpty,
  });
  const a = await withValues(pageInput());
  assertEquals(a.reader, "gemini");
  assertEquals(a.raw, found);
  assertEquals(geminiCalls, 1);

  // A truly empty page (the front memo page): both find nothing, DeepSeek's answer stands.
  const bothEmpty = createManualPageReader({
    choice: "deepseek",
    deepseek: () => Promise.resolve(empty),
    gemini: () => Promise.resolve({ specs: [] }),
    answeredNothing: pageAnswerIsEmpty,
  });
  assertEquals((await bothEmpty(pageInput())).reader, "deepseek");

  // DeepSeek found something: Gemini is never asked.
  let asked = 0;
  const deepFound = createManualPageReader({
    choice: "deepseek",
    deepseek: () => Promise.resolve(found),
    gemini: () => {
      asked += 1;
      return Promise.resolve(found);
    },
    answeredNothing: pageAnswerIsEmpty,
  });
  assertEquals((await deepFound(pageInput())).reader, "deepseek");
  assertEquals(asked, 0);
});
