/**
 * M4 key mapping: an old Supabase Storage object → its new R2 key.
 * Deterministic on purpose, so re-running the copy is always safe.
 *
 *   ephemeral-evidence/<org>/<type>/<uuid>.<ext> → evidence/<org>/<type>/<uuid>.<ext>        (roam-private)
 *   make-37f42386-docs/<path>                    → fleet-docs/legacy/<path>                  (roam-private)
 *   parts-imports/<batch>/source.csv             → parts-imports/platform/<batch>/source.csv  (roam-private)
 *
 * docs/cloudflare-r2-storage-migration-audit.md §0, M4.
 */

/** The three buckets that hold real data (owner decision, 25 Nov). */
export const OLD_BUCKETS = ["ephemeral-evidence", "make-37f42386-docs", "parts-imports"];

/** Test-only buckets: deleted, never copied. */
export const TEST_BUCKETS = [
  "merchant-assets",
  "enterprise-freight-docs",
  "courier-documents",
  "merchant-documents",
  "in-house-receipts",
];

export const R2_PRIVATE_BUCKET = "roam-private";
export const R2_PUBLIC_BUCKET = "roam-public";

/** Supabase writes one of these into every "empty" folder it creates. Never a real file. */
export const EMPTY_FOLDER_PLACEHOLDER = ".emptyFolderPlaceholder";

/** Mirrors assertSafeKey() in supabase/functions/_shared/objectStorage/r2Client.ts. */
const KEY_RE = /^[a-z0-9][a-z0-9\-_/.]*$/i;

export function isSafeObjectKey(key) {
  return (
    typeof key === "string" &&
    key.length > 0 &&
    key.length <= 512 &&
    KEY_RE.test(key) &&
    !key.includes("..") &&
    !key.includes("//") &&
    !key.endsWith("/")
  );
}

export function isPlaceholderPath(path) {
  const name = String(path ?? "").split("/").pop() ?? "";
  return name === EMPTY_FOLDER_PLACEHOLDER || name.startsWith(".emptyFolderPlaceholder");
}

/**
 * New R2 key for one old object.
 * Returns { key, skip, reason } — key is null when the object must not be copied.
 *   skip: "placeholder" | "unsafe" | "unknown_bucket" | null
 */
export function keyForOldObject(bucket, path) {
  const clean = String(path ?? "").replace(/^\/+/, "");
  if (!clean) return { key: null, skip: "unsafe", reason: "empty path" };
  if (isPlaceholderPath(clean)) {
    return { key: null, skip: "placeholder", reason: "empty-folder placeholder" };
  }

  let key;
  let warning = null;
  switch (bucket) {
    case "ephemeral-evidence":
      // Old path is already <org>/<type>/<uuid>.<ext>.
      key = `evidence/${clean}`;
      break;
    case "make-37f42386-docs":
      key = `fleet-docs/legacy/${clean}`;
      break;
    case "parts-imports": {
      const batch = clean.match(/^([A-Za-z0-9_-]+)\/source\.csv$/i);
      if (batch) {
        key = `parts-imports/platform/${batch[1]}/source.csv`;
      } else {
        // Unexpected shape: keep it, do not lose it, and tell the operator.
        key = `parts-imports/legacy/${clean}`;
        warning = `unexpected parts-imports path shape (kept under parts-imports/legacy/)`;
      }
      break;
    }
    default:
      return { key: null, skip: "unknown_bucket", reason: `bucket not in the M4 copy set: ${bucket}` };
  }

  key = key.replace(/\/{2,}/g, "/");
  if (!isSafeObjectKey(key)) {
    return { key: null, skip: "unsafe", reason: `unsafe R2 key for ${bucket}/${clean}` };
  }
  return { key, skip: null, reason: warning };
}

/** Where the bytes go: everything M4 copies is private. */
export function r2BucketForOldBucket() {
  return R2_PRIVATE_BUCKET;
}

/** Cache header for the copied private objects (same as the upload path). */
export const PRIVATE_CACHE_CONTROL = "private, no-store";

const EXT_TYPES = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  pdf: "application/pdf",
  csv: "text/csv; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/** Content type for the copy: the one Supabase reports, else by extension. */
export function contentTypeFor(path, reported) {
  const clean = String(reported ?? "").trim();
  if (clean && clean !== "application/octet-stream") return clean;
  const ext = String(path ?? "").split(".").pop()?.toLowerCase() ?? "";
  return EXT_TYPES[ext] ?? "application/octet-stream";
}
