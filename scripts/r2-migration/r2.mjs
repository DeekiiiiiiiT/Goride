/**
 * Minimal R2 client for the migration scripts (node fetch + sigv4.mjs).
 *
 * The functions use supabase/functions/_shared/objectStorage/r2Client.ts; this is the same
 * wire protocol in plain JS. Bucket names are fixed to roam-private: the migration must never
 * accidentally write to a preprod bucket through an R2_BUCKET_* override.
 */
import { EMPTY_SHA256, sha256Hex, signRequest, uriEncode } from "./sigv4.mjs";
import { R2_PRIVATE_BUCKET, isSafeObjectKey } from "./keys.mjs";

export class R2 {
  constructor({ accountId, accessKeyId, secretAccessKey }, fetchImpl = fetch) {
    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new Error("R2 not configured: set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY");
    }
    this.creds = { accessKeyId, secretAccessKey, region: "auto" };
    this.endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
    this.fetch = fetchImpl;
  }

  objectUrl(key, bucket = R2_PRIVATE_BUCKET) {
    if (!isSafeObjectKey(key)) throw new Error(`unsafe object key: ${JSON.stringify(key)}`);
    return `${this.endpoint}/${bucket}/${uriEncode(key, false)}`;
  }

  async #send(method, url, headers = {}, payloadHash = EMPTY_SHA256, body) {
    const signed = signRequest({ creds: this.creds, method, url, headers, payloadHash });
    return this.fetch(url, { method, headers: signed, body });
  }

  /** { size, contentType } or null when the object is not there. */
  async head(key) {
    const res = await this.#send("HEAD", this.objectUrl(key));
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`R2 HEAD ${res.status}`);
    return {
      size: Number(res.headers.get("content-length") ?? "0"),
      contentType: res.headers.get("content-type"),
    };
  }

  async put(key, bytes, contentType, cacheControl) {
    if (!isSafeObjectKey(key)) throw new Error(`unsafe object key: ${JSON.stringify(key)}`);
    const url = this.objectUrl(key);
    const payloadHash = sha256Hex(bytes);
    const res = await this.#send(
      "PUT",
      url,
      { "content-type": contentType, "cache-control": cacheControl },
      payloadHash,
      bytes,
    );
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 200);
      throw new Error(`R2 PUT ${res.status}: ${detail}`);
    }
  }

  async remove(key) {
    const res = await this.#send("DELETE", this.objectUrl(key));
    if (!res.ok && res.status !== 404) throw new Error(`R2 DELETE ${res.status}`);
  }
}
