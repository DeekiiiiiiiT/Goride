/**
 * fleet.* coverage for M5.
 *
 * The fleet schema is not exposed to PostgREST, so its rows cannot be updated from the script.
 * The rewrite plans them from the public.fleet_* security_invoker views (same rows), then writes
 * a SQL file in .r2-migration/ that:
 *   1. copies every affected row's primary key + original column into a backup table,
 *   2. sets each new value by primary key — the same signed link / JSON the API half uses,
 *   3. prints a count of rows still holding an old address for a copied file (must be 0).
 *
 * fleet.master_change_log is history and is left as written (never in FLEET_TARGETS).
 *
 * The SQL is generated, never executed here. It is idempotent: the backup insert conflicts on
 * (table_name, column_name, pk) and a second run's updates set identical values.
 */
import { createHash } from "node:crypto";
import { FLEET_TARGETS } from "./discovery.mjs";
import { isSafeObjectKey } from "./keys.mjs";
import { shortenLink } from "./references.mjs";

export { FLEET_TARGETS };

export const BACKUP_TABLE = "fleet.r2_migration_m5_backup";
export const FLEET_HISTORY_LEFT_AS_WRITTEN = ["fleet.master_change_log"];
/** Holds the primary keys an UPDATE actually changed, so the run can print planned - updated. */
const UPDATED_TABLE = "r2_m5_updated_rows";

export function tableKey(schema, table) {
  return `${schema}.${table}`;
}

/** Escape one path for a Postgres regex literal. */
export function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Regex alternation of every copied file's `<bucket>/<path>`, or null when nothing was copied. */
export function copiedPathPattern(entries) {
  const parts = (entries ?? [])
    .filter((entry) => entry?.ok === true && entry.bucket && entry.path)
    .map((entry) => escapeRegex(`${entry.bucket}/${entry.path}`));
  if (!parts.length) return null;
  return `(${parts.join("|")})`;
}

function sqlText(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}

/** Dollar-quoted literal (safe for JSON with quotes); picks a tag the value cannot contain. */
export function dollarQuote(value) {
  const text = String(value ?? "");
  let tag = "r2m5";
  while (text.includes(`$${tag}$`)) tag += "_";
  return `$${tag}$${text}$${tag}$`;
}

function jsonLiteral(value) {
  return `${dollarQuote(JSON.stringify(value ?? null))}::jsonb`;
}

function columnLiteral(column, value) {
  return column.kind === "json" ? jsonLiteral(value) : dollarQuote(String(value ?? ""));
}

/**
 * Stale-write guard: md5 of the dry-run value, as a hex literal when the scanner captured
 * Postgres's own `::text` (it hashes exactly what `md5(<column>::text)` hashes). If a caller did
 * not supply that text, fall back to letting Postgres hash the embedded dry-run value — its jsonb
 * text form (key order, spacing, numbers) is not reproducible with JSON.stringify.
 */
export function md5Hex(text) {
  return createHash("md5").update(String(text ?? ""), "utf8").digest("hex");
}

function md5Guard(column) {
  if (typeof column.originalText === "string") return `'${md5Hex(column.originalText)}'`;
  return column.kind === "json"
    ? `md5(${jsonLiteral(column.originalValue)}::text)`
    : `md5(${dollarQuote(String(column.originalValue ?? ""))}::text)`;
}

/** One temp table holds the copied-file regex, so the pattern appears once, not per count. */
const PATTERN_TABLE = "r2_m5_pattern";

function patternLines(pattern) {
  if (!pattern) return ["-- no copied files: nothing to match", ""];
  return [
    `drop table if exists ${PATTERN_TABLE};`,
    `create temp table ${PATTERN_TABLE} on commit drop as select ${dollarQuote(pattern)}::text as pat;`,
    "",
  ];
}

function countTargetLines({ schema = "fleet", target, column }) {
  return [
    `select ${sqlText(`${schema}.${target.table}.${column.name}`)} as target, count(*) as rows_with_old_address`,
    `from ${schema}.${target.table}`,
    `where ${column.name}::text ~ (select pat from ${PATTERN_TABLE});`,
    "",
  ];
}

/**
 * READ-ONLY fleet inventory SQL: one count per target, against the copied-file pattern.
 * Run it any time; it changes nothing (temp table only).
 */
export function buildFleetInventorySql({ entries, at = new Date() }) {
  const pattern = copiedPathPattern(entries);
  const copied = (entries ?? []).filter((entry) => entry?.ok === true).length;
  const lines = [
    `-- M5 fleet inventory (READ-ONLY) - generated ${at.toISOString()}`,
    `-- Counts rows in fleet.* that still hold an address of a file the M4 copy covers (${copied} file(s)).`,
    `-- ${FLEET_TARGETS.map((t) => `fleet.${t.table}`).join(", ")}.`,
    `-- fleet.master_change_log is history and is not counted.`,
    "begin transaction read only;",
    "",
    ...patternLines(pattern),
  ];
  if (!pattern) {
    lines.push("select 'nothing to count' as target, 0 as rows_with_old_address where false;");
  } else {
    for (const target of FLEET_TARGETS) {
      for (const column of target.columns) lines.push(...countTargetLines({ target, column }));
    }
    lines.push(
      "select 'total' as target, sum(rows) as rows_with_old_address from (",
      ...FLEET_TARGETS.flatMap((target) =>
        target.columns.map((column) =>
          `  select count(*) as rows from fleet.${target.table} where ${column.name}::text ~ (select pat from ${PATTERN_TABLE})`
        )
      ),
      ") s;",
    );
  }
  lines.push("commit;");
  return `${lines.join("\n")}\n`;
}

/**
 * The apply SQL.
 * @param rows [{ schema:"fleet", table, pk, columns:[{ column, kind, originalValue, newValue, edits }] }]
 * @param entries M4 manifest entries (ok=true supplies the copied-file pattern)
 */
export function buildFleetRewriteSql({ rows, entries, at = new Date(), backupTable = BACKUP_TABLE }) {
  const list = rows ?? [];
  const pattern = copiedPathPattern(entries);
  const byTable = new Map();
  for (const row of list) {
    const key = tableKey(row.schema, row.table);
    if (!byTable.has(key)) byTable.set(key, []);
    byTable.get(key).push(row);
  }

  const lines = [
    `-- M5 fleet rewrite - generated ${at.toISOString()}`,
    `-- ${list.length} row(s) in ${byTable.size} table(s). Run after the owner's check, then keep the output.`,
    `-- Run while the apps are quiet: each update writes the whole payload_json snapshot from the dry run.`,
    `-- Stale-write guard: every backup insert and update also matches md5(<column>::text) of the`,
    `--   dry-run value, so a row edited since the dry run is skipped (and counted below).`,
    `-- Backup of every original value: ${backupTable} (fleet schema: not reachable from the app API).`,
    `--   The table has RLS enabled and anon/authenticated are revoked below.`,
    `-- Restore one value: update fleet.<table> t set <column> = b.original::jsonb`,
    `--   from ${backupTable} b where b.table_name = 'fleet.<table>' and b.column_name = '<column>' and t.id::text = b.pk;`,
    `-- (drop the ::jsonb cast for a text column). fleet.master_change_log is history: left as written.`,
    "",
    "begin;",
    "",
    `create table if not exists ${backupTable} (`,
    "  id bigserial primary key,",
    "  table_name text not null,",
    "  column_name text not null,",
    "  pk text not null,",
    "  original text not null,",
    "  backed_up_at timestamptz not null default now(),",
    `  constraint ${backupTable.split(".").pop()}_uniq unique (table_name, column_name, pk)`,
    ");",
    `alter table ${backupTable} enable row level security;`,
    `revoke all on ${backupTable} from anon, authenticated;`,
    "",
    `drop table if exists ${UPDATED_TABLE};`,
    `create temp table ${UPDATED_TABLE}(table_name text, pk text) on commit drop;`,
    "",
    "-- 1) back up the primary key + original column, guarded by the md5 of the dry-run value",
  ];

  for (const [table, tableRows] of byTable) {
    const [schema, name] = table.split(".");
    const target = FLEET_TARGETS.find((t) => t.table === name);
    const pkColumn = target?.pk ?? "id";
    for (const row of tableRows) {
      for (const column of row.columns) {
        lines.push(
          `insert into ${backupTable} (table_name, column_name, pk, original)`,
          `select ${sqlText(table)}, ${sqlText(column.column)}, t.${pkColumn}::text, t.${column.column}::text`,
          `from ${schema}.${name} t`,
          `where t.${pkColumn}::text = ${sqlText(row.pk)}`,
          `  and md5(t.${column.column}::text) = ${md5Guard(column)}`,
          "on conflict do nothing;",
          "",
        );
      }
    }
  }

  lines.push("-- 2) set the new value, by primary key, only while the row still matches the dry run");
  for (const [table, tableRows] of byTable) {
    const [schema, name] = table.split(".");
    const pkColumn = FLEET_TARGETS.find((t) => t.table === name)?.pk ?? "id";
    for (const row of tableRows) {
      lines.push(`-- ${table} ${row.pk} (${row.columns.length} field(s))`);
      lines.push("with u as (");
      lines.push(`  update ${schema}.${name}`);
      lines.push("  set");
      row.columns.forEach((column, i) => {
        const comma = i < row.columns.length - 1 ? "," : "";
        lines.push(`    ${column.column} = ${columnLiteral(column, column.newValue)}${comma}`);
      });
      lines.push(`  where ${pkColumn} = ${sqlText(row.pk)}`);
      for (const column of row.columns) {
        lines.push(`    and md5(${column.column}::text) = ${md5Guard(column)}`);
      }
      lines.push(`  returning ${pkColumn}::text as pk`);
      lines.push(")");
      lines.push(`insert into ${UPDATED_TABLE}(table_name, pk) select ${sqlText(table)}, u.pk from u;`);
      lines.push("");
    }
  }

  lines.push("-- 2b) planned vs updated: a positive skipped_changed means the row changed since the dry run");
  for (const [table, tableRows] of byTable) {
    const planned = tableRows.length;
    const name = sqlText(table);
    lines.push(
      `select ${name} as table_name, ${planned} as planned,`,
      `  (select count(*) from ${UPDATED_TABLE} where table_name = ${name}) as updated,`,
      `  ${planned} - (select count(*) from ${UPDATED_TABLE} where table_name = ${name}) as skipped_changed;`,
      "",
    );
  }

  lines.push("-- 3) verification: 0 rows may still hold an old address of a copied file");
  if (!pattern) {
    lines.push("select 'no copied files' as target, 0 as rows_still_old where false;");
  } else {
    lines.push(...patternLines(pattern));
    for (const target of FLEET_TARGETS) {
      for (const column of target.columns) {
        lines.push(
          `select ${sqlText(`fleet.${target.table}.${column.name}`)} as target, count(*) as rows_still_old`,
          `from fleet.${target.table}`,
          `where ${column.name}::text ~ (select pat from ${PATTERN_TABLE});`,
          "",
        );
      }
    }
  }
  lines.push(
    "select 'backup rows' as target, count(*) as backed_up",
    `from ${backupTable};`,
    "",
    "commit;",
  );
  return `${lines.join("\n")}\n`;
}

/** One readable summary line per fleet target for the dry run (no tokens). */
export function summarizeFleetRows(rows) {
  const counts = new Map();
  for (const row of rows ?? []) {
    const key = `fleet.${row.table}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([table, count]) => ({ table, rows: count }));
}

/** Dry-run display of one fleet row (links shortened). */
export function describeFleetRow(row) {
  const fields = row.columns.map((column) => column.column).join(", ");
  const first = row.columns[0];
  const before = first?.edits?.[0]?.from;
  const after = first?.edits?.[0]?.to;
  return {
    text: `fleet.${row.table} ${row.pk} [${fields}]`,
    old: before ? shortenLink(before) : "",
    new: after ? shortenLink(after) : "",
  };
}

/** Guard used by tests and the script: every key the SQL mentions must be a safe R2 key. */
export function everyLinkKeyIsSafe(rows) {
  for (const row of rows ?? []) {
    for (const column of row.columns) {
      const value = typeof column.newValue === "string" ? column.newValue : "";
      if (!value.includes("/functions/v1/file-link?")) continue;
      const key = new URL(value).searchParams.get("k") ?? "";
      if (!isSafeObjectKey(key)) return false;
    }
  }
  return true;
}
