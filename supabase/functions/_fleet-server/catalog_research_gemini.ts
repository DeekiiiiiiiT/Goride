/**
 * Gemini catalog research (audit B3 step 1). Information only — no prices or stock.
 */
import { trackedProviderCall } from "./api_usage_logger.ts";

export type ResearchCandidate = {
  brand: string;
  partNumber: string;
  partName: string;
  matchType: string;
  fits: Record<string, unknown>;
  sources: Array<{ url: string; quote: string }>;
};

const MODEL = "gemini-2.5-flash";

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
};

export function mergeGroundingSources(
  parsed: { candidates?: ResearchCandidate[] },
  geminiJson: GeminiResponse,
): ResearchCandidate[] {
  const base = Array.isArray(parsed.candidates) ? parsed.candidates : [];
  const uris: string[] = [];
  const meta = geminiJson as {
    candidates?: Array<{
      groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string } }> };
    }>;
  };
  for (const c of meta.candidates || []) {
    for (const chunk of c.groundingMetadata?.groundingChunks || []) {
      const uri = chunk.web?.uri;
      if (uri) uris.push(uri);
    }
  }
  if (!uris.length) return base;

  return base.map((cand, idx) => {
    const sources = [...(cand.sources || [])];
    const seen = new Set(sources.map((s) => s.url));
    for (const url of uris) {
      if (seen.has(url)) continue;
      seen.add(url);
      sources.push({ url, quote: sources[0]?.quote || "" });
    }
    if (idx === 0) {
      for (const url of uris) {
        if (!seen.has(url)) sources.push({ url, quote: "" });
      }
    }
    return { ...cand, sources };
  });
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
{"candidates":[{"brand":"","partNumber":"","partName":"","matchType":"","fits":{},"sources":[{"url":"","quote":""}]}]}
Rules: up to 5 candidates; no prices, suppliers, stock, or quotes about buying; include source URLs with a short quoted line from each page.`;

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
  const merged = mergeGroundingSources(parsed, result);
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
