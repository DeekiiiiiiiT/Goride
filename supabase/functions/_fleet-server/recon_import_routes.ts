/**
 * Week Reconciliation P2 — staged toll import API.
 * See WEEK_RECONCILIATION_WIZARD_AUDIT.md §4.5.
 */
import type { Hono } from "npm:hono@4.3.11";
import type { Context } from "npm:hono@4.3.11";
import { requireAuth, requirePermission } from "./rbac_middleware.ts";
import { getOrgId } from "./org_scope.ts";
import { safeErrorResponse } from "./safe_error.ts";
import { getServiceClient } from "./service_client.ts";
import { stampOrg } from "./org_scope.ts";
import * as kv from "./kv_store.tsx";
import {
  saveTollLedgerEntry,
  transactionToTollLedgerServer,
} from "./toll_controller.tsx";
import {
  classifyTollImportRow,
  normalizeProviderRefForIndex,
  stagingRowOverrideId,
  type StagedTollRowClassification,
} from "../../../packages/finance-core/src/reconTollImport.ts";
import {
  classifyFuelImportRow,
  fuelReceiptKey,
  type StagedFuelRowClassification,
} from "../../../packages/finance-core/src/reconFuelImport.ts";
import type { TollIntegrityLike } from "../../../packages/finance-core/src/tollLedgerIntegrity.ts";
import { periodKeyFor } from "../../../packages/finance-core/src/periodKey.ts";

const IMPORTS = "/make-server-37f42386/recon/imports";
const FLEET_TZ = "America/Jamaica";

const FUEL_SOURCE_IDS = new Set(["fuel_card_self", "fuel_card_roam"]);
const TOLL_SOURCE_IDS = new Set(["toll_usage", "toll_topup"]);

function isFuelSource(sourceId: string): boolean {
  return FUEL_SOURCE_IDS.has(sourceId);
}

function isTollSource(sourceId: string): boolean {
  return TOLL_SOURCE_IDS.has(sourceId);
}

type ImportStagingRow = {
  import_id: string;
  row_index: number;
  payload: Record<string, unknown>;
  classification: StagedTollRowClassification | StagedFuelRowClassification;
  week_key: string | null;
  override_keep: boolean;
};

function rowToIntegrity(payload: Record<string, unknown>): TollIntegrityLike {
  const meta = (payload.metadata as Record<string, unknown>) || {};
  return {
    id: payload.id != null ? String(payload.id) : undefined,
    vehicleId: payload.vehicleId != null ? String(payload.vehicleId) : null,
    driverId: payload.driverId != null ? String(payload.driverId) : null,
    date: payload.date != null ? String(payload.date).slice(0, 10) : null,
    amount: typeof payload.amount === "number" ? payload.amount : Number(payload.amount),
    paymentMethod: payload.paymentMethod != null ? String(payload.paymentMethod) : null,
    referenceNumber:
      (payload.referenceNumber != null ? String(payload.referenceNumber) : null) ||
      (typeof meta.referenceNumber === "string" ? meta.referenceNumber : null),
    status: payload.status != null ? String(payload.status) : null,
    metadata: meta,
    plaza: payload.vendor != null ? String(payload.vendor) : null,
    batchId: payload.batchId != null ? String(payload.batchId) : null,
  };
}

async function loadExistingFuelReceipts(orgId: string): Promise<Set<string>> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("fleet_fuel_entries")
    .select("metadata")
    .eq("organization_id", orgId)
    .limit(50000);
  if (error) {
    console.warn("[recon-import] fleet_fuel_entries load failed", error.message);
    return new Set();
  }
  const out = new Set<string>();
  for (const row of data || []) {
    const meta = (row as { metadata?: Record<string, unknown> }).metadata || {};
    const key = fuelReceiptKey({ metadata: meta });
    if (key) out.add(key);
  }
  return out;
}

async function loadExistingTollRows(orgId: string): Promise<TollIntegrityLike[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("fleet_toll_ledger")
    .select(
      "id, vehicle_id, driver_id, date, amount, payment_method, status, metadata, payload_json, batch_id, trip_id, plaza, provider_ref",
    )
    .eq("organization_id", orgId)
    .limit(100000);
  if (error) {
    console.warn("[recon-import] fleet_toll_ledger load failed", error.message);
    return [];
  }
  return (data || []).map((row: Record<string, unknown>) => {
    const meta = {
      ...((row.metadata as Record<string, unknown>) || {}),
      ...(((row.payload_json as Record<string, unknown>)?.metadata as Record<string, unknown>) || {}),
    };
    const ref =
      (row.provider_ref as string) ||
      (row.payload_json as Record<string, unknown>)?.referenceNumber ||
      meta.referenceNumber;
    return {
      id: String(row.id),
      vehicleId: row.vehicle_id != null ? String(row.vehicle_id) : null,
      driverId: row.driver_id != null ? String(row.driver_id) : null,
      date: row.date != null ? String(row.date).slice(0, 10) : null,
      amount: Number(row.amount),
      paymentMethod: row.payment_method != null ? String(row.payment_method) : null,
      status: row.status != null ? String(row.status) : null,
      referenceNumber: ref != null ? String(ref) : null,
      metadata: meta,
      plaza: row.plaza != null ? String(row.plaza) : null,
      batchId: row.batch_id != null ? String(row.batch_id) : null,
      tripId: row.trip_id != null ? String(row.trip_id) : null,
    } satisfies TollIntegrityLike;
  });
}

function primaryWeekKeyFromRows(rows: ImportStagingRow[]): string | null {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (r.classification === "rejected" || !r.week_key) continue;
    const wk = String(r.week_key).slice(0, 10);
    counts.set(wk, (counts.get(wk) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [wk, n] of counts) {
    if (n > bestN) {
      best = wk;
      bestN = n;
    }
  }
  return best;
}

function applySpillClassification(
  rows: ImportStagingRow[],
  selectedWeekKey: string | null,
): ImportStagingRow[] {
  const anchor = selectedWeekKey || primaryWeekKeyFromRows(rows);
  if (!anchor) return rows;
  return rows.map((r) => {
    if (r.classification === "rejected" || r.classification === "duplicate_ref") return r;
    if (!r.week_key) return r;
    const wk = String(r.week_key).slice(0, 10);
    if (wk === anchor) return r;
    return { ...r, classification: "spill" as StagedTollRowClassification };
  });
}

function buildPreviewFromRows(rows: ImportStagingRow[]) {
  const preview = {
    new: [] as unknown[],
    duplicate: { byRef: [] as unknown[], byFingerprint: [] as unknown[] },
    rejected: [] as unknown[],
    spill: [] as unknown[],
    totals_minor: 0,
    coverage_start: null as string | null,
    coverage_end: null as string | null,
  };
  const dates: string[] = [];
  for (const r of rows) {
    const p = r.payload;
    const amt = Math.round(Math.abs(Number(p.amount) || 0) * 100);
    if (
      r.classification === "new" ||
      r.classification === "duplicate_fingerprint" ||
      r.classification === "duplicate_receipt"
    ) {
      preview.totals_minor += amt;
    }
    const day = p.date != null ? String(p.date).slice(0, 10) : null;
    if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) dates.push(day);

    const item = {
      rowIndex: r.row_index,
      rowId: stagingRowOverrideId(r.import_id, r.row_index),
      payload: p,
      classification: r.classification,
      weekKey: r.week_key,
    };
    switch (r.classification) {
      case "new":
        preview.new.push(item);
        break;
      case "duplicate_ref":
        preview.duplicate.byRef.push(item);
        break;
      case "duplicate_fingerprint":
        preview.duplicate.byFingerprint.push(item);
        break;
      case "duplicate_receipt":
        preview.duplicate.byRef.push(item);
        break;
      case "rejected":
        preview.rejected.push(item);
        break;
      case "spill":
        preview.spill.push(item);
        break;
      default:
        break;
    }
  }
  dates.sort();
  preview.coverage_start = dates[0] ?? null;
  preview.coverage_end = dates[dates.length - 1] ?? null;
  return preview;
}

async function getStagingImport(orgId: string, importId: string) {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("recon_import_staging")
    .select("*")
    .eq("id", importId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function loadStagingRows(importId: string): Promise<ImportStagingRow[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("recon_import_staging_rows")
    .select("*")
    .eq("import_id", importId)
    .order("row_index", { ascending: true });
  if (error) throw error;
  return (data || []) as ImportStagingRow[];
}

function classifyNormalizedRows(
  orgId: string,
  importId: string,
  sourceId: string,
  mode: "usage" | "topup",
  rows: Array<Record<string, unknown>>,
  existing: TollIntegrityLike[],
): ImportStagingRow[] {
  const intraRefs = new Set<string>();
  const out: ImportStagingRow[] = [];

  for (let i = 0; i < rows.length; i += 1) {
    const raw = { ...rows[i] };
    if (!raw.id) raw.id = crypto.randomUUID();

    if (!raw.vehicleId) {
      out.push({
        import_id: importId,
        row_index: i,
        payload: raw,
        classification: "rejected",
        week_key: null,
        override_keep: false,
      });
      continue;
    }

    const day = raw.date != null ? String(raw.date).slice(0, 10) : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      out.push({
        import_id: importId,
        row_index: i,
        payload: { ...raw, rejectReason: "invalid_date" },
        classification: "rejected",
        week_key: null,
        override_keep: false,
      });
      continue;
    }

    const weekKey = periodKeyFor(day, FLEET_TZ);
    let classification: StagedTollRowClassification = "new";
    const like = rowToIntegrity(raw);
    const result = classifyTollImportRow(like, existing, { intraBatchRefs: intraRefs });
    classification = result.classification;
    const ref = normalizeProviderRefForIndex(
      like.referenceNumber as string | undefined,
    );
    if (ref) intraRefs.add(ref);
    if (classification === "new") {
      existing.push(like);
    }

    out.push({
      import_id: importId,
      row_index: i,
      payload: {
        ...raw,
        importMode: mode,
        sourceId,
        organizationId: orgId,
      },
      classification,
      week_key: weekKey,
      override_keep: false,
    });
  }
  return out;
}

function classifyFuelNormalizedRows(
  orgId: string,
  importId: string,
  sourceId: string,
  rows: Array<Record<string, unknown>>,
  existingReceipts: Set<string>,
  selectedWeekKey: string | null,
): ImportStagingRow[] {
  const intraReceipts = new Set<string>();
  const out: ImportStagingRow[] = [];

  for (let i = 0; i < rows.length; i += 1) {
    const raw = { ...rows[i] };
    if (!raw.id) raw.id = crypto.randomUUID();
    const day = raw.date != null ? String(raw.date).slice(0, 10) : "";
    const weekKey = /^\d{4}-\d{2}-\d{2}$/.test(day) ? periodKeyFor(day, FLEET_TZ) : null;

    const classification = classifyFuelImportRow(
      {
        id: raw.id != null ? String(raw.id) : undefined,
        date: day || null,
        amount: typeof raw.amount === "number" ? raw.amount : Number(raw.amount),
        metadata: (raw.metadata as Record<string, unknown>) || {},
      },
      new Set([...existingReceipts, ...intraReceipts]),
      { selectedWeekKey, fleetTz: FLEET_TZ },
    );

    const receipt = fuelReceiptKey({ metadata: (raw.metadata as Record<string, unknown>) || {} });
    if (receipt && classification === "new") intraReceipts.add(receipt);

    out.push({
      import_id: importId,
      row_index: i,
      payload: {
        ...raw,
        sourceId,
        organizationId: orgId,
      },
      classification,
      week_key: weekKey,
      override_keep: false,
    });
  }
  return out;
}

async function persistStagingRows(rows: ImportStagingRow[]) {
  const sb = getServiceClient();
  const importId = rows[0]?.import_id;
  if (!importId) return;
  await sb.from("recon_import_staging_rows").delete().eq("import_id", importId);
  if (rows.length === 0) return;
  const { error } = await sb.from("recon_import_staging_rows").insert(
    rows.map((r) => ({
      import_id: r.import_id,
      row_index: r.row_index,
      payload: r.payload,
      classification: r.classification,
      week_key: r.week_key,
      override_keep: r.override_keep,
    })),
  );
  if (error) throw error;
}

export function registerReconImportRoutes(app: Hono) {
  app.post(
    "/make-server-37f42386/recon/imports",
    requireAuth({ strict: true }),
    requirePermission("data.import"),
    async (c: Context) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "ORG_REQUIRED" }, 400);
        const body = await c.req.json().catch(() => ({}));
        const sourceId = String(body.sourceId || "").trim();
        if (!sourceId) return c.json({ error: "sourceId required" }, 400);
        if (!isTollSource(sourceId) && !isFuelSource(sourceId) && sourceId !== "uber_bundle") {
          return c.json({ error: "INVALID_SOURCE", message: "Unsupported recon import sourceId" }, 400);
        }
        const weekKey = body.weekKey ? String(body.weekKey).slice(0, 10) : null;
        const fileName = body.fileName ? String(body.fileName) : null;
        const sha256 = body.sha256 ? String(body.sha256) : null;
        const rbacUser = c.get("rbacUser") as { userId?: string; email?: string } | undefined;
        const importId = crypto.randomUUID();
        const sb = getServiceClient();
        const { error } = await sb.from("recon_import_staging").insert({
          id: importId,
          organization_id: orgId,
          source_id: sourceId,
          status: "staged",
          file_name: fileName,
          file_sha256: sha256,
          week_key: weekKey,
          created_by: rbacUser?.email || rbacUser?.userId || null,
        });
        if (error) throw error;
        return c.json({ success: true, importId, status: "staged" });
      } catch (e) {
        return safeErrorResponse(c, e, "recon-import-create");
      }
    },
  );

  app.post(
    "/make-server-37f42386/recon/imports/:id/parse",
    requireAuth({ strict: true }),
    requirePermission("data.import"),
    async (c: Context) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "ORG_REQUIRED" }, 400);
        const importId = c.req.param("id");
        const staging = await getStagingImport(orgId, importId);
        if (!staging) return c.json({ error: "NOT_FOUND" }, 404);
        if (staging.status === "committed" || staging.status === "rolled_back") {
          return c.json({ error: "IMPORT_CLOSED", message: staging.status }, 409);
        }

        const body = await c.req.json().catch(() => ({}));
        const stagingSourceId = String(staging.source_id);
        const mode = body.mode === "topup" ? "topup" : body.mode === "fuel" ? "fuel" : "usage";
        let rows = Array.isArray(body.rows) ? body.rows : [];
        const csvText = typeof body.csvText === "string" ? body.csvText : "";
        if (rows.length === 0 && csvText.trim()) {
          rows = csvText
            .split(/\r?\n/)
            .map((line: string) => line.trim())
            .filter(Boolean)
            .map((line: string, idx: number) => ({
              rowIndex: idx,
              rawLine: line,
              rejectReason: "server_csv_parse_requires_normalized_rows",
            }));
        }
        if (rows.length === 0) {
          return c.json({
            error: "rows_required",
            message: "Provide rows[] (normalized transactions) or csvText with rows from client parse",
          }, 400);
        }
        if (rows[0]?.rejectReason) {
          return c.json({
            error: "parse_client_rows",
            message: "Send normalized rows[] built from CSV (P2); raw csvText-only parse is not enabled yet",
          }, 400);
        }

        const parseWeekKey = body.weekKey
          ? String(body.weekKey).slice(0, 10)
          : (staging.week_key ? String(staging.week_key).slice(0, 10) : null);

        let classified: ImportStagingRow[];
        if (isFuelSource(stagingSourceId) || mode === "fuel") {
          const receipts = await loadExistingFuelReceipts(orgId);
          classified = classifyFuelNormalizedRows(
            orgId,
            importId,
            stagingSourceId,
            rows,
            receipts,
            parseWeekKey,
          );
        } else {
          const existing = await loadExistingTollRows(orgId);
          classified = classifyNormalizedRows(
            orgId,
            importId,
            stagingSourceId,
            mode === "topup" ? "topup" : "usage",
            rows,
            existing,
          );
          classified = applySpillClassification(classified, parseWeekKey);
        }
        await persistStagingRows(classified);
        const preview = buildPreviewFromRows(classified);
        const sb = getServiceClient();
        await sb.from("recon_import_staging").update({
          status: "parsed",
          preview,
        }).eq("id", importId);

        return c.json({ success: true, importId, preview, status: "parsed" });
      } catch (e) {
        return safeErrorResponse(c, e, "recon-import-parse");
      }
    },
  );

  app.post(
    "/make-server-37f42386/recon/imports/:id/commit",
    requireAuth({ strict: true }),
    requirePermission("data.import"),
    async (c: Context) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "ORG_REQUIRED" }, 400);
        const importId = c.req.param("id");
        const staging = await getStagingImport(orgId, importId);
        if (!staging) return c.json({ error: "NOT_FOUND" }, 404);
        if (staging.status === "committed") {
          return c.json({ success: true, importId, idempotent: true, batchId: staging.import_batch_id });
        }
        if (staging.status !== "parsed") {
          return c.json({ error: "NOT_PARSED" }, 409);
        }

        const body = await c.req.json().catch(() => ({}));
        const idempotencyKey = body.idempotencyKey ? String(body.idempotencyKey) : null;
        if (idempotencyKey && staging.idempotency_key === idempotencyKey) {
          return c.json({ success: true, importId, idempotent: true, batchId: staging.import_batch_id });
        }

        const sourceId = String(staging.source_id);

        if (isFuelSource(sourceId)) {
          const clientBatchId = body.batchId ? String(body.batchId) : null;
          if (!clientBatchId) {
            return c.json({
              error: "FUEL_CLIENT_COMMIT",
              message: "Fuel imports commit via client fuel-entries; pass batchId after save or use /register",
            }, 400);
          }
          const idempotencyKey = body.idempotencyKey ? String(body.idempotencyKey) : null;
          if (idempotencyKey && staging.idempotency_key === idempotencyKey) {
            return c.json({ success: true, importId, idempotent: true, batchId: staging.import_batch_id });
          }
          const rowsCommitted = typeof body.rowsCommitted === "number" ? body.rowsCommitted : null;
          const sb = getServiceClient();
          await sb.from("recon_import_staging").update({
            status: "committed",
            import_batch_id: clientBatchId,
            idempotency_key: idempotencyKey,
            preview: { fuelClientCommit: body },
          }).eq("id", importId);
          return c.json({
            success: true,
            importId,
            batchId: clientBatchId,
            committed: rowsCommitted ?? 0,
          });
        }

        const overrideIds = new Set<string>(
          Array.isArray(body.overrideFingerprintDupRowIds)
            ? body.overrideFingerprintDupRowIds.map(String)
            : [],
        );

        const rows = await loadStagingRows(importId);
        const preview = staging.preview as Record<string, unknown> | null;
        const coverageStart =
          (preview?.coverage_start as string) ||
          rows.map((r) => String(r.payload.date || "").slice(0, 10)).filter(Boolean).sort()[0] ||
          null;
        const coverageEnd =
          (preview?.coverage_end as string) ||
          rows.map((r) => String(r.payload.date || "").slice(0, 10)).filter(Boolean).sort().slice(-1)[0] ||
          null;

        const batchId = staging.import_batch_id || crypto.randomUUID();
        const batchPayload = stampOrg({
          id: batchId,
          fileName: staging.file_name || "toll_import.csv",
          uploadDate: new Date().toISOString(),
          status: "processing",
          type: sourceId,
          sourceId,
          coverageStart,
          coverageEnd,
          dataStart: coverageStart,
          dataEnd: coverageEnd,
          dataPeriodStart: coverageStart,
          dataPeriodEnd: coverageEnd,
          recordCount: 0,
          rowsParsed: rows.length,
          fileSha256: staging.file_sha256,
          reconImportId: importId,
        }, c);
        await kv.set(`batch:${batchId}`, batchPayload);

        let committed = 0;
        let skippedRef = 0;
        let skippedFp = 0;
        let rejected = 0;

        for (const row of rows) {
          if (row.classification === "duplicate_ref") {
            skippedRef += 1;
            continue;
          }
          if (row.classification === "rejected") {
            rejected += 1;
            continue;
          }
          if (row.classification === "spill") continue;

          const rowOverrideId = stagingRowOverrideId(importId, row.row_index);
          const allowFingerprintDup =
            row.classification === "new" ||
            (row.classification === "duplicate_fingerprint" && overrideIds.has(rowOverrideId));

          if (row.classification === "duplicate_fingerprint" && !allowFingerprintDup) {
            skippedFp += 1;
            continue;
          }

          const tx = {
            ...row.payload,
            id: row.payload.id || crypto.randomUUID(),
            batchId,
            batchName: staging.file_name,
            metadata: {
              ...((row.payload.metadata as Record<string, unknown>) || {}),
              imported: true,
              importDate: new Date().toISOString(),
              reconImportId: importId,
              ...(allowFingerprintDup && row.classification === "duplicate_fingerprint"
                ? { importOverrideFingerprint: true }
                : {}),
            },
          };

          const tollRecord = stampOrg(transactionToTollLedgerServer(tx), c);
          const saved = await saveTollLedgerEntry(tollRecord, c);
          if (saved) committed += 1;
        }

        await kv.set(`batch:${batchId}`, {
          ...batchPayload,
          status: "committed",
          recordCount: committed,
          rowsCommitted: committed,
          rowsDuplicate: skippedRef + skippedFp,
          rowsRejected: rejected,
        });

        const sb = getServiceClient();
        await sb.from("recon_import_staging").update({
          status: "committed",
          import_batch_id: batchId,
          idempotency_key: idempotencyKey,
          preview: {
            ...(preview || {}),
            commit: { committed, skippedRef, skippedFp, rejected },
          },
        }).eq("id", importId);

        return c.json({
          success: true,
          importId,
          batchId,
          committed,
          skippedRef,
          skippedFp,
          rejected,
        });
      } catch (e) {
        return safeErrorResponse(c, e, "recon-import-commit");
      }
    },
  );

  app.post(
    "/make-server-37f42386/recon/imports/:id/rollback",
    requireAuth({ strict: true }),
    requirePermission("data.import"),
    async (c: Context) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "ORG_REQUIRED" }, 400);
        const importId = c.req.param("id");
        const staging = await getStagingImport(orgId, importId);
        if (!staging) return c.json({ error: "NOT_FOUND" }, 404);
        const body = await c.req.json().catch(() => ({}));
        const reason = body.reason ? String(body.reason) : "rollback";
        const sb = getServiceClient();
        await sb.from("recon_import_staging").update({
          status: "rolled_back",
          rollback_reason: reason,
        }).eq("id", importId);
        if (staging.import_batch_id) {
          try {
            const batchKey = `batch:${staging.import_batch_id}`;
            const batch = await kv.get(batchKey);
            if (batch) {
              await kv.set(batchKey, { ...batch, status: "rolled_back", rollbackReason: reason });
            }
          } catch {
            /* best-effort */
          }
        }
        return c.json({ success: true, importId, status: "rolled_back" });
      } catch (e) {
        return safeErrorResponse(c, e, "recon-import-rollback");
      }
    },
  );

  app.post(
    "/make-server-37f42386/recon/imports/:id/register",
    requireAuth({ strict: true }),
    requirePermission("data.import"),
    async (c: Context) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "ORG_REQUIRED" }, 400);
        const importId = c.req.param("id");
        const body = await c.req.json().catch(() => ({}));
        const batchId = body.batchId ? String(body.batchId) : importId;
        const sourceId = String(body.sourceId || "uber_bundle");
        const coverageStart = body.coverageStart ? String(body.coverageStart).slice(0, 10) : null;
        const coverageEnd = body.coverageEnd ? String(body.coverageEnd).slice(0, 10) : null;
        const dataStart = body.dataStart ? String(body.dataStart).slice(0, 10) : coverageStart;
        const dataEnd = body.dataEnd ? String(body.dataEnd).slice(0, 10) : coverageEnd;
        const semanticKey = body.semanticKey
          ? String(body.semanticKey)
          : (coverageStart && coverageEnd
            ? (isFuelSource(sourceId)
              ? `fuel:${sourceId}:${orgId}:${coverageStart}:${coverageEnd}`
              : sourceId === "uber_bundle"
              ? `uber:${orgId}:${coverageStart}:${coverageEnd}`
              : null)
            : null);
        const supersedes = body.supersedes ? String(body.supersedes) : null;
        const weekKeys = Array.isArray(body.weekKeys) ? body.weekKeys.map(String) : [];
        const rowsCommitted = typeof body.rowsCommitted === "number" ? body.rowsCommitted : null;

        const batch = await kv.get(`batch:${batchId}`);
        const merged = stampOrg({
          ...(batch || { id: batchId }),
          sourceId,
          coverageStart,
          coverageEnd,
          dataStart,
          dataEnd,
          dataPeriodStart: dataStart,
          dataPeriodEnd: dataEnd,
          semanticKey,
          supersedes,
          weekKeys,
          rowsCommitted,
          status: batch?.status || "committed",
          reconImportId: importId,
        }, c);
        await kv.set(`batch:${batchId}`, merged);

        const sb = getServiceClient();
        const existing = await getStagingImport(orgId, importId);
        if (existing) {
          await sb.from("recon_import_staging").update({
            source_id: sourceId,
            status: "committed",
            import_batch_id: batchId,
            preview: { register: body },
          }).eq("id", importId);
        } else {
          await sb.from("recon_import_staging").insert({
            id: importId,
            organization_id: orgId,
            source_id: sourceId,
            status: "committed",
            import_batch_id: batchId,
            preview: { register: body },
          });
        }

        return c.json({ success: true, importId, batchId });
      } catch (e) {
        return safeErrorResponse(c, e, "recon-import-register");
      }
    },
  );
}
