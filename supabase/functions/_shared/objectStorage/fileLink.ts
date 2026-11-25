/**
 * Long-lived links to private R2 files, for records that store one address per file
 * (fuel / toll receipts, odometer photos, service invoices, driver docs).
 *
 * The link points at the `file-link` edge function (no login: an <img> tag cannot send one).
 * That function checks the signature and expiry, then redirects to a 10-minute R2 link, so
 * the file bytes never pass through Supabase. Same trust model as the 1-year Supabase signed
 * URLs these replace: whoever holds the link can open that one file until it expires.
 *
 *   <SUPABASE_URL>/functions/v1/file-link?b=private&k=<key>&e=<unix seconds>&s=<hex hmac>
 *
 * Secret: FILE_LINK_SECRET (its own secret, so rotating the R2 token never breaks old links).
 */
import { assertSafeKey } from "./r2Client.ts";

export const FILE_LINK_FUNCTION = "file-link";
/** Same lifetime as the Supabase signed URLs they replace. */
export const FILE_LINK_SECONDS = 365 * 24 * 60 * 60;
/** Stored as evidence_files.bucket_id for files that live in roam-private. */
export const R2_PRIVATE_BUCKET_ID = "r2:private";
/**
 * Answer for an upload route when the R2 switch is off. After M6 the old Supabase buckets are
 * never read (some were deleted), so an upload must not fall back to them.
 */
export const FILE_STORAGE_OFF_MESSAGE = "File storage is switched off. Please try again later.";

/**
 * The upload switch for every private slice: all three R2 keys, FILE_LINK_SECRET and
 * SUPABASE_URL. Without them the old Supabase path stays exactly as it is.
 */
export function isR2PrivateLinksEnabled(
  env: (name: string) => string | undefined = (n) => Deno.env.get(n),
): boolean {
  return ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "FILE_LINK_SECRET", "SUPABASE_URL"]
    .every((n) => !!env(n)?.trim());
}

const enc = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function payload(key: string, exp: number): string {
  return `file-link|private|${key}|${exp}`;
}

export async function signFileLink(opts: {
  key: string;
  secret: string;
  supabaseUrl: string;
  nowSeconds?: number;
  seconds?: number;
}): Promise<string> {
  assertSafeKey(opts.key);
  if (!opts.secret) throw new Error("FILE_LINK_SECRET not set");
  const base = opts.supabaseUrl.replace(/\/+$/, "");
  if (!base) throw new Error("SUPABASE_URL not set");
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  const exp = now + (opts.seconds ?? FILE_LINK_SECONDS);
  const sig = await hmacHex(opts.secret, payload(opts.key, exp));
  const q = new URLSearchParams({ b: "private", k: opts.key, e: String(exp), s: sig });
  return `${base}/functions/v1/${FILE_LINK_FUNCTION}?${q.toString()}`;
}

export type FileLinkCheck =
  | { ok: true; key: string }
  | { ok: false; reason: "bad_request" | "expired" | "bad_signature" };

export async function verifyFileLink(
  params: URLSearchParams,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<FileLinkCheck> {
  const b = params.get("b");
  const key = params.get("k") ?? "";
  const e = Number(params.get("e"));
  const s = params.get("s") ?? "";
  if (!secret || b !== "private" || !key || !Number.isInteger(e) || !/^[0-9a-f]{64}$/.test(s)) {
    return { ok: false, reason: "bad_request" };
  }
  try {
    assertSafeKey(key);
  } catch {
    return { ok: false, reason: "bad_request" };
  }
  const expected = await hmacHex(secret, payload(key, e));
  if (!sameText(expected, s)) return { ok: false, reason: "bad_signature" };
  if (e < nowSeconds) return { ok: false, reason: "expired" };
  return { ok: true, key };
}

/** R2 key inside a file-link address, or null if the address is not one. Does not check the signature. */
export function keyFromFileLink(url: string): string | null {
  if (!url || typeof url !== "string" || !url.includes(`/functions/v1/${FILE_LINK_FUNCTION}?`)) return null;
  try {
    const u = new URL(url);
    if (!u.pathname.endsWith(`/${FILE_LINK_FUNCTION}`) || u.searchParams.get("b") !== "private") return null;
    const key = u.searchParams.get("k");
    if (!key) return null;
    assertSafeKey(key);
    return key;
  } catch {
    return null;
  }
}
