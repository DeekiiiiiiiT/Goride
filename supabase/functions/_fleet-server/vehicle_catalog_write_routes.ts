/** Vehicle catalog writes live on platform-catalog. Reads stay on fleet-core. */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { requireAuth } from "./rbac_middleware.ts";
import { dominionCan } from "../../../packages/auth-client/src/dominionPermissions.ts";
import { checkRateLimit, getClientIp } from "./rate_limiter.ts";
import { parseCatalogMonthFromUnknown } from "../../../packages/types/src/catalogMonthParse.ts";
import {
  VEHICLE_CATALOG_BULK_MAX_ROWS,
  VEHICLE_CATALOG_WRITABLE_KEYS,
} from "../../../packages/types/src/vehicleCatalogCsvImport.ts";
import {
  catalogRowForApi,
  insertRowForLegacyDb,
  isLegacyVehicleCatalogYearNotNullError,
  isPostgrestVehicleCatalogSchemaCacheError,
  mergeCatalogTrimIntoTrimSeriesInPlace,
  parseMissingColumnFromVehicleCatalogDbError,
  patchRowForLegacyDb,
  shouldStripVehicleCatalogInsertPayloadOnRetry,
  stripVehicleCatalogOptionalMigrationColumns,
  VEHICLE_CATALOG_SUPABASE_SELECT,
} from "./vehicle_catalog_schema_fallback.ts";
import {
  countCatalogDependencies,
  countCatalogDependenciesForIds,
  dependenciesBlockDelete,
  invalidateCatalogExistenceCache,
  stampCatalogProvenance,
} from "./vehicle_catalog_enterprise.ts";

export function registerVehicleCatalogWriteRoutes(
  app: { post: unknown; patch: unknown; delete: unknown },
  supabase: SupabaseClient,
): void {
  const route = app as {
    post: (path: string, ...handlers: unknown[]) => void;
    patch: (path: string, ...handlers: unknown[]) => void;
    delete: (path: string, ...handlers: unknown[]) => void;
  };
function parseCatalogProductionEndYear(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1900 || n > 2100) return null;
  return n;
}

function assertCatalogProductionSpan(start: number, end: number | null): string | null {
  if (end != null && end < start) return "production_end_year must be >= production_start_year";
  return null;
}

const MAX_ENGINE_TYPE_LEN = 200;

function validateEngineType(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const s = String(raw).trim();
  if (s.length > MAX_ENGINE_TYPE_LEN) {
    return `engine_type must be at most ${MAX_ENGINE_TYPE_LEN} characters`;
  }
  return null;
}

function parseOptionalProductionMonth(
  raw: unknown,
  label: string,
): { ok: true; value: number | null } | { ok: false; error: string } {
  return parseCatalogMonthFromUnknown(raw, label);
}

function assertVehicleCatalogAccess(c: any) {
  const rbacUser = c.get("rbacUser") as any;
  const callerRole = rbacUser?.resolvedRole || rbacUser?.role;
  if (!dominionCan(callerRole, "catalog.write")) {
    return c.json({ error: "Forbidden", message: "You cannot change that" }, 403);
  }
  return null;
}

function vehicleCatalogActorId(c: any): string | null {
  const rbacUser = c.get("rbacUser") as { userId?: string; id?: string } | undefined;
  const id = String(rbacUser?.userId ?? rbacUser?.id ?? "").trim();
  return id || null;
}

async function assertCatalogWriteRateLimit(c: any) {
  const clientIp = getClientIp(c);
  const userId = vehicleCatalogActorId(c) || "unknown";
  const rateLimitKey = `catalog:${clientIp}:${userId}`;
  const rateCheck = await checkRateLimit(rateLimitKey, "catalog_write");
  if (!rateCheck.allowed) {
    return c.json(
      {
        error: "rate_limit_exceeded",
        message: `Too many catalog writes. Please wait ${rateCheck.retryAfterSec} seconds.`,
        retryAfter: rateCheck.retryAfterSec,
      },
      429,
    );
  }
  return null;
}

function pickVehicleCatalogRow(raw: Record<string, unknown>, partial: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of VEHICLE_CATALOG_WRITABLE_KEYS) {
    if (!(k in raw)) continue;
    const v = raw[k];
    if (v === undefined) continue;
    if (partial) {
      if (v === "") continue;
      out[k] = v;
    } else {
      /** Omit nulls on create so PostgREST does not require columns that are absent on older DBs. */
      if (v === null) continue;
      if (v === "" && k !== "make" && k !== "model") continue;
      out[k] = v;
    }
  }
  // Never trust client-supplied actor stamps; edge overwrites after pick.
  delete out.created_by;
  delete out.updated_by;
  return out;
}

/** Bulk-delete every row in motor vehicle catalog (maintenance templates CASCADE). */
const VEHICLE_CATALOG_PURGE_CONFIRM = "DELETE ALL";
/** Must match client `VEHICLE_CATALOG_UNDO_BATCH_CONFIRM_PHRASE` — required when force-undoing a batch. */
const VEHICLE_CATALOG_UNDO_BATCH_CONFIRM = "UNDO BATCH";

// POST /admin/vehicle-catalog/purge — must be registered before POST /admin/vehicle-catalog (create)
route.post("/make-server-37f42386/admin/vehicle-catalog/purge", requireAuth(), async (c: any) => {
  const denied = assertVehicleCatalogAccess(c);
  if (denied) return denied;
  const limited = await assertCatalogWriteRateLimit(c);
  if (limited) return limited;
  try {
    const body = (await c.req.json().catch(() => ({}))) as { confirm?: string };
    if (String(body.confirm ?? "").trim() !== VEHICLE_CATALOG_PURGE_CONFIRM) {
      return c.json(
        { error: `Confirmation required: send JSON { "confirm": "${VEHICLE_CATALOG_PURGE_CONFIRM}" }` },
        400,
      );
    }
    const CHUNK = 500;
    let deleted = 0;
    for (;;) {
      const { data: batch, error: qErr } = await supabase.from("vehicle_catalog").select("id").limit(CHUNK);
      if (qErr) throw qErr;
      if (!batch?.length) break;
      const ids = (batch as { id: string }[]).map((r) => r.id);
      const { error: dErr } = await supabase.from("vehicle_catalog").delete().in("id", ids);
      if (dErr) throw dErr;
      deleted += ids.length;
      if (batch.length < CHUNK) break;
    }
    invalidateCatalogExistenceCache();
    return c.json({ deleted });
  } catch (e: any) {
    console.error("[vehicle-catalog] purge:", e);
    return c.json({ error: e.message || "Failed to purge vehicle catalog" }, 500);
  }
});

route.post("/make-server-37f42386/admin/vehicle-catalog/bulk", requireAuth(), async (c: any) => {
  const denied = assertVehicleCatalogAccess(c);
  if (denied) return denied;
  const limited = await assertCatalogWriteRateLimit(c);
  if (limited) return limited;
  try {
    const body = (await c.req.json()) as {
      import_batch_id?: string;
      rows?: Array<{ rowIndex?: number; id?: string; payload?: Record<string, unknown> }>;
    };
    const importBatchId = String(body.import_batch_id ?? "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(importBatchId)) {
      return c.json({ error: "import_batch_id must be a UUID" }, 400);
    }
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (rows.length === 0) return c.json({ error: "rows required" }, 400);
    if (rows.length > VEHICLE_CATALOG_BULK_MAX_ROWS) {
      return c.json({ error: `Max ${VEHICLE_CATALOG_BULK_MAX_ROWS} rows per bulk request` }, 400);
    }

    const actorId = vehicleCatalogActorId(c);
    const results: Array<{
      rowIndex: number;
      ok: boolean;
      id?: string;
      action?: "created" | "updated";
      error?: string;
      item?: Record<string, unknown>;
    }> = [];

    for (const entry of rows) {
      const rowIndex = Number(entry.rowIndex ?? 0);
      const payload = (entry.payload && typeof entry.payload === "object" ? entry.payload : {}) as Record<
        string,
        unknown
      >;
      const existingId = typeof entry.id === "string" ? entry.id.trim() : "";
      try {
        if (existingId) {
          const make = payload.make !== undefined ? String(payload.make ?? "").trim() : undefined;
          const model = payload.model !== undefined ? String(payload.model ?? "").trim() : undefined;
          const row = pickVehicleCatalogRow(
            {
              ...payload,
              ...(make !== undefined ? { make } : {}),
              ...(model !== undefined ? { model } : {}),
            },
            true,
          );
          stampCatalogProvenance(row, {
            userId: actorId,
            source: "csv_import",
            importBatchId,
            isCreate: false,
          });
          row.updated_at = new Date().toISOString();
          let upd: any = await supabase
            .from("vehicle_catalog")
            .update(row)
            .eq("id", existingId)
            .select(VEHICLE_CATALOG_SUPABASE_SELECT)
            .single();
          if (upd.error && shouldStripVehicleCatalogInsertPayloadOnRetry(upd.error)) {
            const trimmed = stripVehicleCatalogOptionalMigrationColumns(row);
            trimmed.updated_at = row.updated_at;
            stampCatalogProvenance(trimmed, {
              userId: actorId,
              source: "csv_import",
              importBatchId,
              isCreate: false,
            });
            upd = await supabase
              .from("vehicle_catalog")
              .update(trimmed)
              .eq("id", existingId)
              .select(VEHICLE_CATALOG_SUPABASE_SELECT)
              .single();
          }
          if (upd.error) throw upd.error;
          if (!upd.data) throw new Error("Not found");
          invalidateCatalogExistenceCache(existingId);
          results.push({
            rowIndex,
            ok: true,
            id: existingId,
            action: "updated",
            item: catalogRowForApi(upd.data as Record<string, unknown>),
          });
        } else {
          const make = String(payload.make ?? "").trim();
          const model = String(payload.model ?? "").trim();
          const startNum = Number(payload.production_start_year);
          let endNum: number | null = null;
          if (
            payload.production_end_year !== undefined &&
            payload.production_end_year !== null &&
            payload.production_end_year !== ""
          ) {
            const e = Number(payload.production_end_year);
            if (!Number.isFinite(e) || e < 1900 || e > 2100) {
              throw new Error("production_end_year must be between 1900 and 2100, or omitted for ongoing");
            }
            endNum = e;
          }
          if (!make || !model || !Number.isFinite(startNum) || startNum < 1900 || startNum > 2100) {
            throw new Error("make, model, and production_start_year are required");
          }
          const spanErr = assertCatalogProductionSpan(startNum, endNum);
          if (spanErr) throw new Error(spanErr);
          const row = pickVehicleCatalogRow(
            {
              ...payload,
              make,
              model,
              production_start_year: startNum,
              production_end_year: endNum,
            },
            false,
          );
          stampCatalogProvenance(row, {
            userId: actorId,
            source: "csv_import",
            importBatchId,
            isCreate: true,
          });
          row.updated_at = new Date().toISOString();
          let ins: any = await supabase
            .from("vehicle_catalog")
            .insert(row)
            .select(VEHICLE_CATALOG_SUPABASE_SELECT)
            .single();
          if (ins.error && shouldStripVehicleCatalogInsertPayloadOnRetry(ins.error)) {
            const trimmed = stripVehicleCatalogOptionalMigrationColumns(row);
            trimmed.updated_at = row.updated_at;
            stampCatalogProvenance(trimmed, {
              userId: actorId,
              source: "csv_import",
              importBatchId,
              isCreate: true,
            });
            ins = await supabase
              .from("vehicle_catalog")
              .insert(trimmed)
              .select(VEHICLE_CATALOG_SUPABASE_SELECT)
              .single();
          }
          if (ins.error) throw ins.error;
          const id = String((ins.data as { id: string }).id);
          invalidateCatalogExistenceCache(id);
          results.push({
            rowIndex,
            ok: true,
            id,
            action: "created",
            item: catalogRowForApi((ins.data ?? {}) as Record<string, unknown>),
          });
        }
      } catch (err: unknown) {
        results.push({
          rowIndex,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return c.json({
      import_batch_id: importBatchId,
      results,
      created: results.filter((r) => r.ok && r.action === "created").length,
      updated: results.filter((r) => r.ok && r.action === "updated").length,
      failed: results.filter((r) => !r.ok).length,
    });
  } catch (e: any) {
    console.error("[vehicle-catalog] bulk:", e);
    return c.json({ error: e.message || "Failed to bulk upsert vehicle catalog" }, 500);
  }
});

// POST /admin/vehicle-catalog/undo-batch
route.post("/make-server-37f42386/admin/vehicle-catalog/undo-batch", requireAuth(), async (c: any) => {
  const denied = assertVehicleCatalogAccess(c);
  if (denied) return denied;
  const limited = await assertCatalogWriteRateLimit(c);
  if (limited) return limited;
  try {
    const body = (await c.req.json().catch(() => ({}))) as {
      import_batch_id?: string;
      force?: boolean;
      confirm?: string;
    };
    const importBatchId = String(body.import_batch_id ?? "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(importBatchId)) {
      return c.json({ error: "import_batch_id must be a UUID" }, 400);
    }
    if (body.force === true) {
      if (String(body.confirm ?? "").trim() !== VEHICLE_CATALOG_UNDO_BATCH_CONFIRM) {
        return c.json(
          { error: `Confirmation required: send JSON { "confirm": "${VEHICLE_CATALOG_UNDO_BATCH_CONFIRM}" }` },
          400,
        );
      }
    }
    const { data: batchRows, error: qErr } = await supabase
      .from("vehicle_catalog")
      .select("id")
      .eq("import_batch_id", importBatchId);
    if (qErr) throw qErr;
    const ids = (batchRows || []).map((r: { id: string }) => r.id);
    if (ids.length === 0) {
      return c.json({ deleted: 0, import_batch_id: importBatchId, dependencies: null });
    }
    const deps = await countCatalogDependenciesForIds(supabase, ids);
    if (dependenciesBlockDelete(deps) && body.force !== true) {
      return c.json(
        {
          error: "Batch has dependents; pass force:true to delete anyway",
          code: "CATALOG_HAS_DEPENDENTS",
          dependencies: deps,
          rowCount: ids.length,
        },
        409,
      );
    }
    const { error: dErr } = await supabase.from("vehicle_catalog").delete().eq("import_batch_id", importBatchId);
    if (dErr) throw dErr;
    invalidateCatalogExistenceCache();
    return c.json({ deleted: ids.length, import_batch_id: importBatchId, dependencies: deps });
  } catch (e: any) {
    console.error("[vehicle-catalog] undo-batch:", e);
    return c.json({ error: e.message || "Failed to undo import batch" }, 500);
  }
});

// POST /admin/vehicle-catalog
route.post("/make-server-37f42386/admin/vehicle-catalog", requireAuth(), async (c: any) => {
  const denied = assertVehicleCatalogAccess(c);
  if (denied) return denied;
  const limited = await assertCatalogWriteRateLimit(c);
  if (limited) return limited;
  try {
    const body = (await c.req.json()) as Record<string, unknown>;
    const make = String(body.make ?? "").trim();
    const model = String(body.model ?? "").trim();
    const startNum = Number(body.production_start_year);
    let endNum: number | null = null;
    if (body.production_end_year !== undefined && body.production_end_year !== null && body.production_end_year !== "") {
      const e = Number(body.production_end_year);
      if (!Number.isFinite(e) || e < 1900 || e > 2100) {
        return c.json({ error: "production_end_year must be between 1900 and 2100, or omitted for ongoing" }, 400);
      }
      endNum = e;
    }
    if (
      !make ||
      !model ||
      body.production_start_year === undefined ||
      body.production_start_year === null ||
      body.production_start_year === ""
    ) {
      return c.json({ error: "make, model, and production_start_year are required" }, 400);
    }
    if (!Number.isFinite(startNum) || startNum < 1900 || startNum > 2100) {
      return c.json({ error: "production_start_year must be between 1900 and 2100" }, 400);
    }
    const spanErr = assertCatalogProductionSpan(startNum, endNum);
    if (spanErr) return c.json({ error: spanErr }, 400);
    const psm = parseOptionalProductionMonth(body.production_start_month, "production_start_month");
    if (!psm.ok) return c.json({ error: psm.error }, 400);
    const pem = parseOptionalProductionMonth(body.production_end_month, "production_end_month");
    if (!pem.ok) return c.json({ error: pem.error }, 400);
    if (endNum == null && pem.value != null) {
      return c.json({ error: "production_end_month must be empty when production is ongoing" }, 400);
    }
    const eiErr = validateEngineType(body.engine_type);
    if (eiErr) return c.json({ error: eiErr }, 400);
    const row = pickVehicleCatalogRow(
      {
        ...body,
        make,
        model,
        production_start_year: startNum,
        production_end_year: endNum,
        production_start_month: psm.value,
        production_end_month: pem.value,
      },
      false,
    );
    if (row.engine_type !== undefined && row.engine_type !== null && row.engine_type !== "") {
      row.engine_type = String(row.engine_type).trim();
    }
    if (
      row.chassis_code != null &&
      row.chassis_code !== "" &&
      (row.generation_code == null || row.generation_code === "")
    ) {
      row.generation_code = row.chassis_code;
    }
    stampCatalogProvenance(row, {
      userId: vehicleCatalogActorId(c),
      source: "manual",
      isCreate: true,
    });
    row.updated_at = new Date().toISOString();
    /**
     * Prefer PostgREST insert first so **new columns** (fuel economy, etc.) are applied whenever the
     * DB + schema cache include them. An older `edge_insert_vehicle_catalog_row` RPC on the project may
     * omit newer columns but still return success — that made NOTIFY useless because RPC ran first.
     * Keep RPC as fallback when insert fails (legacy `year`, stale cache, missing RPC-handled paths).
     */
    let ins: any = await supabase.from("vehicle_catalog").insert(row).select(VEHICLE_CATALOG_SUPABASE_SELECT).single();

    /** Legacy DB: `year NOT NULL` only — map production_start_year → year. */
    if (ins.error && isLegacyVehicleCatalogYearNotNullError(ins.error)) {
      const legacyRow = insertRowForLegacyDb(stripVehicleCatalogOptionalMigrationColumns(row));
      legacyRow.updated_at = row.updated_at;
      ins = await supabase.from("vehicle_catalog").insert(legacyRow).select("*").single();
    } else if (ins.error && isPostgrestVehicleCatalogSchemaCacheError(ins.error)) {
      const rpc = await supabase.rpc("edge_insert_vehicle_catalog_row", { p: row });
      if (!rpc.error && rpc.data != null) {
        ins = { data: rpc.data as Record<string, unknown>, error: null };
      }
    } else if (ins.error) {
      const rpcIns = await supabase.rpc("edge_insert_vehicle_catalog_row", { p: row });
      if (!rpcIns.error && rpcIns.data != null) {
        ins = { data: rpcIns.data as Record<string, unknown>, error: null };
      }
    }
    if (!ins.error) {
      /* success */
    } else {
      /** Drop only columns the DB reports missing — never for PGRST schema-cache-only errors. */
      let candidate: Record<string, unknown> = { ...row };
      for (
        let i = 0;
        ins.error && shouldStripVehicleCatalogInsertPayloadOnRetry(ins.error) && i < 48;
        i++
      ) {
        const missing = parseMissingColumnFromVehicleCatalogDbError(ins.error);
        if (!missing || !(missing in candidate)) break;
        if (missing === "catalog_trim") mergeCatalogTrimIntoTrimSeriesInPlace(candidate);
        delete candidate[missing];
        candidate.updated_at = row.updated_at;
        ins = await supabase.from("vehicle_catalog").insert(candidate).select(VEHICLE_CATALOG_SUPABASE_SELECT).single();
      }
      if (ins.error && shouldStripVehicleCatalogInsertPayloadOnRetry(ins.error)) {
        const trimmed = stripVehicleCatalogOptionalMigrationColumns(candidate);
        trimmed.updated_at = row.updated_at;
        ins = await supabase.from("vehicle_catalog").insert(trimmed).select(VEHICLE_CATALOG_SUPABASE_SELECT).single();
      }
      if (ins.error && shouldStripVehicleCatalogInsertPayloadOnRetry(ins.error)) {
        const legacyRow = insertRowForLegacyDb(stripVehicleCatalogOptionalMigrationColumns(candidate));
        legacyRow.updated_at = row.updated_at;
        ins = await supabase.from("vehicle_catalog").insert(legacyRow).select("*").single();
      }
    }

    if (ins.error) throw ins.error;
    const item = catalogRowForApi((ins.data ?? {}) as Record<string, unknown>);
    const newId = String((ins.data as { id?: string })?.id ?? "");
    if (newId) invalidateCatalogExistenceCache(newId);
    return c.json({ item });
  } catch (e: any) {
    console.error("[vehicle-catalog] create:", e);
    return c.json({ error: e.message || "Failed to create vehicle catalog entry" }, 500);
  }
});

// PATCH /admin/vehicle-catalog/:id
route.patch("/make-server-37f42386/admin/vehicle-catalog/:id", requireAuth(), async (c: any) => {
  const denied = assertVehicleCatalogAccess(c);
  if (denied) return denied;
  const limited = await assertCatalogWriteRateLimit(c);
  if (limited) return limited;
  try {
    const id = c.req.param("id");
    const body = (await c.req.json()) as Record<string, unknown>;
    const expectedUpdatedAt =
      body.expected_updated_at ?? body.expectedUpdatedAt ?? body.updated_at ?? null;
    if (expectedUpdatedAt != null && expectedUpdatedAt !== "") {
      const { data: existing, error: exErr } = await supabase
        .from("vehicle_catalog")
        .select("updated_at")
        .eq("id", id)
        .maybeSingle();
      if (exErr) throw exErr;
      if (!existing) return c.json({ error: "Not found" }, 404);
      if (String(existing.updated_at) !== String(expectedUpdatedAt)) {
        return c.json(
          {
            error: "Record was updated elsewhere — refresh and try again",
            code: "STALE_WRITE",
          },
          409,
        );
      }
    }
    if (body.production_end_year === "") body.production_end_year = null;
    if (body.engine_type === "") body.engine_type = null;
    if (body.production_end_year === null || body.production_end_year === undefined) {
      if (body.production_end_month === "" || body.production_end_month === undefined) {
        body.production_end_month = null;
      }
    }
    const row = pickVehicleCatalogRow(body, true);
    if (row.production_start_year !== undefined) {
      const y = Number(row.production_start_year);
      if (!Number.isFinite(y) || y < 1900 || y > 2100) {
        return c.json({ error: "production_start_year must be between 1900 and 2100" }, 400);
      }
      row.production_start_year = y;
    }
    if (row.production_end_year !== undefined) {
      if (row.production_end_year === null) {
        row.production_end_year = null;
      } else {
        const e = parseCatalogProductionEndYear(row.production_end_year);
        if (e === null) {
          return c.json({ error: "production_end_year must be between 1900 and 2100, or empty for ongoing" }, 400);
        }
        row.production_end_year = e;
      }
    }
    const startForCheck =
      row.production_start_year !== undefined
        ? Number(row.production_start_year)
        : undefined;
    const endForCheck =
      row.production_end_year === undefined
        ? undefined
        : row.production_end_year === null
          ? null
          : Number(row.production_end_year);
    if (startForCheck !== undefined && endForCheck !== undefined) {
      const spanErr = assertCatalogProductionSpan(startForCheck, endForCheck);
      if (spanErr) return c.json({ error: spanErr }, 400);
    }
    if (row.production_start_month !== undefined && row.production_start_month !== null) {
      const p = parseOptionalProductionMonth(row.production_start_month, "production_start_month");
      if (!p.ok) return c.json({ error: p.error }, 400);
      row.production_start_month = p.value;
    }
    if (row.production_end_month !== undefined && row.production_end_month !== null) {
      const p = parseOptionalProductionMonth(row.production_end_month, "production_end_month");
      if (!p.ok) return c.json({ error: p.error }, 400);
      row.production_end_month = p.value;
    }
    if (endForCheck === null && row.production_end_month !== undefined && row.production_end_month !== null) {
      return c.json({ error: "production_end_month must be empty when production is ongoing" }, 400);
    }
    if (body.engine_type !== undefined) {
      const eiErr = validateEngineType(body.engine_type);
      if (eiErr) return c.json({ error: eiErr }, 400);
    }
    if (row.engine_type !== undefined && row.engine_type !== null && row.engine_type !== "") {
      row.engine_type = String(row.engine_type).trim();
    }
    if (row.engine_code !== undefined && row.engine_code !== null) {
      row.engine_code = String(row.engine_code).trim() || null;
    }
    if (row.make !== undefined) row.make = String(row.make).trim();
    if (row.model !== undefined) row.model = String(row.model).trim();
    stampCatalogProvenance(row, {
      userId: vehicleCatalogActorId(c),
      isCreate: false,
    });
    row.updated_at = new Date().toISOString();
    const keys = Object.keys(row).filter((k) => k !== "updated_at" && k !== "updated_by");
    if (keys.length === 0) {
      return c.json({ error: "No fields to update" }, 400);
    }
    let upd: any = await supabase.from("vehicle_catalog").update(row).eq("id", id).select(VEHICLE_CATALOG_SUPABASE_SELECT).single();
    let patchCandidate: Record<string, unknown> = { ...row };
    for (let i = 0; upd.error && shouldStripVehicleCatalogInsertPayloadOnRetry(upd.error) && i < 48; i++) {
      const missing = parseMissingColumnFromVehicleCatalogDbError(upd.error);
      if (!missing || !(missing in patchCandidate)) break;
      if (missing === "catalog_trim") mergeCatalogTrimIntoTrimSeriesInPlace(patchCandidate);
      delete patchCandidate[missing];
      patchCandidate.updated_at = row.updated_at;
      upd = await supabase.from("vehicle_catalog").update(patchCandidate).eq("id", id).select(VEHICLE_CATALOG_SUPABASE_SELECT).single();
    }
    if (upd.error && shouldStripVehicleCatalogInsertPayloadOnRetry(upd.error)) {
      const trimmed = stripVehicleCatalogOptionalMigrationColumns(patchCandidate);
      trimmed.updated_at = row.updated_at;
      upd = await supabase.from("vehicle_catalog").update(trimmed).eq("id", id).select(VEHICLE_CATALOG_SUPABASE_SELECT).single();
    }
    if (upd.error && shouldStripVehicleCatalogInsertPayloadOnRetry(upd.error)) {
      const legacyRow = patchRowForLegacyDb(stripVehicleCatalogOptionalMigrationColumns(patchCandidate));
      legacyRow.updated_at = row.updated_at;
      upd = await supabase.from("vehicle_catalog").update(legacyRow).eq("id", id).select("*").single();
    }
    if (upd.error) throw upd.error;
    if (!upd.data) return c.json({ error: "Not found" }, 404);
    invalidateCatalogExistenceCache(id);
    return c.json({ item: catalogRowForApi(upd.data as Record<string, unknown>) });
  } catch (e: any) {
    console.error("[vehicle-catalog] patch:", e);
    return c.json({ error: e.message || "Failed to update vehicle catalog entry" }, 500);
  }
});

// DELETE /admin/vehicle-catalog/:id
route.delete("/make-server-37f42386/admin/vehicle-catalog/:id", requireAuth(), async (c: any) => {
  const denied = assertVehicleCatalogAccess(c);
  if (denied) return denied;
  const limited = await assertCatalogWriteRateLimit(c);
  if (limited) return limited;
  try {
    const id = c.req.param("id");
    const force = c.req.query("force") === "true";
    const dependencies = await countCatalogDependencies(supabase, id);
    if (dependenciesBlockDelete(dependencies) && !force) {
      return c.json(
        {
          error: "Catalog row has dependents; pass force=true to delete anyway",
          code: "CATALOG_HAS_DEPENDENTS",
          dependencies,
        },
        409,
      );
    }
    const { data, error } = await supabase.from("vehicle_catalog").delete().eq("id", id).select("id");
    if (error) throw error;
    if (!data?.length) return c.json({ error: "Not found" }, 404);
    invalidateCatalogExistenceCache(id);
    return c.json({ success: true, dependencies });
  } catch (e: any) {
    console.error("[vehicle-catalog] delete:", e);
    return c.json({ error: e.message || "Failed to delete vehicle catalog entry" }, 500);
  }
});
}
