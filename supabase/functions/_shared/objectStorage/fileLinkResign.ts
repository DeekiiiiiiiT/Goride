/**
 * Monthly re-sign of stored private file links (docs/cloudflare-r2-storage-migration-audit.md §0,
 * "Link-expiry fix chosen, 25 Nov 2026").
 *
 * Every address written by the M5 rewrite is a `file-link` URL with a one-year `e=` expiry. Left
 * alone they all die on 25 Nov 2027. This module finds stored links whose expiry is inside 60 days
 * and rewrites **only `e=` and `s=`** with a fresh one-year signature for the same key, using the
 * same secret and format as fileLink.ts.
 *
 * Safety rules (same as the M5 rewrite):
 *   - only strings that are file-link addresses are touched; other fields never change;
 *   - the signature must verify first (a foreign/corrupted link is never re-signed);
 *   - every write is compare-and-set on the value that was read, done in
 *     `public.file_link_resign_cas` (both values in the POST body; a JSON object cannot travel in a
 *     PostgREST `eq.` filter), so a row edited in between is skipped and counted;
 *   - reads go through `public.file_link_resign_scan`: only rows holding a file-link come back,
 *     LIMIT + keyset paged by primary key, no OFFSET, no `select *`, no exact count, no row cap;
 *   - ledger keys/tables are never scanned.
 *
 * The HTTP door is the shared cron check: see file-link-resign/index.ts.
 */
import {
  FILE_LINK_FUNCTION,
  FILE_LINK_SECONDS,
  keyFromFileLink,
  signFileLink,
  verifyFileLink,
} from "./fileLink.ts";

/** Renew links that expire within 60 days. */
export const RESIGN_WINDOW_SECONDS = 60 * 24 * 60 * 60;

/** KV keys the scan never reads. The same list is in public.file_link_resign_scan (migration 20261125090146). */
export const LEDGER_KV_PREFIXES = ["ledger:", "ledger_event:", "toll_ledger:", "toll_payout:", "journal:"];

export type ResignTarget = {
  schema: string;
  table: string;
  /** Primary key used for keyset paging and the compare-and-set. */
  pk: string;
  column: string;
  kind: "text" | "json";
  /** KV store only: skip ledger/toll-ledger/journal keys. */
  skipLedgerKeys?: boolean;
};

/**
 * Every place the M5 inventory found a stored file-link. `fleet.*` is reached through its
 * `public.fleet_*` security_invoker view (the schema is not exposed to PostgREST; service_role has
 * full grants on both the view and the base table). `fleet.master_change_log` is history and is
 * deliberately absent.
 */
export const RESIGN_TARGETS: readonly ResignTarget[] = [
  { schema: "public", table: "evidence_files", pk: "id", column: "public_url", kind: "text" },
  { schema: "public", table: "kv_store_37f42386", pk: "key", column: "value", kind: "json", skipLedgerKeys: true },
  { schema: "public", table: "fleet_fuel_entries", pk: "id", column: "payload_json", kind: "json" },
  { schema: "public", table: "fleet_transactions", pk: "id", column: "payload_json", kind: "json" },
  { schema: "public", table: "fleet_odometer_readings", pk: "id", column: "payload_json", kind: "json" },
  { schema: "public", table: "fleet_checkins", pk: "id", column: "payload_json", kind: "json" },
  { schema: "public", table: "fleet_drivers", pk: "id", column: "payload_json", kind: "json" },
  { schema: "public", table: "fleet_drivers", pk: "id", column: "license_front_url", kind: "text" },
  { schema: "public", table: "fleet_drivers", pk: "id", column: "license_back_url", kind: "text" },
  { schema: "public", table: "fleet_drivers", pk: "id", column: "proof_of_address_url", kind: "text" },
  { schema: "public", table: "parts_sourcing_requests", pk: "id", column: "photo_url", kind: "text" },
  { schema: "delivery", table: "procurement_tasks", pk: "id", column: "receipt_path", kind: "text" },
  { schema: "delivery", table: "customer_order_issues", pk: "id", column: "photo_url", kind: "text" },
];

/** True when the address looks like a file-link URL (cheap pre-check). */
export function looksLikeFileLink(value: unknown): value is string {
  return typeof value === "string" && value.includes(`/functions/v1/${FILE_LINK_FUNCTION}?`);
}

export function linkExpirySeconds(url: string): number | null {
  const match = /[?&]e=(\d+)/.exec(url);
  if (!match) return null;
  const exp = Number(match[1]);
  return Number.isInteger(exp) ? exp : null;
}

/** True when the link expires inside the window (already-expired links count too). */
export function isDue(expSeconds: number, nowSeconds: number, windowSeconds = RESIGN_WINDOW_SECONDS): boolean {
  return Number.isInteger(expSeconds) && expSeconds - nowSeconds <= windowSeconds;
}

export type RenewalResult =
  | { action: "renew"; url: string; key: string; oldExpiresAt: number; expiresAt: number }
  | { action: "not_due"; key: string; expiresAt: number }
  | { action: "invalid"; reason: "bad_signature" | "bad_request" | "unsafe_key" | "not_parsable" };

export type ResignOptions = {
  secret: string;
  supabaseUrl: string;
  nowSeconds: number;
  windowSeconds?: number;
};

/**
 * Renew one stored address. Returns `not_due` for a valid link outside the window, `invalid` for
 * anything whose signature does not verify (never re-signed), and `renew` with the fresh address.
 */
export async function renewLinkUrl(url: string, opts: ResignOptions): Promise<RenewalResult> {
  if (!looksLikeFileLink(url)) return { action: "invalid", reason: "not_parsable" };
  if (!opts.secret) throw new Error("FILE_LINK_SECRET not set");

  let params: URLSearchParams;
  try {
    params = new URL(url).searchParams;
  } catch {
    return { action: "invalid", reason: "not_parsable" };
  }

  const check = await verifyFileLink(params, opts.secret, opts.nowSeconds);
  if (!check.ok && check.reason !== "expired") {
    return { action: "invalid", reason: check.reason };
  }

  const key = keyFromFileLink(url);
  if (!key) return { action: "invalid", reason: "unsafe_key" };

  const expiresAt = linkExpirySeconds(url);
  if (expiresAt === null) return { action: "invalid", reason: "bad_request" };
  if (!isDue(expiresAt, opts.nowSeconds, opts.windowSeconds)) {
    return { action: "not_due", key, expiresAt };
  }

  const renewed = await signFileLink({
    key,
    secret: opts.secret,
    supabaseUrl: opts.supabaseUrl,
    nowSeconds: opts.nowSeconds,
    seconds: FILE_LINK_SECONDS,
  });
  return { action: "renew", url: renewed, key, oldExpiresAt: expiresAt, expiresAt: opts.nowSeconds + FILE_LINK_SECONDS };
}

export type DeepRenewal = { pointer: string; key: string; oldExpiresAt: number; expiresAt: number };

/**
 * Renew every file-link string inside a JSON value (KV records, `payload_json` blobs). Returns a
 * new value plus the renewals and any link that failed the signature/key check (left untouched).
 */
export async function renewLinksDeep(
  value: unknown,
  opts: ResignOptions,
): Promise<{ value: unknown; renewals: DeepRenewal[]; invalid: Array<{ pointer: string; reason: string }>; linksSeen: number }> {
  const renewals: DeepRenewal[] = [];
  const invalid: Array<{ pointer: string; reason: string }> = [];
  let linksSeen = 0;

  const walk = async (node: unknown, pointer: string): Promise<unknown> => {
    if (typeof node === "string") {
      if (!looksLikeFileLink(node)) return node;
      linksSeen += 1;
      const result = await renewLinkUrl(node, opts);
      if (result.action === "renew") {
        renewals.push({
          pointer,
          key: result.key,
          oldExpiresAt: result.oldExpiresAt,
          expiresAt: result.expiresAt,
        });
        return result.url;
      }
      if (result.action === "invalid") invalid.push({ pointer, reason: result.reason });
      return node;
    }
    if (Array.isArray(node)) {
      const out: unknown[] = [];
      for (let i = 0; i < node.length; i += 1) out.push(await walk(node[i], `${pointer}[${i}]`));
      return out;
    }
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(node)) {
        const next = pointer ? `${pointer}.${key}` : key;
        out[key] = await walk(child, next);
      }
      return out;
    }
    return node;
  };

  const next = await walk(value, "");
  return { value: next, renewals, invalid, linksSeen };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

export type TargetSummary = {
  target: string;
  scanned: number;
  links: number;
  due: number;
  renewed: number;
  skippedChanged: number;
  skippedInvalid: number;
};

export type ResignSummary = {
  dryRun: boolean;
  renewed: number;
  due: number;
  skippedChanged: number;
  skippedInvalid: number;
  scanned: number;
  targets: TargetSummary[];
  errors: string[];
};

function targetName(target: ResignTarget): string {
  return `${target.schema}.${target.table}.${target.column}`;
}

/** One compare-and-set write through public.file_link_resign_cas. Returns true when the row changed. */
async function casWrite(
  sb: SupabaseLike,
  target: ResignTarget,
  pk: unknown,
  oldValue: unknown,
  newValue: unknown,
): Promise<boolean> {
  // JSON objects cannot go in a PostgREST `eq.` filter (supabase-js serialises them as
  // "eq.[object Object]", and a payload is far too long for the URL), so the comparison and the
  // write happen in the database function with both values in the POST body.
  const { data, error } = await sb.rpc("file_link_resign_cas", {
    p_target: targetName(target),
    p_pk: String(pk),
    p_old: oldValue,
    p_new: newValue,
  });
  if (error) throw new Error(error.message);
  return data === true;
}

/** One page of rows holding a file-link, from public.file_link_resign_scan (filtered in the database). */
async function scanPage(
  sb: SupabaseLike,
  target: ResignTarget,
  after: string | null,
  pageSize: number,
): Promise<Array<{ pk: string; value: unknown }>> {
  const { data, error } = await sb.rpc("file_link_resign_scan", {
    p_target: targetName(target),
    p_after: after,
    p_limit: pageSize,
  });
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data : [];
}

/**
 * Scan one target, renew due links, and compare-and-set each write.
 * `dryRun` stops before the write and only counts.
 *
 * The database returns only rows that hold a file-link (review 25 Nov: whole tables used to be
 * downloaded), and paging walks every such row to the end — there is no row cap that would leave
 * the same tail unscanned every month.
 */
export async function resignTarget(
  sb: SupabaseLike,
  target: ResignTarget,
  opts: ResignOptions & { dryRun: boolean; pageSize?: number },
): Promise<TargetSummary> {
  const pageSize = Math.min(Math.max(opts.pageSize ?? 200, 1), 500);
  const summary: TargetSummary = {
    target: targetName(target),
    scanned: 0,
    links: 0,
    due: 0,
    renewed: 0,
    skippedChanged: 0,
    skippedInvalid: 0,
  };

  let last: string | null = null;
  for (;;) {
    const data = await scanPage(sb, target, last, pageSize);
    if (data.length === 0) break;

    for (const row of data) {
      summary.scanned += 1;
      const oldValue = row.value;
      if (target.kind === "text") {
        if (!looksLikeFileLink(oldValue)) continue;
        summary.links += 1;
        const result = await renewLinkUrl(oldValue, opts);
        if (result.action === "invalid") {
          summary.skippedInvalid += 1;
          continue;
        }
        if (result.action !== "renew") continue;
        summary.due += 1;
        if (opts.dryRun) {
          summary.renewed += 1;
          continue;
        }
        if (await casWrite(sb, target, row.pk, oldValue, result.url)) summary.renewed += 1;
        else summary.skippedChanged += 1;
      } else {
        const deep = await renewLinksDeep(oldValue, opts);
        summary.links += deep.linksSeen;
        summary.skippedInvalid += deep.invalid.length;
        if (!deep.renewals.length) continue;
        summary.due += deep.renewals.length;
        if (opts.dryRun) {
          summary.renewed += deep.renewals.length;
          continue;
        }
        if (await casWrite(sb, target, row.pk, oldValue, deep.value)) summary.renewed += deep.renewals.length;
        else summary.skippedChanged += 1;
      }
    }

    if (data.length < pageSize) break;
    const next = data[data.length - 1].pk;
    // Keyset must move forward; if it does not, stop rather than loop.
    if (next === null || next === undefined || next === last) break;
    last = String(next);
  }

  return summary;
}

/**
 * What a person should look at after a run: any target that failed, and any due link that could
 * not be renewed (a row edited mid-run, or a link whose signature does not verify). Empty = fine.
 */
export function attentionFor(summary: ResignSummary): string[] {
  const out: string[] = [];
  for (const error of summary.errors) out.push(`target failed: ${error}`);
  for (const t of summary.targets) {
    if (t.skippedChanged > 0) out.push(`${t.target}: ${t.skippedChanged} row(s) changed during the run; run again`);
    if (t.skippedInvalid > 0) out.push(`${t.target}: ${t.skippedInvalid} link(s) failed the signature check`);
  }
  return out;
}

/** Run every target. Never throws for one target: the error is reported in the summary. */
export async function runFileLinkResign(
  sb: SupabaseLike,
  opts: ResignOptions & { dryRun?: boolean; targets?: readonly ResignTarget[]; pageSize?: number },
): Promise<ResignSummary> {
  const dryRun = opts.dryRun === true;
  const summary: ResignSummary = {
    dryRun,
    renewed: 0,
    due: 0,
    skippedChanged: 0,
    skippedInvalid: 0,
    scanned: 0,
    targets: [],
    errors: [],
  };

  for (const target of opts.targets ?? RESIGN_TARGETS) {
    try {
      const result = await resignTarget(sb, target, { ...opts, dryRun });
      summary.targets.push(result);
      summary.renewed += result.renewed;
      summary.due += result.due;
      summary.skippedChanged += result.skippedChanged;
      summary.skippedInvalid += result.skippedInvalid;
      summary.scanned += result.scanned;
    } catch (e) {
      summary.errors.push(`${targetName(target)}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return summary;
}
