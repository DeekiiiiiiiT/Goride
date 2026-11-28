/**
 * M5 plans: turn discovered rows into exact patches. Pure (client injected elsewhere, signer
 * injected here) so every rule is unit-tested — including the second run changing nothing.
 *
 * Only references whose file is in the M4 manifest with ok === true are touched. A reference to
 * a file that was not copied (skipped evidence, placeholder, failed copy) is reported, not
 * rewritten, so it keeps working from Supabase until the owner decides.
 */
import { findOldReferences } from "./discovery.mjs";
import {
  lookupManifest,
  newAddressFor,
  parseBareObjectPath,
  parseOldReference,
  rewriteStringsDeep,
} from "./references.mjs";

export const KV_TABLE = "kv_store_37f42386";

function lookup(index, bucket, path) {
  return lookupManifest(index, bucket, path);
}

/** The one replacement rule every plan shares: an old address → the new address of its copy. */
export function makeAddressReplacer(index, signLink) {
  return (text) => {
    const ref = parseOldReference(text);
    if (!ref) return null;
    const entry = lookup(index, ref.bucket, ref.path);
    return entry ? newAddressFor(entry, signLink) : null;
  };
}

/** KV records: rewrite every string that points at a copied old object. */
export function planKvRewrites(rows, index, signLink) {
  const updates = [];
  const skipped = [];
  const replace = makeAddressReplacer(index, signLink);
  for (const row of rows ?? []) {
    const key = row?.key;
    if (!key) continue;
    const before = row.value;
    const found = findOldReferences(before);
    const { value, edits } = rewriteStringsDeep(before, replace);
    for (const ref of found) {
      if (!lookup(index, ref.bucket, ref.path)) {
        skipped.push({ source: "kv", table: KV_TABLE, pk: key, ref, reason: "file not in manifest (ok)" });
      }
    }
    if (edits.length) {
      updates.push({
        source: "kv",
        schema: "public",
        table: KV_TABLE,
        pkColumn: "key",
        pk: key,
        patch: { value },
        // Dry-run value. The apply re-reads the row and skips it if this no longer matches.
        original: { value: before },
        edits,
      });
    }
  }
  return { updates, skipped };
}

/**
 * evidence_files rows: bucket_id + storage_path + public_url.
 * Rows already on R2 are left alone; rows whose file was not copied are reported.
 */
export function planEvidenceRewrites(rows, index, signLink) {
  const updates = [];
  const skipped = [];
  for (const row of rows ?? []) {
    if (!row?.id) continue;
    if (row.bucket_id === "r2:private") {
      skipped.push({ source: "evidence_files", pk: row.id, reason: "already r2:private" });
      continue;
    }
    const bucket = row.bucket_id || "ephemeral-evidence";
    const entry = lookup(index, bucket, row.storage_path);
    if (!entry) {
      skipped.push({
        source: "evidence_files",
        pk: row.id,
        reason: row.status === "deleted"
          ? "evidence deleted (file purged, address left as is)"
          : `file not in manifest (ok): ${bucket}/${row.storage_path}`,
      });
      continue;
    }
    const patch = { bucket_id: "r2:private", storage_path: entry.key };
    const edits = [
      { pointer: "bucket_id", from: row.bucket_id, to: "r2:private" },
      { pointer: "storage_path", from: row.storage_path, to: entry.key },
    ];
    if (row.public_url) {
      const link = newAddressFor(entry, signLink);
      if (link !== row.public_url) {
        patch.public_url = link;
        edits.push({ pointer: "public_url", from: row.public_url, to: link });
      }
    }
    updates.push({
      source: "evidence_files",
      schema: "public",
      table: "evidence_files",
      pkColumn: "id",
      pk: row.id,
      patch,
      original: {
        bucket_id: row.bucket_id,
        storage_path: row.storage_path,
        public_url: row.public_url ?? null,
      },
      edits,
    });
  }
  return { updates, skipped };
}

/** part_import_batch.storage_path: bare "<batch>/source.csv" → the R2 key. */
export function planPartsRewrites(rows, index) {
  const updates = [];
  const skipped = [];
  for (const row of rows ?? []) {
    if (!row?.id) continue;
    const value = typeof row.storage_path === "string" ? row.storage_path.trim() : "";
    if (!value) continue;
    if (value.startsWith("parts-imports/")) {
      skipped.push({ source: "part_import_batch", pk: row.id, reason: "already an R2 key" });
      continue;
    }
    const ref = parseOldReference(value) ?? { bucket: "parts-imports", path: parseBareObjectPath(value) };
    const entry = ref?.path ? lookup(index, "parts-imports", ref.path) : null;
    if (!entry) {
      skipped.push({ source: "part_import_batch", pk: row.id, reason: `file not in manifest (ok): ${value}` });
      continue;
    }
    updates.push({
      source: "part_import_batch",
      schema: "public",
      table: "part_import_batch",
      pkColumn: "id",
      pk: row.id,
      patch: { storage_path: entry.key },
      original: { storage_path: value },
      edits: [{ pointer: "storage_path", from: value, to: entry.key }],
    });
  }
  return { updates, skipped };
}

/**
 * Any other table/column the inventory found. URLs and bucket-prefixed paths only — a bare path
 * in an arbitrary column is ambiguous, so it is reported instead of rewritten.
 */
export function planTableRewrites(rows, { column, index, signLink, schema, table, pkColumn }) {
  const updates = [];
  const skipped = [];
  const replace = makeAddressReplacer(index, signLink);
  for (const row of rows ?? []) {
    const pk = row?.[pkColumn];
    if (pk === undefined || pk === null) continue;
    // discoverReferences returns { pk, value }; accept a raw column too (older callers/tests).
    const before = row && Object.hasOwn(row, "value") ? row.value : row?.[column];
    if (before === undefined || before === null) continue;
    const found = findOldReferences(before);
    const { value, edits } = rewriteStringsDeep(before, replace);
    for (const ref of found) {
      if (!lookup(index, ref.bucket, ref.path)) {
        skipped.push({ source: `${schema}.${table}`, table, column, pk, ref, reason: "file not in manifest (ok)" });
      }
    }
    if (edits.length) {
      updates.push({
        source: `${schema}.${table}`,
        schema,
        table,
        pkColumn,
        pk,
        patch: { [column]: value },
        original: { [column]: before },
        edits,
      });
    }
  }
  return { updates, skipped };
}

/**
 * fleet.* rows (planned from the public.fleet_* views). One entry per row, all its changed
 * columns together, so the generated SQL updates each primary key once.
 */
export function planFleetRewrites(groups, index, signLink) {
  const byRow = new Map();
  const skipped = [];
  const replace = makeAddressReplacer(index, signLink);
  let refCount = 0;

  for (const group of groups ?? []) {
    const target = group.target;
    if (!target) continue;
    for (const row of group.rows ?? []) {
      const found = row.refs ?? [];
      if (!found.length) continue;
      refCount += found.length;
      const { value, edits } = rewriteStringsDeep(row.value, replace);
      for (const ref of found) {
        if (!lookup(index, ref.bucket, ref.path)) {
          skipped.push({
            source: `fleet.${target.table}`,
            table: `fleet.${target.table}`,
            column: group.column,
            pk: row.pk,
            ref,
            reason: "file not in manifest (ok)",
          });
        }
      }
      if (!edits.length) continue;
      const key = `${target.table}\u0000${row.pk}`;
      if (!byRow.has(key)) {
        byRow.set(key, {
          source: `fleet.${target.table}`,
          schema: "fleet",
          table: target.table,
          pk: row.pk,
          columns: [],
        });
      }
      byRow.get(key).columns.push({
        column: group.column,
        kind: group.kind ?? "json",
        // Dry-run values: the object for the rewrite, and Postgres's own ::text for the md5 guard.
        originalValue: row.value,
        originalText: row.rawText,
        newValue: value,
        edits,
      });
    }
  }

  const rows = [...byRow.values()];
  return {
    rows,
    skipped,
    refCount,
    editCount: rows.reduce((sum, row) => sum + row.columns.reduce((n, column) => n + column.edits.length, 0), 0),
  };
}

/** Stable JSON text (sorted keys) so a value read twice compares equal regardless of key order. */
export function canonicalJson(value) {
  const normalise = (node) => {
    if (Array.isArray(node)) return node.map(normalise);
    if (node && typeof node === "object") {
      const out = {};
      for (const key of Object.keys(node).sort()) out[key] = normalise(node[key]);
      return out;
    }
    return node;
  };
  return JSON.stringify(normalise(value ?? null));
}

/** Key used to join a planned update to its freshly read row. */
export function updateFreshKey(update) {
  return `${update.schema}.${update.table}\u0000${update.pk}`;
}

/**
 * Stale-write guard for the API apply: only rows whose freshly read values still equal the
 * dry-run originals may be written. Everything else is reported and skipped.
 */
export function partitionUpdates(updates, freshByKey) {
  const ready = [];
  const changed = [];
  for (const update of updates ?? []) {
    const fresh = freshByKey.get(updateFreshKey(update));
    if (!fresh) {
      changed.push({ ...update, reason: "row no longer readable" });
      continue;
    }
    const fields = Object.keys(update.original ?? {});
    const same = fields.every(
      (field) => canonicalJson(fresh[field]) === canonicalJson(update.original[field]),
    );
    if (same) ready.push(update);
    else changed.push(update);
  }
  return { ready, changed };
}

/** Total edits + a short, readable list for the dry run. */export function summarizeRewrites(results) {
  let rowCount = 0;
  let editCount = 0;
  let skipped = 0;
  for (const result of results ?? []) {
    rowCount += result.updates.length;
    editCount += result.updates.reduce((sum, u) => sum + u.edits.length, 0);
    skipped += (result.skipped ?? []).length;
  }
  return { rowCount, editCount, skipped };
}
