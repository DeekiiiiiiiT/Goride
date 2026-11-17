/**
 * Does the uploaded file really match the type the app declared?
 * Binary types: magic bytes (shared with the old Supabase upload paths).
 * Text types (CSV / plain): no NUL or binary control bytes in the first 4 KB.
 * SVG: must be an <svg> document with no script, event handlers or javascript: links
 *      (it is served publicly from media.roamfleet.co).
 */
import { detectFileMagicBytes } from "../fileMagic.ts";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const SVG_MAX_SCAN_BYTES = 2 * 1024 * 1024;

function looksLikeText(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  for (const b of bytes) {
    if (b === 0) return false;
    if (b < 0x09 || (b > 0x0d && b < 0x20 && b !== 0x1b)) return false;
  }
  return true;
}

function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/** Needs only the first bytes of the file, except SVG (see needsFullRead). */
export function contentMatches(declared: string, head: Uint8Array): boolean {
  switch (declared) {
    case "text/csv":
    case "text/plain":
      return looksLikeText(head);
    case XLSX:
      return isZip(head);
    case "image/svg+xml":
      return isSafeSvg(head);
    default:
      return detectFileMagicBytes(head) === declared;
  }
}

export function needsFullRead(declared: string): boolean {
  return declared === "image/svg+xml";
}

export function isSafeSvg(bytes: Uint8Array): boolean {
  if (!looksLikeText(bytes.subarray(0, 4096))) return false;
  const text = new TextDecoder().decode(bytes).replace(/^﻿/, "").trimStart().toLowerCase();
  if (!(text.startsWith("<svg") || text.startsWith("<?xml"))) return false;
  if (!text.includes("<svg")) return false;
  if (/<script|<foreignobject|<iframe|<embed|<object|javascript:|data:text\/html/.test(text)) return false;
  if (/\son[a-z]+\s*=/.test(text)) return false;
  return true;
}

export function extForMime(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/heic":
      return "heic";
    case "image/svg+xml":
      return "svg";
    case "application/pdf":
      return "pdf";
    case "text/csv":
      return "csv";
    case "text/plain":
      return "txt";
    case XLSX:
      return "xlsx";
    default:
      return "bin";
  }
}
