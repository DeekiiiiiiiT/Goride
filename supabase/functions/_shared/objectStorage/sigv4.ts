/**
 * AWS Signature V4 for S3-compatible object storage (Cloudflare R2).
 * WebCrypto only — no npm dependency, so Deno tests never touch node_modules.
 *
 * Two shapes:
 *  - presignUrl(): signature in the query string (links handed to apps).
 *  - signRequest(): signature in the Authorization header (server-side calls).
 */

export type SigV4Credentials = {
  accessKeyId: string;
  secretAccessKey: string;
  region: string; // R2 uses "auto"
  service?: string; // default "s3"
};

const UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";
export const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === "string" ? enc.encode(data) : data;
  return toHex(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
}

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, enc.encode(data));
}

/** RFC 3986 encoding as S3 expects (keeps A-Z a-z 0-9 - _ . ~). */
export function uriEncode(value: string, encodeSlash = true): string {
  let out = "";
  for (const ch of value) {
    if (/[A-Za-z0-9\-_.~]/.test(ch)) out += ch;
    else if (ch === "/" && !encodeSlash) out += ch;
    else {
      for (const b of enc.encode(ch)) out += "%" + b.toString(16).toUpperCase().padStart(2, "0");
    }
  }
  return out;
}

/** 20130524T000000Z */
export function amzDate(d: Date): string {
  return d.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function canonicalQuery(params: [string, string][]): string {
  return params
    .map(([k, v]) => [uriEncode(k), uriEncode(v)] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
}

async function signingKey(creds: SigV4Credentials, date: string): Promise<ArrayBuffer> {
  const kDate = await hmac(enc.encode("AWS4" + creds.secretAccessKey), date);
  const kRegion = await hmac(kDate, creds.region);
  const kService = await hmac(kRegion, creds.service ?? "s3");
  return hmac(kService, "aws4_request");
}

type CanonicalInput = {
  method: string;
  url: URL;
  query: [string, string][];
  headers: Record<string, string>; // lower-case names
  payloadHash: string;
};

function buildCanonical(input: CanonicalInput): { canonical: string; signedHeaders: string } {
  const names = Object.keys(input.headers).map((h) => h.toLowerCase()).sort();
  const canonicalHeaders = names.map((n) => `${n}:${String(input.headers[n]).trim().replace(/\s+/g, " ")}\n`).join("");
  const signedHeaders = names.join(";");
  // Path is already percent-encoded once in URL.pathname; S3 does not double-encode.
  const path = input.url.pathname || "/";
  const canonical = [
    input.method.toUpperCase(),
    path,
    canonicalQuery(input.query),
    canonicalHeaders,
    signedHeaders,
    input.payloadHash,
  ].join("\n");
  return { canonical, signedHeaders };
}

async function signature(creds: SigV4Credentials, now: Date, canonical: string): Promise<{ sig: string; scope: string }> {
  const stamp = amzDate(now);
  const day = stamp.slice(0, 8);
  const scope = `${day}/${creds.region}/${creds.service ?? "s3"}/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", stamp, scope, await sha256Hex(canonical)].join("\n");
  const sig = toHex(await hmac(await signingKey(creds, day), toSign));
  return { sig, scope };
}

/**
 * Presigned URL (query-string auth). `signedHeaders` (besides host) must be
 * sent by the caller with the exact same values, e.g. content-type on PUT.
 */
export async function presignUrl(opts: {
  creds: SigV4Credentials;
  method: "GET" | "PUT" | "HEAD";
  url: string;
  expiresSeconds: number;
  now?: Date;
  signedHeaders?: Record<string, string>;
  extraQuery?: Record<string, string>;
}): Promise<string> {
  const now = opts.now ?? new Date();
  const url = new URL(opts.url);
  const headers: Record<string, string> = { host: url.host };
  for (const [k, v] of Object.entries(opts.signedHeaders ?? {})) headers[k.toLowerCase()] = v;
  const names = Object.keys(headers).sort().join(";");
  const day = amzDate(now).slice(0, 8);
  const query: [string, string][] = [
    ...Object.entries(opts.extraQuery ?? {}),
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${opts.creds.accessKeyId}/${day}/${opts.creds.region}/${opts.creds.service ?? "s3"}/aws4_request`],
    ["X-Amz-Date", amzDate(now)],
    ["X-Amz-Expires", String(opts.expiresSeconds)],
    ["X-Amz-SignedHeaders", names],
  ];
  const { canonical } = buildCanonical({ method: opts.method, url, query, headers, payloadHash: UNSIGNED_PAYLOAD });
  const { sig } = await signature(opts.creds, now, canonical);
  return `${url.origin}${url.pathname}?${canonicalQuery([...query, ["X-Amz-Signature", sig]])}`;
}

/** Header-auth request init for server-side calls. Body must be hashed by the caller (or EMPTY_SHA256). */
export async function signRequest(opts: {
  creds: SigV4Credentials;
  method: string;
  url: string;
  headers?: Record<string, string>;
  payloadHash?: string;
  now?: Date;
}): Promise<Record<string, string>> {
  const now = opts.now ?? new Date();
  const url = new URL(opts.url);
  const payloadHash = opts.payloadHash ?? EMPTY_SHA256;
  const headers: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate(now),
  };
  for (const [k, v] of Object.entries(opts.headers ?? {})) headers[k.toLowerCase()] = v;
  const query: [string, string][] = [...url.searchParams.entries()];
  const { canonical, signedHeaders } = buildCanonical({ method: opts.method, url, query, headers, payloadHash });
  const { sig, scope } = await signature(opts.creds, now, canonical);
  const out: Record<string, string> = { ...headers };
  delete out.host;
  out.authorization = `AWS4-HMAC-SHA256 Credential=${opts.creds.accessKeyId}/${scope},SignedHeaders=${signedHeaders},Signature=${sig}`;
  return out;
}
