/**
 * Magic-byte detection for Fleet storage uploads (Deno).
 * Keep in sync with supabase/functions/_shared/fileMagic.ts
 */

export function detectFileMagicBytes(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  const sig = (...b: number[]) => b.every((v, i) => bytes[i] === v);

  if (sig(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (sig(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (
    sig(0x52, 0x49, 0x46, 0x46) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  if (sig(0x25, 0x50, 0x44, 0x46)) return "application/pdf";
  if (
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (brand.startsWith("heic") || brand.startsWith("mif1") || brand.startsWith("msf1")) {
      return "image/heic";
    }
  }
  return null;
}

export function extForMime(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "application/pdf":
      return "pdf";
    case "image/heic":
      return "heic";
    default:
      return "bin";
  }
}

export const IMAGE_AND_PDF_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "image/heic",
]);
