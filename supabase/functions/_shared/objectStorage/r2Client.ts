/**
 * Cloudflare R2 client — the only code that talks to R2.
 * Plan: docs/cloudflare-r2-storage-migration-audit.md §3.
 *
 * Secrets (Supabase function env): R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
 * R2_SECRET_ACCESS_KEY, R2_PUBLIC_BASE_URL (e.g. https://media.roamfleet.co).
 */
import { EMPTY_SHA256, presignUrl, sha256Hex, type SigV4Credentials, signRequest, uriEncode } from "./sigv4.ts";

export const R2_BUCKETS = { public: "roam-public", private: "roam-private" } as const;
export type R2BucketKind = keyof typeof R2_BUCKETS;

export function resolveBucketName(
  kind: R2BucketKind,
  env: (name: string) => string | undefined = (n) => Deno.env.get(n),
): string {
  const varName = kind === "public" ? "R2_BUCKET_PUBLIC" : "R2_BUCKET_PRIVATE";
  const override = env(varName)?.trim();
  return override || R2_BUCKETS[kind];
}

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string | null;
};

export type ObjectHead = { size: number; contentType: string | null };

const KEY_RE = /^[a-z0-9][a-z0-9\-_/.]*$/i;
const TEST_PREFIX_KEY_RE = /^_test\/[a-z0-9][a-z0-9\-_/.]*$/i;

/** Keys are app-built; reject anything that could escape a folder or confuse a URL. */
export function assertSafeKey(key: string): void {
  if (
    !key ||
    key.length > 512 ||
    (!KEY_RE.test(key) && !TEST_PREFIX_KEY_RE.test(key)) ||
    key.includes("..") ||
    key.includes("//") ||
    key.endsWith("/")
  ) {
    throw new Error(`unsafe object key: ${JSON.stringify(key)}`);
  }
}

export function r2ConfigFromEnv(env: (name: string) => string | undefined = (n) => Deno.env.get(n)): R2Config {
  const accountId = env("R2_ACCOUNT_ID")?.trim();
  const accessKeyId = env("R2_ACCESS_KEY_ID")?.trim();
  const secretAccessKey = env("R2_SECRET_ACCESS_KEY")?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 not configured: set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY");
  }
  const base = env("R2_PUBLIC_BASE_URL")?.trim().replace(/\/+$/, "") || null;
  return { accountId, accessKeyId, secretAccessKey, publicBaseUrl: base };
}

export class R2Client {
  readonly #creds: SigV4Credentials;
  readonly #endpoint: string;
  readonly #fetch: typeof fetch;

  constructor(readonly config: R2Config, fetchImpl: typeof fetch = fetch) {
    this.#creds = { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey, region: "auto" };
    this.#endpoint = `https://${config.accountId}.r2.cloudflarestorage.com`;
    this.#fetch = fetchImpl;
  }

  objectUrl(bucket: R2BucketKind, key: string): string {
    assertSafeKey(key);
    return `${this.#endpoint}/${resolveBucketName(bucket)}/${uriEncode(key, false)}`;
  }

  /** Public address for roam-public objects. Built at read time; the DB stores keys only. */
  publicUrl(key: string): string {
    assertSafeKey(key);
    if (!this.config.publicBaseUrl) throw new Error("R2_PUBLIC_BASE_URL not set");
    return `${this.config.publicBaseUrl}/${uriEncode(key, false)}`;
  }

  /** One-time upload link. The app must send the same Content-Type header. */
  presignUpload(bucket: R2BucketKind, key: string, contentType: string, seconds = 300): Promise<string> {
    return presignUrl({
      creds: this.#creds,
      method: "PUT",
      url: this.objectUrl(bucket, key),
      expiresSeconds: seconds,
      signedHeaders: { "content-type": contentType },
    });
  }

  /** Short-lived read link straight to R2 (free egress; never proxy bytes through a function). */
  presignDownload(bucket: R2BucketKind, key: string, seconds = 600, downloadName?: string): Promise<string> {
    const extraQuery: Record<string, string> = {};
    if (downloadName) {
      const safe = downloadName.replace(/["\\\r\n]/g, "_").slice(0, 120);
      extraQuery["response-content-disposition"] = `inline; filename="${safe}"`;
    }
    return presignUrl({
      creds: this.#creds,
      method: "GET",
      url: this.objectUrl(bucket, key),
      expiresSeconds: seconds,
      extraQuery,
    });
  }

  async #send(method: string, url: string, headers: Record<string, string> = {}): Promise<Response> {
    const signed = await signRequest({ creds: this.#creds, method, url, headers, payloadHash: EMPTY_SHA256 });
    return this.#fetch(url, { method, headers: signed });
  }

  async head(bucket: R2BucketKind, key: string): Promise<ObjectHead | null> {
    const res = await this.#send("HEAD", this.objectUrl(bucket, key));
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`R2 HEAD ${res.status}`);
    return {
      size: Number(res.headers.get("content-length") ?? "0"),
      contentType: res.headers.get("content-type"),
    };
  }

  /** First `bytes` of an object (magic-byte check without downloading the whole file). */
  async readStart(bucket: R2BucketKind, key: string, bytes = 4096): Promise<Uint8Array> {
    const res = await this.#send("GET", this.objectUrl(bucket, key), { range: `bytes=0-${bytes - 1}` });
    if (!res.ok) throw new Error(`R2 GET range ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  async read(bucket: R2BucketKind, key: string): Promise<Uint8Array> {
    const res = await this.#send("GET", this.objectUrl(bucket, key));
    if (!res.ok) throw new Error(`R2 GET ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  /** Server-side copy (also across the two buckets). Sets the stored Content-Type and cache header. */
  async copy(
    from: { bucket: R2BucketKind; key: string },
    to: { bucket: R2BucketKind; key: string },
    meta: { contentType: string; cacheControl: string },
  ): Promise<void> {
    assertSafeKey(from.key);
    const res = await this.#send("PUT", this.objectUrl(to.bucket, to.key), {
      "x-amz-copy-source": `/${resolveBucketName(from.bucket)}/${uriEncode(from.key, false)}`,
      "x-amz-metadata-directive": "REPLACE",
      "content-type": meta.contentType,
      "cache-control": meta.cacheControl,
    });
    if (!res.ok) throw new Error(`R2 COPY ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  async remove(bucket: R2BucketKind, keys: string[]): Promise<void> {
    for (const key of keys) {
      const res = await this.#send("DELETE", this.objectUrl(bucket, key));
      if (!res.ok && res.status !== 404) throw new Error(`R2 DELETE ${res.status}`);
    }
  }

  /** Upload bytes with a signed payload hash (§6 vehicle pictures). */
  async put(
    bucket: R2BucketKind,
    key: string,
    bytes: Uint8Array,
    contentType: string,
    cacheControl: string,
  ): Promise<void> {
    assertSafeKey(key);
    const url = this.objectUrl(bucket, key);
    const payloadHash = await sha256Hex(bytes);
    const headers = await signRequest({
      creds: this.#creds,
      method: "PUT",
      url,
      headers: { "content-type": contentType, "cache-control": cacheControl },
      payloadHash,
    });
    const res = await this.#fetch(url, { method: "PUT", headers, body: bytes as BodyInit });
    if (!res.ok) throw new Error(`R2 PUT ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

let cached: R2Client | null = null;
export function r2FromEnv(): R2Client {
  cached ??= new R2Client(r2ConfigFromEnv());
  return cached;
}
