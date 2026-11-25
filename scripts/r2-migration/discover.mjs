/**
 * One discovery pass shared by the read-only inventory (M5 step 1) and the rewrite (M5 step 2).
 * Read-only: lists/sifts rows and returns the raw values so the caller can plan or report.
 *
 * Guardrails: ledger tables and ledger KV keys are skipped and named; no `select *`, no OFFSET,
 * no exact count; every query has a LIMIT and pages by primary key.
 */
import { OLD_BUCKETS } from "./keys.mjs";
import {
  SCAN_SCHEMAS,
  findOldReferences,
  isCandidateColumn,
  isFleetView,
  isLedgerTable,
  parseOpenApiTables,
  pickPrimaryKey,
  scanFleetTables,
  scanKv,
  scanTableColumn,
  scanWholeColumn,
} from "./discovery.mjs";

/** Tables whose `payload_json` is the whole legacy KV record — the only fleet.* copy of a receipt. */
export const MIRROR_TABLES = new Set([
  "transactions",
  "fuel_entries",
  "maintenance_logs",
  "expense_documents",
  "expense_bills",
  "vehicles",
  "drivers",
  "odometer_readings",
  "claims",
  "fuel_disputes",
  "fuel_adjustments",
  "import_batches",
  "inventory",
]);

/** Handled by their own scan (their columns already know their bucket). */
export const SPECIAL_TABLES = new Set(["evidence_files", "part_import_batch", "kv_store_37f42386"]);

/** OpenAPI for one schema (Accept-Profile selects the exposed schema). */
export async function fetchOpenApi(url, key, schema = "public") {
  const base = { apikey: key, Authorization: `Bearer ${key}` };
  if (schema) {
    base["Accept-Profile"] = schema;
    base["Content-Profile"] = schema;
  }
  let res = await fetch(`${url}/rest/v1/`, { headers: { ...base, Accept: "application/openapi+json" } });
  if (res.status === 406) {
    // Some deployments only answer with the default JSON media type.
    res = await fetch(`${url}/rest/v1/`, { headers: { ...base, Accept: "application/json" } });
  }
  if (!res.ok) throw new Error(`OpenAPI ${schema} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** evidence_files rows that point into one of the old buckets (bucket_id is known per row). */
export async function scanEvidenceFiles(sb, { pageSize = 200 } = {}) {
  const rows = [];
  let lastId = null;
  for (;;) {
    let query = sb
      .from("evidence_files")
      .select("id,bucket_id,storage_path,public_url,status")
      .in("bucket_id", [...OLD_BUCKETS, "r2:private"])
      .order("id", { ascending: true })
      .limit(pageSize);
    if (lastId) query = query.gt("id", lastId);
    const { data, error } = await query;
    if (error) throw new Error(`evidence_files: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data) {
      if (row.bucket_id === "r2:private") continue;
      const refs = [
        ...findOldReferences(row.storage_path, { bucket: row.bucket_id, allowBare: true }),
        ...findOldReferences(row.public_url),
      ];
      if (refs.length) rows.push({ ...row, refs });
    }
    if (data.length < pageSize) break;
    lastId = data[data.length - 1].id;
  }
  return rows;
}

/** part_import_batch rows whose storage_path is a bare "<batch>/source.csv". */
export async function scanPartImportBatch(sb, { pageSize = 200 } = {}) {
  const rows = [];
  let lastId = null;
  for (;;) {
    let query = sb
      .from("part_import_batch")
      .select("id,code,storage_path")
      .not("storage_path", "is", null)
      .order("id", { ascending: true })
      .limit(pageSize);
    if (lastId) query = query.gt("id", lastId);
    const { data, error } = await query;
    if (error) throw new Error(`part_import_batch: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data) {
      const refs = findOldReferences(row.storage_path, { bucket: "parts-imports", allowBare: true });
      if (refs.length) rows.push({ ...row, refs });
    }
    if (data.length < pageSize) break;
    lastId = data[data.length - 1].id;
  }
  return rows;
}

/**
 * Full discovery. Errors are collected per table/column (one bad table never aborts the run).
 * Returns the raw rows so the rewrite can patch them without re-reading production.
 */
export async function discoverReferences(
  sb,
  {
    kvDeep = true,
    maxRows = 2000,
    jsonMaxRows = 1000,
    kvMaxRows = 10000,
    fleetMaxRows = 6000,
    pageSize = 200,
    schemas = SCAN_SCHEMAS,
    supabaseUrl,
    apiKey,
    onProgress = () => {},
  } = {},
) {
  const result = {
    kv: { rows: [], scanned: 0, capped: false, error: null },
    evidence: { rows: [], error: null },
    parts: { rows: [], error: null },
    fleet: { groups: [], error: null },
    tables: [],
    scannedColumns: [],
    skippedLedger: [],
    errors: [],
  };

  try {
    const kv = await scanKv(sb, { deep: kvDeep, maxRows: kvMaxRows, pageSize });
    result.kv.scanned = kv.scanned;
    result.kv.capped = kv.capped;
    if (kv.fallback) {
      result.kv.fallback = kv.fallback;
      result.errors.push(`kv_store_37f42386: JSON-path filter failed (${kv.fallback}); deep walk used`);
    }
    result.kv.rows = kv.rows
      .map((row) => ({ key: row.key, value: row.value, refs: findOldReferences(row.value) }))
      .filter((row) => row.refs.length > 0);
  } catch (e) {
    result.kv.error = e.message;
    result.errors.push(`kv_store_37f42386: ${e.message}`);
  }
  onProgress({ step: "kv", scanned: result.kv.scanned, rows: result.kv.rows.length });

  try {
    result.evidence.rows = await scanEvidenceFiles(sb, { pageSize });
  } catch (e) {
    result.evidence.error = e.message;
    result.errors.push(`evidence_files: ${e.message}`);
  }
  onProgress({ step: "evidence_files", rows: result.evidence.rows.length });

  try {
    result.parts.rows = await scanPartImportBatch(sb, { pageSize });
  } catch (e) {
    result.parts.error = e.message;
    result.errors.push(`part_import_batch: ${e.message}`);
  }
  onProgress({ step: "part_import_batch", rows: result.parts.rows.length });

  // fleet.* is not exposed to PostgREST; read the same rows through its public.fleet_* views so
  // the rewrite can emit exact primary-key-targeted SQL against fleet.* later.
  try {
    result.fleet.groups = await scanFleetTables(sb, { pageSize, maxRows: fleetMaxRows });
    result.fleet.rows = result.fleet.groups.reduce((n, group) => n + group.rows.length, 0);
  } catch (e) {
    result.fleet.error = e.message;
    result.errors.push(`fleet views: ${e.message}`);
  }
  onProgress({ step: "fleet", rows: result.fleet.rows ?? 0 });

  let tables = [];
  const tablesPerSchema = new Map();
  for (const schema of schemas) {
    try {
      const spec = await fetchOpenApi(supabaseUrl, apiKey, schema);
      const parsed = parseOpenApiTables(spec, schema);
      if (parsed.length === 0) {
        result.errors.push(`schema discovery: no tables listed for ${schema}`);
        continue;
      }
      // If the server ignored Accept-Profile we would otherwise scan the same tables twice.
      const names = parsed.map((t) => t.table).sort().join(",");
      for (const [otherSchema, otherNames] of tablesPerSchema) {
        if (otherSchema !== schema && otherNames === names) {
          result.errors.push(
            `schema discovery: ${schema} returned the same tables as ${otherSchema} (Accept-Profile ignored?) — skipped`,
          );
          parsed.length = 0;
          break;
        }
      }
      if (!parsed.length) continue;
      tablesPerSchema.set(schema, names);
      tables.push(...parsed);
    } catch (e) {
      result.errors.push(`schema discovery (${schema}): ${e.message}`);
    }
  }

  for (const table of tables) {
    const qualified = `${table.schema}.${table.table}`;
    if (SPECIAL_TABLES.has(table.table)) continue;
    // public.fleet_* views are read through the dedicated fleet scan above (never as tables),
    // but a ledger view is still named in the guardrail report.
    if (isFleetView(table.table)) {
      if (isLedgerTable(table.table.replace(/^fleet_/, ""))) result.skippedLedger.push(qualified);
      continue;
    }
    if (isLedgerTable(table.table)) {
      result.skippedLedger.push(qualified);
      continue;
    }
    const pk = pickPrimaryKey(table.columns);
    if (!pk) {
      result.errors.push(`${qualified}: no primary key column, skipped`);
      continue;
    }

    for (const [column, kind] of Object.entries(table.columns)) {
      if (!isCandidateColumn(column)) continue;
      const isPayload = column === "payload_json";
      if (isPayload && !MIRROR_TABLES.has(table.table)) continue;
      if (kind === "other") continue;

      try {
        let scan;
        if (kind === "text") {
          scan = await scanTableColumn(sb, {
            schema: table.schema,
            table: table.table,
            column,
            kind: "text",
            pk,
            pageSize,
            maxRows,
          });
        } else if (kind === "json") {
          try {
            scan = await scanTableColumn(sb, {
              schema: table.schema,
              table: table.table,
              column,
              kind: "json",
              pk,
              pageSize,
              maxRows,
            });
          } catch (filterError) {
            // Older PostgREST without JSON-path filters: fall back to a bounded row walk.
            scan = await scanWholeColumn(sb, {
              schema: table.schema,
              table: table.table,
              column,
              pk,
              pageSize,
              maxRows: jsonMaxRows,
            });
            result.errors.push(
              `${qualified}.${column}: JSON-path filter failed (${filterError.message}); bounded row walk used`,
            );
          }
        } else {
          scan = await scanWholeColumn(sb, {
            schema: table.schema,
            table: table.table,
            column,
            pk,
            pageSize,
            maxRows: jsonMaxRows,
          });
        }

        result.scannedColumns.push(`${qualified}.${column}`);
        const rows = scan.rows
          .map((row) => ({ pk: row[pk], value: row[column], refs: findOldReferences(row[column]) }))
          .filter((row) => row.refs.length > 0);
        if (rows.length) {
          result.tables.push({
            schema: table.schema,
            table: table.table,
            column,
            pkColumn: pk,
            scanned: scan.scanned,
            capped: scan.capped,
            rows,
          });
        }
      } catch (e) {
        result.errors.push(`${qualified}.${column}: ${e.message}`);
      }
    }
    onProgress({ step: "table", table: qualified });
  }

  return result;
}
