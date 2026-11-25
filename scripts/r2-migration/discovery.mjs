/**
 * Discovery of stored references to the three old buckets.
 *
 * Read-only and deliberately small: every query has a LIMIT and pages by primary key (keyset),
 * never OFFSET, never `select *`, never an exact count. Ledger tables are skipped entirely —
 * CLAUDE.md forbids scanning them without an org + date range, and they hold no file addresses.
 *
 * The search is marker-based: every value is searched for "/storage/v1/object/" and the three
 * bucket names, then each candidate string is re-checked with parseOldReference().
 */
import { OLD_BUCKETS } from "./keys.mjs";
import { SEARCH_MARKERS, parseBareObjectPath, parseOldReference } from "./references.mjs";

/** Column names that can hold a file address (the audit's *url* / *path* / … rule). */
export const COLUMN_NAME_RE = /(url|path|receipt|photo|document|image|invoice|metadata)/i;

/** JSON keys searched inside jsonb columns and KV records (the app's own evidence field list). */
export const FILE_PATH_FIELDS = [
  "receiptUrl",
  "invoiceUrl",
  "odometerProofUrl",
  "photoUrl",
  "photo_url",
  "imageUrl",
  "image_url",
  "fileUrl",
  "file_url",
  "documentUrl",
  "document_url",
  "attachmentUrl",
  "attachment_url",
  "publicUrl",
  "public_url",
  "storagePath",
  "storage_path",
  "path",
  "url",
  "evidenceUrls",
  "attachments",
  "documents",
  "files",
];

/** KV key prefixes that are ledger data — never scanned (CLAUDE.md ledger guardrail). */
export const LEDGER_KV_PREFIXES = ["ledger:", "ledger_event:", "toll_ledger:", "toll_payout:", "journal:"];

/** schema.table names that are ledger tables — skipped, not scanned. */
const LEDGER_TABLE_RE = /(^|_)(ledger|journal|trial_balance)(_|$)|finance_period_lines|payment_ledger|statement_alerts|settlement_lines/i;

/**
 * Schemas searched through PostgREST. `fleet` is not exposed on this project (PGRST106); its rows
 * are read through the public.fleet_* security_invoker views instead (FLEET_TARGETS below).
 */
export const SCAN_SCHEMAS = ["public"];

/** public.<view> mirrors of the fleet schema (security_invoker views over fleet.*). */
export const FLEET_VIEW_PREFIX = "fleet_";

export function isFleetView(name) {
  // public.fleet_fuel_entries etc. — security_invoker views over fleet.*. They are scanned by the
  // dedicated fleet path (scripts/r2-migration/fleet.mjs), never as ordinary public tables.
  return String(name ?? "").startsWith(FLEET_VIEW_PREFIX);
}

/** PostgREST string formats that are plain text; everything else (uuid, date, numeric…) is not searched. */
const TEXT_FORMATS = new Set([
  "",
  "text",
  "string",
  "character",
  "character varying",
  "varchar",
  "bpchar",
  "citext",
  "name",
]);

export function isLedgerTable(name) {
  return LEDGER_TABLE_RE.test(String(name ?? ""));
}

export function isLedgerKvKey(key) {
  const k = String(key ?? "");
  return LEDGER_KV_PREFIXES.some((p) => k.startsWith(p));
}

export function isCandidateColumn(name) {
  return COLUMN_NAME_RE.test(String(name ?? "")) || name === "payload_json";
}

/**
 * PostgREST OpenAPI (requested per schema with Accept-Profile) →
 * [{ schema, table, columns: { name: "text"|"json"|"array"|"other" } }].
 * A definition key may be plain (`evidence_files`) or prefixed (`public.evidence_files`).
 */
export function parseOpenApiTables(spec, schema = "public") {
  const definitions = spec?.definitions ?? {};
  const tables = [];
  for (const [key, def] of Object.entries(definitions)) {
    if (!def || typeof def !== "object" || !def.properties) continue;
    let table = key;
    if (key.startsWith(`${schema}.`)) table = key.slice(schema.length + 1);
    else if (key.includes(".")) continue; // another schema's definition, not this pass
    if (!table) continue;
    const columns = {};
    for (const [name, prop] of Object.entries(def.properties)) {
      columns[name] = classifyColumn(prop);
    }
    tables.push({ schema, table, columns });
  }
  return tables.sort((a, b) => a.table.localeCompare(b.table));
}

function classifyColumn(prop) {
  const type = String(prop?.type ?? "");
  const format = String(prop?.format ?? "").toLowerCase();
  if (type === "array") return "array";
  if (type === "object" || /json/i.test(format)) return "json";
  if (type !== "string") return "other";
  // A uuid / date / numeric column is a string to PostgREST but never holds a file address;
  // `~~` (LIKE) on it fails in Postgres, so it must not be searched (fleet_inv_asset.receipt_id).
  return TEXT_FORMATS.has(format) ? "text" : "other";
}

/** Primary key used for keyset paging: id, then key, then the first column. */
export function pickPrimaryKey(columns) {
  const names = Object.keys(columns ?? {});
  if (names.includes("id")) return "id";
  if (names.includes("key")) return "key";
  return names[0] ?? null;
}

function quoteForOr(value) {
  return String(value).replace(/["\\]/g, "\\$&");
}

/** `col.like.*marker*` for each marker — one `.or()` argument for a text column. */
export function buildTextColumnFilter(column, markers = SEARCH_MARKERS) {
  return markers.map((m) => `${column}.like.*${quoteForOr(m)}*`).join(",");
}

/** `col->>field.like.*marker*` for each field × marker, for a jsonb column. */
export function buildJsonPathFilter(column, fields = FILE_PATH_FIELDS, markers = SEARCH_MARKERS) {
  const clauses = [];
  for (const field of fields) {
    for (const marker of markers) {
      clauses.push(`${column}->>${field}.like.*${quoteForOr(marker)}*`);
    }
  }
  return clauses.join(",");
}

/** JSON value → every string that is an old reference, with its pointer. */
export function findOldReferences(value, { bucket = null, allowBare = false, buckets = OLD_BUCKETS } = {}) {
  const found = [];
  const walk = (node, pointer) => {
    if (typeof node === "string") {
      const ref = parseOldReference(node, buckets);
      if (ref) {
        found.push({ pointer, text: node, ...ref });
        return;
      }
      if (allowBare && bucket) {
        const bare = parseBareObjectPath(node);
        if (bare) found.push({ pointer, text: node, bucket, path: bare, form: "bare" });
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${pointer}[${i}]`));
      return;
    }
    if (node && typeof node === "object") {
      for (const [key, child] of Object.entries(node)) walk(child, pointer ? `${pointer}.${key}` : key);
    }
  };
  walk(value, "");
  return found;
}

/** True when the row's JSON mentions any search marker (cheap pre-check). */
export function rowHasMarker(row, markers = SEARCH_MARKERS) {
  const text = JSON.stringify(row ?? "");
  return markers.some((m) => text.includes(m));
}
/**
 * Keyset-paged scan of one table column. `kind` picks the server filter:
 *   "text"  → col LIKE each marker
 *   "json"  → col->>field LIKE each marker (FILE_PATH_FIELDS)
 * The client is injected, so this module stays importable by the Deno tests.
 */
export async function scanTableColumn(
  sb,
  { schema = "public", table, column, kind, pk, markers = SEARCH_MARKERS, fields = FILE_PATH_FIELDS,
    pageSize = 200, maxRows = 2000 },
) {
  const rows = [];
  let scanned = 0;
  let last = null;
  const select = [...new Set([pk, column])].join(",");
  for (;;) {
    let query = sb
      .schema(schema)
      .from(table)
      .select(select)
      .order(pk, { ascending: true })
      .limit(pageSize);
    query = kind === "text"
      ? query.or(buildTextColumnFilter(column, markers))
      : query.or(buildJsonPathFilter(column, fields, markers));
    if (last !== null) query = query.gt(pk, last);
    const { data, error } = await query;
    if (error) throw new Error(`${schema}.${table}.${column}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data) {
      scanned += 1;
      rows.push(row);
    }
    if (data.length < pageSize) break;
    if (scanned >= maxRows) return { rows, scanned, capped: true };
    last = data[data.length - 1]?.[pk] ?? null;
    if (last === null) break;
  }
  return { rows, scanned, capped: false };
}

/** Keyset-paged scan of a whole column (no server-side text filter), for jsonb/array columns. */
export async function scanWholeColumn(
  sb,
  { schema = "public", table, column, pk, pageSize = 200, maxRows = 2000, extra = [] },
) {
  const rows = [];
  let scanned = 0;
  let last = null;
  const select = [...new Set([pk, column, ...extra])].join(",");
  for (;;) {
    let query = sb.schema(schema).from(table).select(select).order(pk, { ascending: true }).limit(pageSize);
    if (last !== null) query = query.gt(pk, last);
    const { data, error } = await query;
    if (error) throw new Error(`${schema}.${table}.${column}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data) {
      scanned += 1;
      rows.push(row);
    }
    if (data.length < pageSize) break;
    if (scanned >= maxRows) return { rows, scanned, capped: true };
    last = data[data.length - 1]?.[pk] ?? null;
    if (last === null) break;
  }
  return { rows, scanned, capped: false };
}

/**
 * KV scan. Default is a bounded deep walk of the whole table by key (ledger key prefixes are
 * excluded in SQL), because file addresses live inside nested arrays (`fuelCycles[0]…receiptUrl`)
 * that a top-level JSON-path filter cannot see. `deep: false` is the quick targeted scan: known
 * file-address fields only — it misses nested records, so it is opt-in (`--kv-fast`).
 *
 * If the JSON-path filter is rejected by an older PostgREST (PGRST100), the targeted scan falls
 * back to the deep walk and says so — a failed filter never silently returns "no references".
 */
export async function scanKv(sb, opts = {}) {
  try {
    return await scanKvOnce(sb, opts);
  } catch (e) {
    if (opts.deep !== false) throw e;
    const fallback = await scanKvOnce(sb, { ...opts, deep: true });
    fallback.fallback = e instanceof Error ? e.message : String(e);
    return fallback;
  }
}

async function scanKvOnce(
  sb,
  { fields = FILE_PATH_FIELDS, markers = SEARCH_MARKERS, pageSize = 200, maxRows = 10000, deep = true } = {},
) {
  const rows = [];
  let scanned = 0;
  let last = null;
  for (;;) {
    let query = sb.from("kv_store_37f42386").select("key,value").order("key", { ascending: true }).limit(pageSize);
    if (deep) {
      for (const prefix of LEDGER_KV_PREFIXES) query = query.not("key", "like", `${prefix}%`);
    } else {
      query = query.or(buildJsonPathFilter("value", fields, markers));
    }
    if (last !== null) query = query.gt("key", last);
    const { data, error } = await query;
    if (error) throw new Error(`kv_store_37f42386: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data) {
      scanned += 1;
      if (!isLedgerKvKey(row.key)) rows.push(row);
    }
    if (data.length < pageSize) break;
    if (scanned >= maxRows) return { rows, scanned, capped: true };
    last = data[data.length - 1]?.key ?? null;
    if (last === null) break;
  }
  return { rows, scanned, capped: false };
}

/**
 * The fleet schema is not exposed to PostgREST (PGRST106), but every table has a
 * `public.fleet_<table>` security_invoker view over it. Reading the view reads the same rows,
 * so the migration can plan exact, primary-key-targeted SQL against fleet.* without guessing.
 * `fleet.master_change_log` is deliberately absent: it is history and is left as written.
 */
export const FLEET_TARGETS = [
  { table: "fuel_entries", view: "fleet_fuel_entries", pk: "id", columns: [{ name: "payload_json", kind: "json" }] },
  { table: "transactions", view: "fleet_transactions", pk: "id", columns: [{ name: "payload_json", kind: "json" }] },
  {
    table: "odometer_readings",
    view: "fleet_odometer_readings",
    pk: "id",
    columns: [{ name: "payload_json", kind: "json" }],
  },
  { table: "checkins", view: "fleet_checkins", pk: "id", columns: [{ name: "payload_json", kind: "json" }] },
  {
    table: "drivers",
    view: "fleet_drivers",
    pk: "id",
    columns: [
      { name: "payload_json", kind: "json" },
      { name: "license_front_url", kind: "text" },
      { name: "license_back_url", kind: "text" },
      { name: "proof_of_address_url", kind: "text" },
    ],
  },
];

/** Read-only scan of the fleet views: every row/column that holds an old address. */
export async function scanFleetTables(sb, { pageSize = 200, maxRows = 6000 } = {}) {
  const groups = [];
  for (const target of FLEET_TARGETS) {
    for (const column of target.columns) {
      if (column.kind === "text") {
        const scan = await scanTableColumn(sb, {
          schema: "public",
          table: target.view,
          column: column.name,
          kind: "text",
          pk: target.pk,
          pageSize,
          maxRows: 5000,
        });
        const rows = scan.rows
          .map((row) => ({
            pk: row[target.pk],
            value: row[column.name],
            rawText: String(row[column.name] ?? ""),
            refs: findOldReferences(row[column.name]),
          }))
          .filter((row) => row.refs.length > 0);
        groups.push({ target, column: column.name, kind: "text", rows, scanned: scan.scanned, capped: scan.capped });
        continue;
      }
      // jsonb: also read Postgres's own `::text`, so the generated SQL can compare md5 literals.
      const scan = await scanWholeColumn(sb, {
        schema: "public",
        table: target.view,
        column: column.name,
        pk: target.pk,
        pageSize,
        maxRows,
        extra: [`r2_raw_text:${column.name}::text`],
      });
      const rows = scan.rows
        .map((row) => ({
          pk: row[target.pk],
          value: row[column.name],
          rawText: String(row.r2_raw_text ?? ""),
          refs: findOldReferences(row[column.name]),
        }))
        .filter((row) => row.refs.length > 0);
      groups.push({ target, column: column.name, kind: "json", rows, scanned: scan.scanned, capped: scan.capped });
    }
  }
  return groups;
}
