/**
 * Gemini provider faults (audit R19) — not job failures.
 */

export type GeminiProviderError = {
  httpStatus: number;
  pausedReason: string;
  autoResumeMinutes: number | null;
};

export function classifyGeminiProviderError(err: unknown): GeminiProviderError | null {
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.match(/gemini_http_(\d{3})/i);
  if (!m) return null;
  const status = Number(m[1]);
  if (status === 402) {
    return { httpStatus: 402, pausedReason: "Gemini credits used up", autoResumeMinutes: null };
  }
  if (status === 401 || status === 403) {
    return { httpStatus: status, pausedReason: "Gemini key rejected", autoResumeMinutes: null };
  }
  if (status === 429) {
    return { httpStatus: 429, pausedReason: "Gemini rate limit", autoResumeMinutes: 15 };
  }
  return null;
}
