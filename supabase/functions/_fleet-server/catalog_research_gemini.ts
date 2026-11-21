/**
 * Gemini catalog research (audit B3 step 1). Information only — no prices or stock.
 */
import { GEMINI_TEXT_MODEL } from "./gemini_models.ts";
import { logGroundingQueries, trackedProviderCall } from "./api_usage_logger.ts";
import { normalizePartNumberNorm } from "./catalog_research_number_shape.ts";

export type ResearchSource = {
  url: string;
  quote: string;
  grounding_title?: string;
};

export type ResearchCandidate = {
  brand: string;
  partNumber: string;
  partName: string;
  matchType: string;
  fits: Record<string, unknown>;
  sources: ResearchSource[];
};

const MODEL = GEMINI_TEXT_MODEL;

type GroundingMetadata = {
  webSearchQueries?: string[];
  groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
  groundingSupports?: Array<{
    segment?: { text?: string };
    groundingChunkIndices?: number[];
  }>;
};

export type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    groundingMetadata?: GroundingMetadata;
  }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
  groundingMetadata?: GroundingMetadata;
};

/** Google Search queries a grounded call ran — the unit Google bills grounding by (RE-24). */
export function countGroundingQueries(geminiJson: GeminiResponse): number {
  let n = geminiJson?.groundingMetadata?.webSearchQueries?.length || 0;
  for (const c of geminiJson?.candidates || []) {
    n += c.groundingMetadata?.webSearchQueries?.length || 0;
  }
  return n;
}

/** Billed token usage: thinking tokens are billed as output. */
export function geminiBilledUsage(r: GeminiResponse): { inputTokens?: number; outputTokens?: number } {
  const out = (r?.usageMetadata?.candidatesTokenCount || 0) + (r?.usageMetadata?.thoughtsTokenCount || 0);
  return { inputTokens: r?.usageMetadata?.promptTokenCount, outputTokens: out || undefined };
}

export function countGroundingChunks(geminiJson: GeminiResponse): number {
  let n = 0;
  const root = geminiJson.groundingMetadata;
  if (root?.groundingChunks) n += root.groundingChunks.length;
  for (const c of geminiJson.candidates || []) {
    n += c.groundingMetadata?.groundingChunks?.length || 0;
  }
  return n;
}

export function buildCatalogPartSearchPrompt(input: {
  searchQuery: string;
  promptContext: string;
  trustedDomains: string[];
}): string {
  const domains = input.trustedDomains.filter(Boolean).slice(0, 20);
  const domainLine = domains.length
    ? `Prefer catalogue results on: ${domains.join(", ")}.`
    : "";
  return [
    "Use Google Search before answering.",
    `Search query: ${input.searchQuery.trim()}`,
    domainLine,
    input.promptContext.trim(),
    "",
    "Search the web, then list up to 5 part-number matches you found on catalogue pages.",
    "For each match include: brand, part number, part name, match type (OEM/Aftermarket/etc), and a short quote copied from the page.",
    "Do not invent part numbers that do not appear on pages you searched. No prices, suppliers, or stock.",
  ].filter(Boolean).join("\n");
}

export function buildCatalogPartJsonFromNotesPrompt(notes: string): string {
  return [
    "Convert these catalogue research notes into JSON only.",
    notes.trim(),
    "",
    '{"candidates":[{"brand":"","partNumber":"","partName":"","matchType":"","fits":{},"sources":[{"quote":""}]}]}',
    "Rules: up to 5 candidates; sources[].quote only (no URLs); no prices or stock.",
  ].join("\n");
}

/** Full prompt including JSON (tests / legacy). Search phase uses buildCatalogPartSearchPrompt. */
export function buildCatalogPartResearchPrompt(input: {
  searchQuery: string;
  promptContext: string;
  trustedDomains: string[];
}): string {
  return [
    buildCatalogPartSearchPrompt(input),
    "",
    "Return ONLY valid JSON:",
    '{"candidates":[{"brand":"","partNumber":"","partName":"","matchType":"","fits":{},"sources":[{"quote":""}]}]}',
    "Rules: up to 5 candidates; no prices, suppliers, stock, or quotes about buying; short quoted lines from each source page in sources[].quote (URLs are attached from search grounding — do not paste links).",
  ].join("\n");
}

function segmentMatchesPartNumber(segmentText: string, partNumber: string): boolean {
  const norm = normalizePartNumberNorm(partNumber);
  if (!norm) return false;
  if (normalizePartNumberNorm(segmentText).includes(norm)) return true;
  const raw = String(partNumber || "").trim().toLowerCase();
  return Boolean(raw && segmentText.toLowerCase().includes(raw));
}

/** R28: source URLs only from groundingChunks; matched to candidates via groundingSupports + part number. */
export function attachGroundingSourcesToCandidates(
  parsed: { candidates?: ResearchCandidate[] },
  geminiJson: GeminiResponse,
): ResearchCandidate[] {
  const base = Array.isArray(parsed.candidates) ? parsed.candidates : [];
  const chunks: NonNullable<GroundingMetadata["groundingChunks"]> = [];
  const supports: NonNullable<GroundingMetadata["groundingSupports"]> = [];
  const rootMeta = (geminiJson as { groundingMetadata?: GroundingMetadata }).groundingMetadata;
  if (rootMeta?.groundingChunks) chunks.push(...rootMeta.groundingChunks);
  if (rootMeta?.groundingSupports) supports.push(...rootMeta.groundingSupports);
  for (const c of geminiJson.candidates || []) {
    const gm = c.groundingMetadata;
    if (gm?.groundingChunks) chunks.push(...gm.groundingChunks);
    if (gm?.groundingSupports) supports.push(...gm.groundingSupports);
  }

  if (!chunks.length) {
    return base.map((c) => ({ ...c, sources: [] }));
  }

  function sourcesForCandidate(cand: ResearchCandidate, candidateIndex: number, candidateCount: number): ResearchSource[] {
    const modelQuotes = (cand.sources || []).map((s) => String(s.quote || "").trim()).filter(Boolean);
    const chunkIndices = new Set<number>();
    const partNorm = normalizePartNumberNorm(cand.partNumber);
    const partName = String(cand.partName || "").trim().toLowerCase();

    for (const support of supports) {
      const text = support.segment?.text || "";
      const textLower = text.toLowerCase();
      const numberHit = partNorm.length >= 4 && normalizePartNumberNorm(text).includes(partNorm);
      const dashedHit = cand.partNumber.trim() && textLower.includes(cand.partNumber.trim().toLowerCase());
      const nameHit = partName.length >= 4 && textLower.includes(partName);
      if (!numberHit && !dashedHit && !nameHit) continue;
      for (const idx of support.groundingChunkIndices || []) {
        if (Number.isInteger(idx) && idx >= 0 && idx < chunks.length) chunkIndices.add(idx);
      }
    }

    if (!chunkIndices.size && supports.length === 0) {
      for (let i = 0; i < chunks.length && chunkIndices.size < 3; i += 1) chunkIndices.add(i);
    }
    if (!chunkIndices.size && chunks.length > 0) {
      for (let i = 0; i < Math.min(3, chunks.length); i += 1) {
        chunkIndices.add((candidateIndex + i) % chunks.length);
      }
    }

    const sources: ResearchSource[] = [];
    const seenUrls = new Set<string>();
    let quoteIdx = 0;
    for (const idx of [...chunkIndices].sort((a, b) => a - b)) {
      const chunk = chunks[idx];
      const uri = chunk?.web?.uri?.trim();
      if (!uri || seenUrls.has(uri)) continue;
      seenUrls.add(uri);
      const quote = modelQuotes[quoteIdx] || "";
      if (quote) quoteIdx += 1;
      sources.push({
        url: uri,
        quote,
        grounding_title: chunk?.web?.title?.trim() || undefined,
      });
    }
    return sources.slice(0, 3);
  }

  return base.map((cand, idx) => ({ ...cand, sources: sourcesForCandidate(cand, idx, base.length) }));
}

/** @deprecated Use attachGroundingSourcesToCandidates */
export function mergeGroundingSources(
  parsed: { candidates?: ResearchCandidate[] },
  geminiJson: GeminiResponse,
): ResearchCandidate[] {
  return attachGroundingSourcesToCandidates(parsed, geminiJson);
}

/** Google grounding chunk titles are usually the catalogue domain. */
export function domainFromGroundingTitle(title: string): string {
  const t = String(title || "").trim().toLowerCase().replace(/^www\./, "");
  if (!t) return "";
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(t)) return t;
  try {
    if (t.includes("://")) return new URL(t).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    // ignore
  }
  return "";
}

export function parseCandidatesFromGeminiText(text: string): { candidates?: ResearchCandidate[] } {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : { candidates: [] };
  }
}

export async function runCatalogPartResearch(input: {
  promptContext: string;
  searchQuery: string;
  trustedDomains: string[];
}): Promise<{ model: string; candidates: ResearchCandidate[]; raw?: GeminiResponse }> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");

  const callGemini = async (
    route: string,
    prompt: string,
    withSearch: boolean,
  ): Promise<GeminiResponse> => {
    const body: Record<string, unknown> = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1 },
    };
    if (withSearch) body.tools = [{ google_search: {} }];

    return await trackedProviderCall({
      provider: "gemini",
      service: "text",
      route,
      model: MODEL,
      run: async () => {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        if (!res.ok) {
          const bodyText = await res.text();
          const snippet = bodyText.slice(0, 300);
          throw new Error(`gemini_http_${res.status}: ${snippet}`);
        }
        return await res.json();
      },
      extractUsage: (r: GeminiResponse) => geminiBilledUsage(r),
    }).then(async (r) => {
      if (withSearch) {
        await logGroundingQueries({ route, model: MODEL, queries: countGroundingQueries(r as GeminiResponse) });
      }
      return r;
    }) as GeminiResponse;
  };

  const searchPrompt = buildCatalogPartSearchPrompt(input);
  const searchResult = await callGemini(
    "catalog_research/runCatalogPartResearch/search",
    searchPrompt,
    true,
  );

  const groundingChunks = countGroundingChunks(searchResult);
  if (groundingChunks === 0) {
    const text = searchResult?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "{}";
    const parsed = parseCandidatesFromGeminiText(text);
    const merged = attachGroundingSourcesToCandidates(parsed, searchResult);
    return { model: MODEL, candidates: merged, raw: searchResult };
  }

  const notes = searchResult?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("\n") || "";
  const jsonPrompt = buildCatalogPartJsonFromNotesPrompt(notes);
  const jsonResult = await callGemini(
    "catalog_research/runCatalogPartResearch/json",
    jsonPrompt,
    false,
  );

  const text = jsonResult?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "{}";
  const parsed = parseCandidatesFromGeminiText(text);
  const merged = attachGroundingSourcesToCandidates(parsed, searchResult);
  return { model: MODEL, candidates: merged, raw: searchResult };
}

export async function runCatalogVehicleResearch(input: {
  promptContext: string;
}): Promise<{ model: string; proposal: Record<string, unknown> }> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");

  const prompt = `${input.promptContext}

Return ONLY valid JSON with keys: make, model, productionStartYear, productionEndYear, chassisCode, engineCode, drivetrain, transmission, market, sources (array of url+quote).`;

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.1 },
  };

  const result = await trackedProviderCall({
    provider: "gemini",
    service: "text",
    route: "catalog_research/runCatalogVehicleResearch",
    model: MODEL,
    run: async () => {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) throw new Error(`gemini_http_${res.status}`);
      return await res.json();
    },
    extractUsage: (r: GeminiResponse) => geminiBilledUsage(r),
  }) as GeminiResponse;
  await logGroundingQueries({
    route: "catalog_research/runCatalogVehicleResearch",
    model: MODEL,
    queries: countGroundingQueries(result),
  });

  const text = result?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "{}";
  let proposal: Record<string, unknown> = {};
  try {
    proposal = JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    proposal = match ? JSON.parse(match[0]) : {};
  }
  return { model: MODEL, proposal };
}

/** One grounded call that returns JSON; logs tokens + grounding queries (RE-24). */
async function groundedJson(route: string, prompt: string): Promise<{ json: unknown; raw: GeminiResponse }> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");
  const result = await trackedProviderCall({
    provider: "gemini",
    service: "text",
    route,
    model: MODEL,
    run: async () => {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            tools: [{ google_search: {} }],
            generationConfig: { temperature: 0.1 },
          }),
        },
      );
      if (!res.ok) {
        const bodyText = await res.text();
        throw new Error(`gemini_http_${res.status}: ${bodyText.slice(0, 300)}`);
      }
      return await res.json();
    },
    extractUsage: (r: GeminiResponse) => geminiBilledUsage(r),
  }) as GeminiResponse;
  await logGroundingQueries({ route, model: MODEL, queries: countGroundingQueries(result) });
  const text = result?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
  let json: unknown = null;
  const match = text.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
  try {
    json = match ? JSON.parse(match[0]) : null;
  } catch {
    json = null;
  }
  return { json, raw: result };
}

/** Grounding URLs Google used, so sources come from search, never from the model's own text. */
export function groundingUrls(r: GeminiResponse): string[] {
  const urls: string[] = [];
  const push = (m?: GroundingMetadata) => {
    for (const ch of m?.groundingChunks || []) if (ch.web?.uri) urls.push(ch.web.uri);
  };
  push(r?.groundingMetadata);
  for (const c of r?.candidates || []) push(c.groundingMetadata);
  return [...new Set(urls)];
}

/** RE-06: a suggested value for one spec of one car. The value is a suggestion until a page proves it. */
export async function runCatalogSpecResearch(input: {
  carLine: string;
  specLabel: string;
  unit?: string | null;
}): Promise<{ model: string; value: string | null; sourceTitles: string[]; sourceUrls: string[] }> {
  const prompt = [
    "Use Google Search before answering.",
    `Car: ${input.carLine}`,
    `Find: ${input.specLabel}${input.unit ? ` (in ${input.unit})` : ""} as listed by the car maker or a catalogue.`,
    'Return ONLY JSON: {"value": "<the value, or null if not found>"}. Do not guess.',
  ].join("\n");
  const { json, raw } = await groundedJson("catalog_research/runCatalogSpecResearch", prompt);
  const value = json && typeof json === "object" && !Array.isArray(json)
    ? String((json as { value?: unknown }).value ?? "").trim() || null
    : null;
  const titles = [...new Set((raw?.candidates || []).flatMap((c) => (c.groundingMetadata?.groundingChunks || []).map((g) => g.web?.title || "")).filter(Boolean))];
  return { model: MODEL, value: value && value.toLowerCase() !== "null" ? value.slice(0, 120) : null, sourceTitles: titles, sourceUrls: groundingUrls(raw) };
}

/** RE-08: every version of a model (car facts only). */
export async function runCatalogModelResearch(input: { make: string; model: string }): Promise<{
  model: string;
  versions: Array<Record<string, unknown>>;
  sourceUrls: string[];
}> {
  const prompt = [
    "Use Google Search before answering.",
    `List every version of the ${input.make} ${input.model} sold new: one entry per frame (chassis) code + engine + drivetrain.`,
    "Return ONLY a JSON array of objects with keys: productionStartYear, productionEndYear, chassisCode, engineCode, drivetrain, transmission, grade, market.",
    "Use null for anything you could not find. Do not guess.",
  ].join("\n");
  const { json, raw } = await groundedJson("catalog_research/runCatalogModelResearch", prompt);
  const versions = Array.isArray(json) ? (json as Array<Record<string, unknown>>).slice(0, 40) : [];
  return { model: MODEL, versions, sourceUrls: groundingUrls(raw) };
}
