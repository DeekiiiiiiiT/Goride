/**
 * JS port of signFileLink() from supabase/functions/_shared/objectStorage/fileLink.ts.
 *
 * Same secret, same payload, same query, so a link made here verifies with verifyFileLink()
 * in the deployed `file-link` function. scripts/r2-migration.test.ts proves that by calling
 * both implementations with one secret and one clock.
 *
 *   <SUPABASE_URL>/functions/v1/file-link?b=private&k=<key>&e=<unix seconds>&s=<hex hmac>
 */
import { createHmac } from "node:crypto";
import { isSafeObjectKey } from "./keys.mjs";

export const FILE_LINK_FUNCTION = "file-link";
/** Same lifetime as the Supabase signed URLs these replace. */
export const FILE_LINK_SECONDS = 365 * 24 * 60 * 60;

export function hmacHex(secret, message) {
  return createHmac("sha256", secret).update(message).digest("hex");
}

function payload(key, exp) {
  return `file-link|private|${key}|${exp}`;
}

/** Pure signer (no clock read): returns the payload string a link must carry. */
export function fileLinkPayload(key, exp) {
  return payload(key, exp);
}

/**
 * Signed long-lived link to a private R2 key.
 * Throws on an empty secret/base or an unsafe key — never silently produces a bad link.
 */
export function signFileLink({ key, secret, supabaseUrl, nowSeconds, seconds = FILE_LINK_SECONDS }) {
  if (!isSafeObjectKey(key)) throw new Error(`unsafe object key: ${JSON.stringify(key)}`);
  if (!secret) throw new Error("FILE_LINK_SECRET not set");
  const base = String(supabaseUrl ?? "").replace(/\/+$/, "");
  if (!base) throw new Error("SUPABASE_URL not set");
  const now = nowSeconds ?? Math.floor(Date.now() / 1000);
  const exp = now + seconds;
  const sig = hmacHex(secret, payload(key, exp));
  const q = new URLSearchParams({ b: "private", k: key, e: String(exp), s: sig });
  return `${base}/functions/v1/${FILE_LINK_FUNCTION}?${q.toString()}`;
}

/**
 * A signer bound to one secret/base/clock — what the rewrite plan uses.
 * Pass `nowSeconds` in tests so the output is deterministic.
 */
export function makeFileLinkSigner({ secret, supabaseUrl, nowSeconds, seconds }) {
  let clock = nowSeconds;
  if (clock === undefined) clock = Math.floor(Date.now() / 1000);
  return (key) => signFileLink({ key, secret, supabaseUrl, nowSeconds: clock, seconds });
}
