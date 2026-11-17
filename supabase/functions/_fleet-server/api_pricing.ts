/**
 * api_pricing.ts
 *
 * Local pricing table for outbound third-party APIs. Kept here as the single
 * source of truth used by `api_usage_logger.ts` for cost estimation. All
 * prices in USD. Update manually when providers change rates.
 *
 * Rationale:
 *   Real provider billing is pulled asynchronously by `billing/sync`
 *   (scaffold). For the live command center we need a fast local estimate
 *   attached to every call, so the Overview / Usage / Call Log tabs render
 *   immediately without a third-party round trip.
 */

export type Provider = "openai" | "gemini" | "google_maps" | "supabase" | "uber";

export interface UsageInput {
  inputTokens?: number;
  outputTokens?: number;
  images?: number;
  requests?: number;
}

// ---------------------------------------------------------------------------
// OpenAI — $/1K tokens for chat models, $/image for DALL-E.
// Rates reflect 2026-05 public pricing; keep in sync if OpenAI publishes new.
// ---------------------------------------------------------------------------
const OPENAI_CHAT: Record<string, { in: number; out: number }> = {
  "gpt-4o":           { in: 0.0025, out: 0.01 },
  "gpt-4o-mini":      { in: 0.00015, out: 0.0006 },
  "gpt-4-turbo":      { in: 0.01,   out: 0.03 },
  "gpt-3.5-turbo":    { in: 0.0005, out: 0.0015 },
};

const OPENAI_IMAGE_PER_IMG: Record<string, number> = {
  "dall-e-3": 0.04,
  "dall-e-2": 0.02,
};

// ---------------------------------------------------------------------------
// Google Gemini / Imagen — $/1K tokens for text, $/image for Imagen.
// ---------------------------------------------------------------------------
const GEMINI_TEXT: Record<string, { in: number; out: number }> = {
  "gemini-2.5-flash":            { in: 0.000075, out: 0.0003 },
  "gemini-2.0-flash":            { in: 0.000075, out: 0.0003 },
  "gemini-2.0-flash-lite":       { in: 0.000075, out: 0.0003 },
  "gemini-2.0-flash-exp":        { in: 0.000075, out: 0.0003 },
  "gemini-1.5-flash":            { in: 0.000075, out: 0.0003 },
  "gemini-1.5-flash-latest":     { in: 0.000075, out: 0.0003 },
  "gemini-1.5-pro":              { in: 0.00125, out: 0.005 },
};

const GEMINI_IMAGE_PER_IMG: Record<string, number> = {
  "imagen-4.0-generate-001":       0.04,
  "imagen-4.0-ultra-generate-001": 0.06,
  "gemini-2.0-flash-exp-image-generation": 0.04,
  "gemini-3.1-flash-image": 0.04,
};

// ---------------------------------------------------------------------------
// Google Maps Platform — $/1K requests.
// Ref: https://developers.google.com/maps/billing-and-pricing
// ---------------------------------------------------------------------------
const GOOGLE_MAPS_PER_1K: Record<string, number> = {
  geocoding:          5,
  reverse_geocoding:  5,
  places_text:        32,
  places_autocomplete: 2.83,
  place_details:      17,
  static_maps:        2,
  maps_js_load:       7,
  directions:         5,
};

// ---------------------------------------------------------------------------
// Estimator
// ---------------------------------------------------------------------------
export function estimateCostUSD(
  provider: Provider,
  model: string | undefined,
  service: string | undefined,
  usage: UsageInput
): number {
  try {
    if (provider === "openai") {
      if (service === "image" && model && OPENAI_IMAGE_PER_IMG[model]) {
        return OPENAI_IMAGE_PER_IMG[model] * (usage.images || 1);
      }
      const rate = model ? OPENAI_CHAT[model] : undefined;
      if (!rate) return 0;
      const inTok = usage.inputTokens || 0;
      const outTok = usage.outputTokens || 0;
      return (inTok / 1000) * rate.in + (outTok / 1000) * rate.out;
    }
    if (provider === "gemini") {
      if (service === "image" && model && GEMINI_IMAGE_PER_IMG[model]) {
        return GEMINI_IMAGE_PER_IMG[model] * (usage.images || 1);
      }
      const rate = model ? GEMINI_TEXT[model] : undefined;
      if (!rate) return 0;
      const inTok = usage.inputTokens || 0;
      const outTok = usage.outputTokens || 0;
      return (inTok / 1000) * rate.in + (outTok / 1000) * rate.out;
    }
    if (provider === "google_maps") {
      const rate = service ? GOOGLE_MAPS_PER_1K[service] : undefined;
      if (!rate) return 0;
      const reqs = usage.requests || 1;
      return (reqs / 1000) * rate;
    }
    // Supabase + Uber: infra / integrations — we track usage counts only.
    return 0;
  } catch {
    return 0;
  }
}

export function getPricingTable() {
  return {
    openai:     { chat: OPENAI_CHAT, image: OPENAI_IMAGE_PER_IMG },
    gemini:     { text: GEMINI_TEXT, image: GEMINI_IMAGE_PER_IMG },
    google_maps: GOOGLE_MAPS_PER_1K,
  };
}
