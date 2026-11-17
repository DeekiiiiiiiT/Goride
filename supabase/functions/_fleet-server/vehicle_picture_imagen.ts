import { trackedProviderCall } from "./api_usage_logger.ts";
import { estimateCostUSD } from "./api_pricing.ts";
import { buildPicturePrompt, PROMPT_VERSION } from "../_shared/vehiclePictures/prompt.ts";
import type { VehicleLook } from "../_shared/vehiclePictures/lookKey.ts";

export type ImagenResult = {
  pngBytes: Uint8Array;
  /** Stored file extension (gemini-3.1-flash-image often returns JPEG). */
  imageExt: "png" | "jpg";
  imageContentType: "image/png" | "image/jpeg";
  costUsd: number;
  prompt: string;
  promptVersion: number;
};

export type ImagenCaller = (opts: {
  model: string;
  look: VehicleLook;
  timeoutMs: number;
}) => Promise<ImagenResult>;

const DEFAULT_TIMEOUT_MS = 50_000;

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function isPngSignature(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return false;
  }
  return true;
}

function imageFormat(bytes: Uint8Array): { ext: "png" | "jpg"; contentType: "image/png" | "image/jpeg" } | null {
  if (isPngSignature(bytes)) return { ext: "png", contentType: "image/png" };
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { ext: "jpg", contentType: "image/jpeg" };
  }
  return null;
}

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }>;
    };
  }>;
};

function firstInlineImageBase64(body: GeminiGenerateContentResponse): string | undefined {
  const parts = body.candidates?.[0]?.content?.parts;
  if (!parts) return undefined;
  for (const part of parts) {
    const data = part.inlineData?.data;
    if (typeof data === "string" && data.length > 0) return data;
  }
  return undefined;
}

export function createProductionImagenCaller(getApiKey: () => string | undefined): ImagenCaller {
  return async ({ model, look, timeoutMs }) => {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
    const prompt = buildPicturePrompt(look);
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await trackedProviderCall({
        provider: "gemini",
        service: "image",
        route: "/vehicle-pictures/imagen",
        model,
        images: 1,
        run: async () => {
          const res = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey,
            },
            signal: controller.signal,
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                responseModalities: ["IMAGE"],
                imageConfig: { aspectRatio: "4:3" },
              },
            }),
          });
          if (!res.ok) {
            const text = await res.text();
            throw new Error(`Imagen HTTP ${res.status}: ${text.slice(0, 300)}`);
          }
          return await res.json() as GeminiGenerateContentResponse;
        },
        extractUsage: () => ({ images: 1 }),
      });
      const b64 = firstInlineImageBase64(response);
      if (!b64) throw new Error("Imagen returned no image");
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const fmt = imageFormat(bin);
      if (!fmt) throw new Error("Imagen returned no image");
      const costUsd = estimateCostUSD("gemini", model, "image", { images: 1 }) || 0.04;
      return {
        pngBytes: bin,
        imageExt: fmt.ext,
        imageContentType: fmt.contentType,
        costUsd,
        prompt,
        promptVersion: PROMPT_VERSION,
      };
    } finally {
      clearTimeout(timer);
    }
  };
}

export type ImagenStubFail =
  | { kind: "content" }
  | { kind: "key"; status?: 401 | 403 }
  | { kind: "outage"; status?: number }
  | { kind: "timeout" }
  | { kind: "message"; message: string };

export function stubImagenFail(fail: ImagenStubFail): ImagenCaller {
  return async () => {
    switch (fail.kind) {
      case "content":
        throw new Error("Imagen returned no image");
      case "key":
        throw new Error(`Imagen HTTP ${fail.status ?? 401}: invalid key`);
      case "outage":
        throw new Error(`Imagen HTTP ${fail.status ?? 500}: upstream error`);
      case "timeout": {
        const err = new Error("The operation was aborted");
        err.name = "AbortError";
        throw err;
      }
      case "message":
        throw new Error(fail.message);
    }
  };
}

export function stubImagenCaller(delayMs: number, png?: Uint8Array): ImagenCaller {
  const bytes = png ?? new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return async ({ look }) => {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    return {
      pngBytes: bytes,
      imageExt: "png",
      imageContentType: "image/png",
      costUsd: 0.04,
      prompt: buildPicturePrompt(look),
      promptVersion: PROMPT_VERSION,
    };
  };
}

export { DEFAULT_TIMEOUT_MS as IMAGEN_TIMEOUT_MS };