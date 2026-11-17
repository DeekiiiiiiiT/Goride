/**
 * App side of file uploads to Cloudflare R2
 * (docs/cloudflare-r2-storage-migration-audit.md §3.4).
 *
 *   1. shrink photos on the device (1600 px longest side, WebP)
 *   2. ask our server for a one-time upload link  (start)
 *   3. PUT the file straight to R2
 *   4. tell our server it is done                 (finish) → returns the stored key
 *
 * `start` / `finish` call the app's own server routes, so each app passes its
 * authenticated fetchers in.
 */

export const MAX_PHOTO_EDGE = 1600;
export const PHOTO_QUALITY = 0.82;
const SHRINKABLE = new Set(["image/jpeg", "image/png", "image/webp"]);

export type StartUploadResponse = {
  uploadUrl: string;
  headers: { "content-type": string };
  ticket: string;
};

export type FinishedUpload = {
  key: string;
  bucket: "public" | "private";
  size: number;
  contentType: string;
  publicUrl: string | null;
};

export type UploadToStorageOptions = {
  file: Blob;
  start: (req: { contentType: string; size: number }) => Promise<StartUploadResponse>;
  finish: (req: { ticket: string }) => Promise<FinishedUpload>;
  /** Default true. Turn off for files that must stay byte-exact (e.g. logos with exact colours). */
  shrinkPhotos?: boolean;
  fetchImpl?: typeof fetch;
  shrinkImpl?: (file: Blob) => Promise<Blob>;
};

/** New size that fits inside MAX_PHOTO_EDGE, never enlarging. */
export function fitWithin(width: number, height: number, maxEdge = MAX_PHOTO_EDGE): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

async function encode(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, PHOTO_QUALITY));
}

/** Browser/WebView: resize + re-encode. Returns the original when it can't help. */
export async function shrinkPhoto(file: Blob): Promise<Blob> {
  if (!SHRINKABLE.has(file.type) || typeof createImageBitmap !== "function" || typeof document === "undefined") {
    return file;
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  let out = await encode(canvas, "image/webp");
  // Older Safari can't encode WebP and silently returns PNG.
  if (!out || out.type !== "image/webp") out = await encode(canvas, "image/jpeg");
  if (!out || out.size >= file.size) return file;
  return out;
}

export async function uploadToStorage(opts: UploadToStorageOptions): Promise<FinishedUpload> {
  const doFetch = opts.fetchImpl ?? fetch;
  const shrink = opts.shrinkImpl ?? shrinkPhoto;
  const body = opts.shrinkPhotos === false ? opts.file : await shrink(opts.file);
  const contentType = body.type || opts.file.type;
  if (!contentType) throw new Error("File type unknown");

  const started = await opts.start({ contentType, size: body.size });
  const put = await doFetch(started.uploadUrl, {
    method: "PUT",
    headers: { "content-type": started.headers["content-type"] },
    body,
  });
  if (!put.ok) throw new Error(`Upload failed (${put.status})`);
  return opts.finish({ ticket: started.ticket });
}
