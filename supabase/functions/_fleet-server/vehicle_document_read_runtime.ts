import { Buffer } from "node:buffer";
import OpenAI from "npm:openai";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { trackedProviderCall, ProviderBlockedError } from "./api_usage_logger.ts";
import {
  type DocumentReadDeps,
  type DocumentReadError,
  DEFAULT_READER_MODEL,
  DEFAULT_READER_PROVIDER,
  jamaicaCalendarDay,
} from "./vehicle_document_read.ts";
import { loadVehiclePicturesSettings } from "./vehicle_pictures_settings.ts";

const USER_HOUR_MAX = 20;
const ORG_DAY_MAX = 200;

export function buildProductionDocumentReadDeps(
  supabase: SupabaseClient,
  getOpenAiKey: () => string | undefined,
  getGeminiKey: () => string | undefined,
): DocumentReadDeps {
  return {
    now: () => new Date(),
    loadSettings: async () => {
      const s = await loadVehiclePicturesSettings();
      return {
        reader_provider: typeof s.reader_provider === "string" ? s.reader_provider : DEFAULT_READER_PROVIDER,
        reader_model: typeof s.reader_model === "string" ? s.reader_model : DEFAULT_READER_MODEL,
      };
    },
    assertUserRateLimit: async (userId) => {
      const { data, error } = await supabase
        .rpc("vehicle_document_read_counts", {
          p_user: userId,
          p_org: "",
        });
      if (error) {
        console.error("[vehicle_document_read] read_counts failed:", error.message);
        return null;
      }
      const row = Array.isArray(data) ? data[0] : data;
      const count = Number((row as { user_hour_count?: number })?.user_hour_count ?? 0);
      if (count < USER_HOUR_MAX) return null;
      return {
        ok: false,
        httpStatus: 429,
        code: "READ_LIMIT_USER",
        error: "You've scanned a lot of documents — try again in an hour, or type the details.",
      } satisfies DocumentReadError;
    },
    assertOrgRateLimit: async (orgId, _now) => {
      const { data, error } = await supabase
        .rpc("vehicle_document_read_counts", {
          p_user: "00000000-0000-0000-0000-000000000000",
          p_org: orgId,
        });
      if (error) {
        console.error("[vehicle_document_read] read_counts failed:", error.message);
        return null;
      }
      const row = Array.isArray(data) ? data[0] : data;
      const count = Number((row as { org_day_count?: number })?.org_day_count ?? 0);
      if (count < ORG_DAY_MAX) return null;
      return {
        ok: false,
        httpStatus: 429,
        code: "READ_LIMIT_ORG",
        error: "Your fleet has scanned a lot of documents today — try again tomorrow, or type the details.",
      } satisfies DocumentReadError;
    },
    recordRead: async (userId, orgId, now) => {
      const { error } = await supabase.from("fleet_vehicle_document_read_log").insert({
        user_id: userId,
        organization_id: orgId,
        read_at: now.toISOString(),
      });
      if (error) console.error("[vehicle_document_read] recordRead failed:", error.message);
    },
    callReader: async (input) => {
      const provider = input.provider?.trim().toLowerCase() || DEFAULT_READER_PROVIDER;
      const base64 = Buffer.from(input.imageBytes).toString("base64");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 45_000);
      try {
        if (provider === "gemini") {
          const apiKey = getGeminiKey();
          if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
          const url =
            `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent`;
          const response = await trackedProviderCall({
            provider: "gemini",
            service: "vision",
            route: "/make-server-37f42386/parse-document",
            model: input.model,
            userId: input.userId,
            orgId: input.orgId,
            run: async () => {
              const res = await fetch(url, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-goog-api-key": apiKey,
                },
                signal: controller.signal,
                body: JSON.stringify({
                  contents: [{
                    parts: [
                      { text: input.prompt },
                      { inlineData: { mimeType: input.mime, data: base64 } },
                    ],
                  }],
                  generationConfig: { responseMimeType: "application/json" },
                }),
              });
              if (!res.ok) {
                const text = await res.text();
                throw new Error(`Gemini HTTP ${res.status}: ${text.slice(0, 300)}`);
              }
              return await res.json() as {
                candidates?: Array<{
                  content?: { parts?: Array<{ text?: string }> };
                }>;
              };
            },
            extractUsage: () => ({}),
          });
          const text = response.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
          return JSON.parse(text) as Record<string, unknown>;
        }

        const apiKey = getOpenAiKey();
        if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
        const openai = new OpenAI({ apiKey });
        const dataUrl = `data:${input.mime};base64,${base64}`;
        const response = await trackedProviderCall({
          provider: "openai",
          service: "vision",
          route: "/make-server-37f42386/parse-document",
          model: input.model,
          userId: input.userId,
          orgId: input.orgId,
          run: () =>
            openai.chat.completions.create(
              {
                model: input.model,
                messages: [
                  {
                    role: "user",
                    content: [
                      { type: "text", text: input.prompt },
                      { type: "image_url", image_url: { url: dataUrl } },
                    ],
                  },
                ],
                response_format: { type: "json_object" },
              },
              { signal: controller.signal },
            ),
          extractUsage: (r) => ({
            inputTokens: r?.usage?.prompt_tokens,
            outputTokens: r?.usage?.completion_tokens,
            requestId: r?.id,
          }),
        });
        const text = response.choices[0]?.message?.content ?? "{}";
        return JSON.parse(text) as Record<string, unknown>;
      } catch (e) {
        if (e instanceof ProviderBlockedError) throw e;
        throw e;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}