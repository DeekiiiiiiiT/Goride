/**
 * Part research Gemini retry + candidate filtering (R30).
 */
import type { GeminiResponse, ResearchCandidate } from "./catalog_research_gemini.ts";
import { countGroundingChunks } from "./catalog_research_gemini.ts";

export type PartResearchResult = {
  model: string;
  candidates: ResearchCandidate[];
  raw?: GeminiResponse;
};

export function filterCandidatesWithGroundingSources(candidates: ResearchCandidate[]): ResearchCandidate[] {
  return candidates.filter((c) => (c.sources?.length ?? 0) > 0);
}

export function geminiHttpErrorDetail(err: unknown): { status: number; bodySnippet: string } | null {
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.match(/^gemini_http_(\d{3}):\s*([\s\S]*)$/);
  if (!m) {
    const short = msg.match(/gemini_http_(\d{3})/i);
    if (!short) return null;
    return { status: Number(short[1]), bodySnippet: msg.slice(0, 300) };
  }
  return { status: Number(m[1]), bodySnippet: String(m[2] || "").slice(0, 300) };
}

export async function runPartGeminiResearchWithRetry(
  runOnce: () => Promise<PartResearchResult>,
  onRetry: () => Promise<void>,
): Promise<{ research: PartResearchResult; attempts: number; groundingChunks: number }> {
  let research = await runOnce();
  let attempts = 1;
  let groundingChunks = countGroundingChunks(research.raw ?? {});

  if (groundingChunks === 0) {
    await onRetry();
    research = await runOnce();
    attempts = 2;
    groundingChunks = countGroundingChunks(research.raw ?? {});
  }

  research = {
    ...research,
    candidates: filterCandidatesWithGroundingSources(research.candidates),
  };

  return { research, attempts, groundingChunks };
}
