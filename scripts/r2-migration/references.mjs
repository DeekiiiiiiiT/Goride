/**
 * Reading and replacing the stored addresses of the three real old buckets.
 *
 * Old addresses take four shapes in the database:
 *   .../storage/v1/object/sign/<bucket>/<path>?token=…      (1-year signed URL, the common one)
 *   .../storage/v1/object/public/<bucket>/<path>            (public bucket address)
 *   .../storage/v1/object/authenticated/<bucket>/<path>
 *   <bucket>/<path>                                         (bucket-prefixed bare path)
 * plus a bare object path in columns that already know their bucket
 * (evidence_files.storage_path, part_import_batch.storage_path).
 *
 * New addresses (what the live readers already understand):
 *   evidence + fleet docs → a signed file-link address (fileLink.ts shape, 1 year)
 *   parts imports         → the bare R2 key (parts_import_storage.ts reads keys)
 */
import { OLD_BUCKETS } from "./keys.mjs";

/** Everything the inventory searches rows for. */
export const SEARCH_MARKERS = ["/storage/v1/object/", ...OLD_BUCKETS];

/** True when the value is already a new-form address (idempotence guard). */
export function isAlreadyNewAddress(value) {
  return typeof value === "string" && value.includes("/functions/v1/file-link?");
}

/**
 * Old address → { bucket, path, form } | null.
 * `form`: "signed" | "public" | "authenticated" | "bucket_path".
 */
export function parseOldReference(value, buckets = OLD_BUCKETS) {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw || isAlreadyNewAddress(raw)) return null;

  const signed = raw.match(/\/storage\/v1\/object\/(sign|public|authenticated)\/([^/?#]+)\/([^?#]+)/);
  if (signed) {
    const bucket = signed[2];
    if (!buckets.includes(bucket)) return null;
    const path = safeDecode(signed[3].split("?")[0]);
    if (!path) return null;
    return { bucket, path, form: signed[1] };
  }

  for (const bucket of buckets) {
    if (raw.startsWith(`${bucket}/`)) {
      const path = safeDecode(raw.slice(bucket.length + 1).split(/[?#]/)[0]);
      if (!path) return null;
      return { bucket, path, form: "bucket_path" };
    }
  }
  return null;
}

/**
 * Bare object path ("<org>/<type>/<uuid>.jpg", "<batch>/source.csv"), for columns whose
 * bucket is known from the row. Returns null for anything that looks like a URL.
 */
export function parseBareObjectPath(value) {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw || /^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("/") || raw.startsWith("{")) return null;
  if (/\s/.test(raw) || raw.length > 512) return null;
  return raw;
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Manifest entries → lookup by old bucket + old path. Only ok === true entries are usable. */
export function manifestIndex(entries) {
  const index = new Map();
  for (const entry of entries ?? []) {
    if (!entry || entry.ok !== true || !entry.key || !entry.bucket || !entry.path) continue;
    index.set(`${entry.bucket}\u0000${entry.path}`, entry);
  }
  return index;
}

export function lookupManifest(index, bucket, path) {
  return index?.get(`${bucket}\u0000${path}`) ?? null;
}

/** New stored address for a copied file. Sync on purpose, so plans are easy to test. */
export function newAddressFor(entry, signLink) {
  if (entry.bucket === "parts-imports") return entry.key; // readers treat this as an R2 key
  return signLink(entry.key);
}

/**
 * Replace every string in a JSON value the replacer maps to a new string.
 * Returns a new value plus one edit record per changed string ({ pointer, from, to }).
 */
export function rewriteStringsDeep(value, replacer) {
  const edits = [];
  const walk = (node, pointer) => {
    if (typeof node === "string") {
      const next = replacer(node, pointer);
      if (typeof next === "string" && next !== node) {
        edits.push({ pointer, from: node, to: next });
        return next;
      }
      return node;
    }
    if (Array.isArray(node)) return node.map((item, i) => walk(item, `${pointer}[${i}]`));
    if (node && typeof node === "object") {
      const out = {};
      for (const [key, child] of Object.entries(node)) {
        out[key] = walk(child, pointer ? `${pointer}.${key}` : key);
      }
      return out;
    }
    return node;
  };
  const next = walk(value, "");
  return { value: next, edits };
}

/** Truncates the signature/token part of a link for readable dry-run output. */
export function shortenLink(value, max = 160) {
  if (typeof value !== "string" || !value) return String(value ?? "");
  let out = value
    .replace(/([?&]s=)([0-9a-f]{16,})/i, (_m, prefix, sig) => `${prefix}${sig.slice(0, 8)}…`)
    .replace(/([?&]token=)([A-Za-z0-9._-]{12,})/i, (_m, prefix, token) => `${prefix}${token.slice(0, 6)}…`);
  return out.length > max ? `${out.slice(0, max)}…` : out;
}
