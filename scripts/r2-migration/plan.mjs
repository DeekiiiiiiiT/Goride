/**
 * The M4 copy plan: which old objects are copied, which are skipped and why.
 * Pure functions so the rules are unit-testable without touching production.
 */
import { OLD_BUCKETS, contentTypeFor, keyForOldObject } from "./keys.mjs";

/**
 * @param objects [{ bucket, path, size, contentType }] — every object listed in the 3 buckets
 * @param evidenceStatusByPath Map<string,string> — evidence_files.storage_path → status
 *        (only rows of bucket ephemeral-evidence)
 * @returns entries [{ bucket, path, key, size, contentType, skip, reason }]
 *   skip: null (copy) | "placeholder" | "deleted" | "unsafe"
 */
export function buildCopyPlan({ objects, evidenceStatusByPath = new Map() }) {
  const entries = [];
  for (const object of objects ?? []) {
    const bucket = object.bucket;
    const path = String(object.path ?? "");
    const mapped = keyForOldObject(bucket, path);
    const size = Number(object.size ?? 0);
    const contentType = contentTypeFor(path, object.contentType);

    if (mapped.skip) {
      entries.push({ bucket, path, key: null, size, contentType, skip: mapped.skip, reason: mapped.reason });
      continue;
    }

    if (bucket === "ephemeral-evidence") {
      const status = evidenceStatusByPath.get(path);
      if (status === "deleted") {
        entries.push({
          bucket,
          path,
          key: mapped.key,
          size,
          contentType,
          skip: "deleted",
          reason: "evidence_files row is deleted",
        });
        continue;
      }
    }

    entries.push({
      bucket,
      path,
      key: mapped.key,
      size,
      contentType,
      skip: null,
      reason: mapped.reason, // non-null only for an unexpected parts-imports shape
    });
  }
  return entries;
}

/** Objects bigger than the copy script wants to hold in memory at once. */
export function isOversized(size, maxBytes) {
  return Number(size) > Number(maxBytes);
}

/** Re-run safety: skip an object already in R2 with exactly the same size. */
export function shouldSkipExisting(head, size) {
  return Boolean(head) && Number(head.size) === Number(size) && Number(size) >= 0;
}

/** Per-bucket totals for the console summary. */
export function summarizePlan(entries, buckets = OLD_BUCKETS) {
  const out = new Map();
  for (const bucket of buckets) {
    out.set(bucket, {
      listed: 0,
      toCopy: 0,
      alreadyInR2: 0,
      copied: 0,
      failed: 0,
      skippedPlaceholder: 0,
      skippedDeleted: 0,
      skippedUnsafe: 0,
      bytes: 0,
      warnings: 0,
    });
  }
  for (const entry of entries ?? []) {
    const row = out.get(entry.bucket);
    if (!row) continue;
    row.listed += 1;
    if (entry.skip === "placeholder") row.skippedPlaceholder += 1;
    else if (entry.skip === "deleted") row.skippedDeleted += 1;
    else if (entry.skip === "unsafe") {
      row.skippedUnsafe += 1;
      row.warnings += 1;
    } else row.toCopy += 1;
    if (!entry.skip) row.bytes += Number(entry.size ?? 0);
    if (entry.reason && !entry.skip) row.warnings += 1;
  }
  return out;
}
