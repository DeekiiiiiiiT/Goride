/**
 * The one Gemini image call per part picture (§3.3). Mirrors vehicle_picture_imagen.ts: same budgeted/tracked call,
 * but the request carries the catalogue diagram as inline image data and asks for a square picture.
 */
import { trackedProviderCall } from "./api_usage_logger.ts";
import { estimateCostUSD } from "./api_pricing.ts";

export type PartPictureImageInput = { contentType: string; bytes: Uint8Array };

export type PartPictureResult = {
  bytes: Uint8Array;
  imageExt: "png" | "jpg";
  imageContentType: "image/png" | "image/jpeg";
  costUsd: number;
  prompt: string;
};

export type PartPictureCaller = (opts: {
  model: string;
  prompt: string;
  images: PartPictureImageInput[];
  timeoutMs: number;
}) => Promise<PartPictureResult>;

/** One picture is allowed to take this long; the worker's row lease is longer than this. */
const DEFAULT_TIMEOUT_MS = 50_000;

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function isPngSignature(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return false;
  }
  return true;
}

/** The model returns PNG or JPEG; the stored extension always comes from the bytes (PP-21: no WebP encoder). */
export function imageFormat(bytes: Uint8Array): { ext: "png" | "jpg"; contentType: "image/png" | "image/jpeg" } | null {
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

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x4000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
  }
  return btoa(binary);
}

export function createProductionPartPictureCaller(getApiKey: () => string | undefined): PartPictureCaller {
  return async ({ model, prompt, images, timeoutMs }) => {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await trackedProviderCall({
        provider: "gemini",
        service: "image",
        route: "/part-pictures/imagen",
        model,
        images: 1,
        run: async () => {
          const parts = [
            { text: prompt },
            ...images.map((image) => ({
              inlineData: { mimeType: image.contentType, data: toBase64(image.bytes) },
            })),
          ];
          const res = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey,
            },
            signal: controller.signal,
            body: JSON.stringify({
              contents: [{ parts }],
              generationConfig: {
                responseModalities: ["IMAGE"],
                imageConfig: { aspectRatio: "1:1" },
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
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const fmt = imageFormat(bytes);
      if (!fmt) throw new Error("Imagen returned no image");
      const costUsd = estimateCostUSD("gemini", model, "image", { images: 1 }) || 0.04;
      return {
        bytes,
        imageExt: fmt.ext,
        imageContentType: fmt.contentType,
        costUsd,
        prompt,
      };
    } finally {
      clearTimeout(timer);
    }
  };
}

export type PartPictureStubFail =
  | { kind: "content" }
  | { kind: "key"; status?: 401 | 403 }
  | { kind: "outage"; status?: number }
  | { kind: "timeout" }
  | { kind: "message"; message: string };

/** Fake caller for tests: fails in one of the classes the worker must tell apart. */
export function stubPartPictureFail(fail: PartPictureStubFail): PartPictureCaller {
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

/** Fake caller for tests: returns the given bytes (a PNG signature by default) after an optional delay. */
export function stubPartPictureCaller(opts: {
  bytes?: Uint8Array;
  delayMs?: number;
  costUsd?: number;
} = {}): PartPictureCaller {
  const bytes = opts.bytes ?? new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  return async ({ prompt }) => {
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    const fmt = imageFormat(bytes);
    if (!fmt) throw new Error("Imagen returned no image");
    return {
      bytes,
      imageExt: fmt.ext,
      imageContentType: fmt.contentType,
      costUsd: opts.costUsd ?? 0.04,
      prompt,
    };
  };
}

export { DEFAULT_TIMEOUT_MS as PART_PICTURE_TIMEOUT_MS };
