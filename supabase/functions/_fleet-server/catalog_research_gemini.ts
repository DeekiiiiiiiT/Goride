/**
 * Gemini catalog research (audit B3 step 1). Information only — no prices or stock.
 */
import { trackedProviderCall } from "./api_usage_logger.ts";
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

const MODEL = "gemini-2.5-flash";

type GroundingMetadata = {
  groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
  groundingSupports?: Array<{
    segment?: { text?: string };
    groundingChunkIndices?: number[];
  }>;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    groundingMetadata?: GroundingMetadata;
  }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
};

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
}): Promise<{ model: string; candidates: ResearchCandidate[]; raw?: GeminiResponse }> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");

  const prompt = `${input.promptContext}

Return ONLY valid JSON:
{"candidates":[{"brand":"","partNumber":"","partName":"","matchType":"","fits":{},"sources":[{"quote":""}]}]}
Rules: up to 5 candidates; no prices, suppliers, stock, or quotes about buying; short quoted lines from each source page in sources[].quote (URLs are attached from search grounding — do not paste links).`;

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.1 },
  };

  const result = await trackedProviderCall({
    provider: "gemini",
    service: "text",
    route: "catalog_research/runCatalogPartResearch",
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
        throw new Error(`gemini_http_${res.status}`);
      }
      return await res.json();
    },
    extractUsage: (r: GeminiResponse) => ({
      inputTokens: r?.usageMetadata?.promptTokenCount,
      outputTokens: r?.usageMetadata?.candidatesTokenCount,
    }),
  }) as GeminiResponse;

  const text = result?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "{}";
  const parsed = parseCandidatesFromGeminiText(text);
  const merged = attachGroundingSourcesToCandidates(parsed, result);
  return { model: MODEL, candidates: merged, raw: result };
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
    extractUsage: (r: GeminiResponse) => ({
      inputTokens: r?.usageMetadata?.promptTokenCount,
      outputTokens: r?.usageMetadata?.candidatesTokenCount,
    }),
  }) as GeminiResponse;

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
