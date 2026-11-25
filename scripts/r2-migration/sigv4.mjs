/**
 * JS port of supabase/functions/_shared/objectStorage/sigv4.ts (header-signing half).
 *
 * The migration scripts are plain .mjs (node), so they cannot import the TypeScript module.
 * scripts/r2-migration.test.ts signs the same request with both implementations and asserts
 * the headers are identical, which keeps the port honest.
 *
 * Only the shapes the copy script needs are here: signed PUT / HEAD / DELETE requests.
 */
import { createHash, createHmac } from "node:crypto";

export const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

const encoder = new TextEncoder();

function toHex(buffer) {
  return Buffer.from(buffer).toString("hex");
}

export function sha256Hex(data) {
  const bytes = typeof data === "string" ? encoder.encode(data) : data;
  return createHash("sha256").update(bytes).digest("hex");
}

function hmac(key, data) {
  return createHmac("sha256", key).update(data).digest();
}

/** RFC 3986 encoding as S3 expects (keeps A-Z a-z 0-9 - _ . ~). */
export function uriEncode(value, encodeSlash = true) {
  let out = "";
  for (const ch of value) {
    if (/[A-Za-z0-9\-_.~]/.test(ch)) out += ch;
    else if (ch === "/" && !encodeSlash) out += ch;
    else {
      for (const b of encoder.encode(ch)) out += "%" + b.toString(16).toUpperCase().padStart(2, "0");
    }
  }
  return out;
}

/** 20130524T000000Z */
export function amzDate(d) {
  return d.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function canonicalQuery(params) {
  return params
    .map(([k, v]) => [uriEncode(k), uriEncode(v)])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
}

function signingKey(creds, date) {
  const kDate = hmac(encoder.encode("AWS4" + creds.secretAccessKey), date);
  const kRegion = hmac(kDate, creds.region);
  const kService = hmac(kRegion, creds.service ?? "s3");
  return hmac(kService, "aws4_request");
}

function buildCanonical({ method, url, query, headers, payloadHash }) {
  const names = Object.keys(headers).map((h) => h.toLowerCase()).sort();
  const canonicalHeaders = names
    .map((n) => `${n}:${String(headers[n]).trim().replace(/\s+/g, " ")}\n`)
    .join("");
  const signedHeaders = names.join(";");
  const path = url.pathname || "/";
  const canonical = [method.toUpperCase(), path, canonicalQuery(query), canonicalHeaders, signedHeaders, payloadHash]
    .join("\n");
  return { canonical, signedHeaders };
}

function signature(creds, now, canonical) {
  const stamp = amzDate(now);
  const day = stamp.slice(0, 8);
  const scope = `${day}/${creds.region}/${creds.service ?? "s3"}/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", stamp, scope, sha256Hex(canonical)].join("\n");
  const sig = toHex(hmac(signingKey(creds, day), toSign));
  return { sig, scope };
}

/**
 * Header-auth headers for a server-side R2 call. Body hash defaults to the empty-payload hash.
 * Callers send the returned headers as-is (fetch adds the Host header).
 */
export function signRequest({ creds, method, url, headers = {}, payloadHash = EMPTY_SHA256, now = new Date() }) {
  const parsed = new URL(url);
  const merged = {
    host: parsed.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate(now),
  };
  for (const [k, v] of Object.entries(headers)) merged[k.toLowerCase()] = v;
  const query = [...parsed.searchParams.entries()];
  const { canonical, signedHeaders } = buildCanonical({
    method,
    url: parsed,
    query,
    headers: merged,
    payloadHash,
  });
  const { sig, scope } = signature(creds, now, canonical);
  const out = { ...merged };
  delete out.host;
  out.authorization =
    `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${scope},SignedHeaders=${signedHeaders},Signature=${sig}`;
  return out;
}
