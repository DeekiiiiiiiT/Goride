import type { Context } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { requireAuth, requirePermission } from "./rbac_middleware.ts";
import { logAdminAction } from "./audit_log.ts";
import { detectBadUpload, detectBadUploadDetail, parsePartsImportCsv, sha256Hex } from "./parts_import_csv.ts";
import { resolveImportBatchVehicles } from "./parts_import_vehicle_resolve.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function specialTemplateLabel(kind: string) {
  if (kind === "vehicle_oe") return "Vehicle OE numbers";
  if (kind === "part_cross_ref") return "Part cross-references";
  if (kind === "platform_link") return "Shared components";
  if (kind === "car_specs") return "Car specs";
  return kind;
}

function specialTemplateIcon(kind: string) {
  if (kind === "vehicle_oe") return "pin";
  if (kind === "part_cross_ref") return "hub";
  if (kind === "platform_link") return "share";
  if (kind === "car_specs") return "straighten";
  return "upload_file";
}

function specialTemplateSort(kind: string) {
  if (kind === "vehicle_oe") return 1;
  if (kind === "part_cross_ref") return 2;
  if (kind === "platform_link") return 3;
  if (kind === "car_specs") return 4;
  return 99;
}

type RouteApp = {
  get: (path: string, ...handlers: unknown[]) => void;
  post: (path: string, ...handlers: unknown[]) => void;
  patch: (path: string, ...handlers: unknown[]) => void;
};

function fail(c: Context, e: unknown, status = 500) {
  return c.json({ error: errorMessage(e) }, status as 400 | 500);
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message.trim() || "Unknown error";
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") {
    return ((e as { message: string }).message || "Unknown error").trim();
  }
  if (typeof e === "string") return e;
  return String(e);
}

function actor(c: Context) {
  const u = c.get("rbacUser") as { id?: string; email?: string; name?: string } | undefined;
  return { id: u?.id ?? "", name: u?.name ?? u?.email ?? "Staff" };
}

async function setCheckStage(supabase: SupabaseClient, batchId: string, stage: string) {
  await supabase.from("part_import_batch").update({ check_stage: stage }).eq("id", batchId);
}

async function runImportCheck(supabase: SupabaseClient, batchId: string, who: { id: string; name: string }) {
  const { data: batch, error: bErr } = await supabase.from("part_import_batch").select("*").eq("id", batchId).single();
  if (bErr || !batch) throw new Error("Batch not found");

  await setCheckStage(supabase, batchId, "Reading file");
  const path = batch.storage_path as string;
  const { data: file, error: dErr } = await supabase.storage.from("parts-imports").download(path);
  if (dErr || !file) throw new Error("Upload the CSV first");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const bad = detectBadUpload(bytes);
  if (bad) {
    await supabase.from("part_import_batch").update({ status: "failed", failure_message: bad }).eq("id", batchId);
    throw new Error(bad);
  }
  const hash = await sha256Hex(bytes);
  const text = new TextDecoder().decode(bytes);
  const parsed = parsePartsImportCsv(text, String(batch.import_kind ?? "area"));
  if (parsed.headerErrors.length) {
    const msg = parsed.headerErrors.map((e) => e.message).join("; ");
    await supabase.from("part_import_batch").update({ status: "failed", failure_message: msg }).eq("id", batchId);
    throw new Error(msg);
  }
  if (parsed.rows.length > 5000) throw new Error("Max 5000 rows per file");

  await setCheckStage(supabase, batchId, "Staging rows");
  const staged = parsed.rows.map((row) => ({ line_no: row.line_no, raw: row.raw }));
  const { error: insErr } = await supabase.rpc("part_import_insert_staged_rows", {
    p_batch_id: batchId,
    p_rows: staged,
  });
  if (insErr) throw new Error(errorMessage(insErr));

  await setCheckStage(supabase, batchId, "Resolving vehicles");
  try {
    await resolveImportBatchVehicles(supabase, batchId, async (checked, total) => {
      await supabase.from("part_import_batch").update({ rows_checked: checked, rows_total: total }).eq("id", batchId);
    });
  } catch (e) {
    console.error("[parts-import] vehicle pre-resolve skipped:", errorMessage(e));
  }

  await setCheckStage(supabase, batchId, "Validating");
  const { data: val, error: vErr } = await supabase.rpc("part_import_validate", { p_batch_id: batchId });
  if (vErr) throw new Error(errorMessage(vErr));

  await supabase.from("part_import_batch").update({
    file_sha256: hash,
    file_bytes: bytes.length,
    check_stage: "Complete",
    checked_at: new Date().toISOString(),
  }).eq("id", batchId);

  await logAdminAction({
    actorId: who.id,
    actorName: who.name,
    action: "parts_import_checked",
    targetId: batchId,
    targetEmail: batch.code,
    details: JSON.stringify(val),
  });
}

function templateCsvBody(
  cols: Array<{ name: string }>,
  helpLines: string[] | null,
  exampleRows: Array<Record<string, string>> | null,
): string {
  const lines: string[] = [];
  for (const h of helpLines ?? []) {
    if (h.trim()) lines.push(`# ${h.replace(/^#\s*/, "")}`);
  }
  if (!lines.length) {
    lines.push("# Dominion parts import — fill rows below the header. Source link must show this part for this car.");
  }
  const names = cols.map((c) => c.name);
  lines.push(names.join(","));
  for (const ex of exampleRows ?? []) {
    if (ex.note === "EXAMPLE") {
      lines.push(names.map((n) => (ex[n] ?? "").replace(/,/g, " ")).join(","));
    }
  }
  return lines.join("\n");
}

export function registerPartsImportRoutes(route: RouteApp, supabase: SupabaseClient) {
  const guard = [requireAuth(), requirePermission("catalog.import")];

  route.get("/make-server-37f42386/admin/parts-import/special-templates", ...guard, async (c: Context) => {
    try {
      const { data, error } = await supabase.from("part_import_special_templates").select("*");
      if (error) throw error;
      const templates = (data ?? []).map((row) => ({
        importKind: row.import_kind,
        areaId: row.area_id,
        templateVersion: row.template_version ?? 1,
        hubName: row.hub_name,
        name: specialTemplateLabel(String(row.import_kind ?? "")),
        iconKey: specialTemplateIcon(String(row.import_kind ?? "")),
        sortOrder: specialTemplateSort(String(row.import_kind ?? "")),
      }));
      templates.sort((a, b) => a.sortOrder - b.sortOrder);
      return c.json({ templates });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get("/make-server-37f42386/admin/parts-import/areas", ...guard, async (c: Context) => {
    try {
      const { data, error } = await supabase
        .from("part_import_areas_summary")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      const areas = (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        opCode: row.op_code,
        iconKey: row.icon_key,
        sortOrder: row.sort_order,
        partsOnFile: row.parts_on_file ?? 0,
        fitsOnFile: row.fits_on_file ?? 0,
        partTypes: row.part_types ?? [],
        needsChecking: row.needs_checking ?? 0,
        lastImportAt: row.last_import_at ?? null,
        templateVersion: row.template_version ?? 1,
      }));
      return c.json({ areas });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get("/make-server-37f42386/admin/parts-import/areas/:areaId/template-schema", ...guard, async (c: Context) => {
    try {
      const areaId = c.req.param("areaId");
      const importKind = c.req.query("import_kind") || "area";
      let q = supabase
        .from("part_import_template")
        .select("columns")
        .eq("area_id", areaId)
        .eq("import_kind", importKind)
        .eq("active", true)
        .order("version", { ascending: false })
        .limit(1);
      const { data: tmpl, error } = await q.maybeSingle();
      if (error) throw error;
      const columns = (tmpl?.columns as Array<{ name: string; required?: boolean; type?: string }> | null) ?? [];
      return c.json({ columns });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get("/make-server-37f42386/admin/parts-import/template/:areaId.csv", ...guard, async (c: Context) => {
    try {
      const areaId = c.req.param("areaId");
      const importKind = c.req.query("import_kind") || "area";
      const { data: tmpl } = await supabase
        .from("part_import_template")
        .select("columns, help_lines, example_rows")
        .eq("area_id", areaId)
        .eq("import_kind", importKind)
        .eq("active", true)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      const cols = (tmpl?.columns as Array<{ name: string }> | null) ?? [
        { name: "vehicle" },
        { name: "part_type" },
        { name: "brand" },
        { name: "part_number" },
        { name: "match_type" },
        { name: "year_from" },
        { name: "year_to" },
        { name: "source_url" },
      ];
      const examples = (tmpl?.example_rows as Array<Record<string, string>> | null) ?? [];
      c.header("Content-Type", "text/csv; charset=utf-8");
      return c.body(templateCsvBody(cols, (tmpl?.help_lines as string[] | null) ?? null, examples));
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get("/make-server-37f42386/admin/parts-import/vehicles.csv", ...guard, async (c: Context) => {
    try {
      const { data: specKeyRows, error: specKeyErr } = await supabase
        .from("spec_key")
        .select("key")
        .order("key");
      if (specKeyErr) throw specKeyErr;
      const specKeys = (specKeyRows ?? []).map((row) => row.key).join(",");
      const { data, error } = await supabase
        .from("vehicle_catalog")
        .select("id, make, model, chassis_code, engine_code, production_start_year, production_end_year, version_name")
        .order("make")
        .order("model")
        .limit(5000);
      if (error) throw error;
      const header = "id,make,model,chassis,engine,year_from,year_to,version_name,spec_keys_reference";
      const rows = (data ?? []).map((v) =>
        [
          v.id,
          v.make,
          v.model,
          v.chassis_code ?? "",
          v.engine_code ?? "",
          v.production_start_year ?? "",
          v.production_end_year ?? "",
          v.version_name ?? "",
          "",
        ].join(",")
      );
      c.header("Content-Type", "text/csv; charset=utf-8");
      return c.body([`# Valid spec_key values for car_specs import: ${specKeys}`, header, ...rows].join("\n"));
    } catch (e) {
      return fail(c, e);
    }
  });

  route.post("/make-server-37f42386/admin/parts-import/batches", ...guard, async (c: Context) => {
    try {
      const body = await c.req.json().catch(() => ({})) as { area_id?: string; file_name?: string; import_kind?: string };
      const importKind = (body.import_kind ?? "area").trim() || "area";
      let areaId = body.area_id ?? "";
      if (importKind !== "area") {
        const { data: templateAreaId, error: areaErr } = await supabase.rpc("part_import_template_area_id", {
          p_import_kind: importKind,
        });
        if (areaErr) throw areaErr;
        areaId = String(templateAreaId ?? "");
      }
      if (!areaId || !UUID_RE.test(areaId)) return c.json({ error: "area_id required" }, 400);
      const { data: tmpl } = await supabase
        .from("part_import_template")
        .select("version")
        .eq("area_id", areaId)
        .eq("import_kind", importKind)
        .eq("active", true)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data: code, error: codeErr } = await supabase.rpc("part_import_next_code", { p_area_id: areaId });
      if (codeErr) throw codeErr;
      const batchCode = String(code ?? "");
      const { data: batch, error } = await supabase
        .from("part_import_batch")
        .insert({
          code: batchCode,
          area_id: areaId,
          import_kind: importKind,
          template_version: tmpl?.version ?? 2,
          file_name: body.file_name ?? null,
          status: "uploaded",
          uploaded_by: actor(c).id || null,
        })
        .select("*")
        .single();
      if (error) throw error;
      const path = `${batch.id}/source.csv`;
      await supabase.from("part_import_batch").update({ storage_path: path }).eq("id", batch.id);
      return c.json({ batch: { ...batch, storage_path: path }, path });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.post("/make-server-37f42386/admin/parts-import/batches/:id/source", ...guard, async (c: Context) => {
    try {
      const batchId = c.req.param("id");
      if (!UUID_RE.test(batchId)) return c.json({ error: "Invalid batch id" }, 400);
      const { data: batch, error: bErr } = await supabase
        .from("part_import_batch")
        .select("id, storage_path, status")
        .eq("id", batchId)
        .single();
      if (bErr || !batch) return c.json({ error: "Batch not found" }, 404);
      if (String(batch.status) === "imported" || String(batch.status) === "checking") {
        return c.json({ error: "This batch cannot accept a new file in its current state" }, 409);
      }

      const bytes = new Uint8Array(await c.req.arrayBuffer());
      if (!bytes.length) return c.json({ error: "Empty file" }, 400);
      if (bytes.length > 5 * 1024 * 1024) return c.json({ error: "Max 5 MB per file" }, 400);
      const bad = detectBadUploadDetail(bytes);
      if (bad) return c.json({ error: bad.message, hexPrefix: bad.hexPrefix, detectedType: bad.detectedType }, 422);

      const path = (batch.storage_path as string | null) || `${batchId}/source.csv`;
      const { error: upErr } = await supabase.storage.from("parts-imports").upload(path, bytes, {
        contentType: "text/csv; charset=utf-8",
        upsert: true,
      });
      if (upErr) throw upErr;

      await supabase
        .from("part_import_batch")
        .update({
          storage_path: path,
          status: "uploaded",
          failure_message: null,
          file_bytes: null,
          file_sha256: null,
        })
        .eq("id", batchId);

      return c.json({ ok: true, bytes: bytes.length, path });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.post("/make-server-37f42386/admin/parts-import/batches/:id/check", ...guard, async (c: Context) => {
    const batchId = c.req.param("id");
    const who = actor(c);
    try {
      const { data: batch, error: bErr } = await supabase.from("part_import_batch").select("id, code, area_id").eq("id", batchId).single();
      if (bErr || !batch) return c.json({ error: "Batch not found" }, 404);

      const { data: prior } = await supabase
        .from("part_import_batch")
        .select("id, code, promoted_at")
        .eq("area_id", batch.area_id)
        .eq("status", "imported")
        .order("promoted_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      await supabase.from("part_import_batch").update({
        status: "checking",
        rows_checked: 0,
        failure_message: null,
        check_stage: "Starting",
        check_started_at: new Date().toISOString(),
      }).eq("id", batchId);

      const work = (async () => {
        try {
          await runImportCheck(supabase, batchId, who);
        } catch (e) {
          const message = errorMessage(e);
          const { data: current } = await supabase.from("part_import_batch").select("status").eq("id", batchId).maybeSingle();
          if (current?.status !== "checked") {
            await supabase.from("part_import_batch").update({ status: "failed", failure_message: message }).eq("id", batchId);
          } else {
            console.error("[parts-import] post-check step failed:", message);
          }
        }
      })();

      const edge = (globalThis as { EdgeRuntime?: { waitUntil?: (x: Promise<unknown>) => void } }).EdgeRuntime;
      if (edge?.waitUntil) {
        edge.waitUntil(work);
      } else {
        void work;
      }
      return c.json({ status: "checking", batchId, priorImport: prior ?? null }, 202);
    } catch (e) {
      const message = errorMessage(e);
      await supabase.from("part_import_batch").update({
        status: "failed",
        failure_message: message,
      }).eq("id", batchId);
      return fail(c, e);
    }
  });

  route.patch("/make-server-37f42386/admin/parts-import/batches/:id/rows/:line", ...guard, async (c: Context) => {
    try {
      const batchId = c.req.param("id");
      const lineNo = Number(c.req.param("line"));
      if (!Number.isFinite(lineNo)) return c.json({ error: "Invalid line" }, 400);
      const body = await c.req.json().catch(() => ({})) as { column?: string; value?: string; vehicle?: string; accepted?: boolean };
      const { data: row, error: rErr } = await supabase
        .from("part_import_row")
        .select("raw")
        .eq("batch_id", batchId)
        .eq("line_no", lineNo)
        .maybeSingle();
      if (rErr || !row) return c.json({ error: "Row not found" }, 404);
      if (typeof body.accepted === "boolean") {
        await supabase.from("part_import_row").update({ accepted: body.accepted }).eq("batch_id", batchId).eq("line_no", lineNo);
        const { data: updated } = await supabase.from("part_import_row").select("*").eq("batch_id", batchId).eq("line_no", lineNo).single();
        return c.json({ row: updated });
      }
      const raw = { ...(row.raw as Record<string, string>) };
      if (body.vehicle != null) raw.vehicle = body.vehicle;
      if (body.column && body.value != null) raw[body.column] = body.value;
      await supabase.from("part_import_row").update({ raw }).eq("batch_id", batchId).eq("line_no", lineNo);
      const vehicleText = raw.vehicle ?? "";
      if (vehicleText) {
        const { resolveVehicleForImport } = await import("./parts_import_vehicle_resolve.ts");
        const resolved = await resolveVehicleForImport(supabase, vehicleText);
        await supabase
          .from("part_import_row")
          .update({
            vehicle_catalog_id: resolved.id,
            normalized: { vehicle_candidates: resolved.candidates },
          })
          .eq("batch_id", batchId)
          .eq("line_no", lineNo);
      }
      const { data: val, error: vErr } = await supabase.rpc("part_import_revalidate_line", {
        p_batch_id: batchId,
        p_line_no: lineNo,
      });
      if (vErr) throw vErr;
      const { data: updated } = await supabase.from("part_import_row").select("*").eq("batch_id", batchId).eq("line_no", lineNo).single();
      return c.json({ result: val, row: updated });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get("/make-server-37f42386/admin/parts-import/batches/:id/progress", ...guard, async (c: Context) => {
    try {
      const batchId = c.req.param("id");
      const { data: batch, error } = await supabase
        .from("part_import_batch")
        .select("id, status, check_stage, check_started_at, rows_total, rows_checked, checked_at, failure_message")
        .eq("id", batchId)
        .single();
      if (error) throw error;
      return c.json({ batch });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get("/make-server-37f42386/admin/parts-import/batches/:id/summary", ...guard, async (c: Context) => {
    try {
      const batchId = c.req.param("id");
      const { data, error } = await supabase.rpc("part_import_batch_summary", { p_batch_id: batchId });
      if (error) throw error;
      return c.json(data ?? {});
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get("/make-server-37f42386/admin/parts-import/batches/:id/rows/:line/inspect", ...guard, async (c: Context) => {
    try {
      const batchId = c.req.param("id");
      const lineNo = Number(c.req.param("line"));
      if (!Number.isFinite(lineNo)) return c.json({ error: "Invalid line" }, 400);
      const { data, error } = await supabase.rpc("part_import_row_inspect", {
        p_batch_id: batchId,
        p_line_no: lineNo,
      });
      if (error) throw error;
      return c.json(data ?? {});
    } catch (e) {
      return fail(c, e);
    }
  });

  route.patch("/make-server-37f42386/admin/parts-import/batches/:id/rows", ...guard, async (c: Context) => {
    try {
      const batchId = c.req.param("id");
      const body = await c.req.json().catch(() => ({})) as { accepted?: boolean; all?: boolean };
      if (typeof body.accepted !== "boolean") return c.json({ error: "accepted boolean required" }, 400);
      const { data, error } = await supabase.rpc("part_import_set_rows_accepted", {
        p_batch_id: batchId,
        p_accepted: body.accepted,
        p_only_importable: body.all !== false,
      });
      if (error) throw error;
      return c.json(data ?? { updated: 0 });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get("/make-server-37f42386/admin/parts-import/meta", ...guard, async (c: Context) => {
    try {
      const { data: engine } = await supabase.rpc("part_import_engine_version");
      const { data: integrity } = await supabase.rpc("part_import_ledger_integrity_ratio");
      return c.json({
        engineVersion: engine ?? null,
        integrityRatio: integrity ?? null,
        workspaceId: Deno.env.get("DOMINION_WORKSPACE_ID") ?? Deno.env.get("VITE_DOMINION_WORKSPACE_ID") ?? null,
      });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get("/make-server-37f42386/admin/parts-import/batches/:id", ...guard, async (c: Context) => {
    try {
      const batchId = c.req.param("id");
      const status = c.req.query("status") ?? "";
      const issue = c.req.query("issue") ?? "";
      const q = (c.req.query("q") ?? "").trim();
      const limit = Math.min(Number(c.req.query("limit") ?? "25"), 100);
      const offset = Number(c.req.query("offset") ?? "0");
      const { data: batch, error } = await supabase.from("part_import_batch").select("*").eq("id", batchId).single();
      if (error) throw error;
      const { data: listed, error: rErr } = await supabase.rpc("part_import_list_rows", {
        p_batch_id: batchId,
        p_status: status || null,
        p_issue_code: issue || null,
        p_q: q || null,
        p_limit: limit,
        p_offset: offset,
      });
      if (rErr) throw rErr;
      const payload = (listed ?? {}) as { total?: number; rows?: unknown[] };
      return c.json({ batch, rows: payload.rows ?? [], total: payload.total ?? 0 });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get("/make-server-37f42386/admin/parts-import/batches/:id/changes", ...guard, async (c: Context) => {
    try {
      const batchId = c.req.param("id");
      const { data, error } = await supabase.rpc("part_import_batch_changes", { p_batch_id: batchId });
      if (error) throw error;
      return c.json(data ?? { parts: [], fits: [], leftOut: [] });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get("/make-server-37f42386/admin/parts-import/batches/:id/undo-preflight", ...guard, async (c: Context) => {
    try {
      const batchId = c.req.param("id");
      const { data, error } = await supabase.rpc("part_import_undo_preflight", { p_batch_id: batchId });
      if (error) throw error;
      return c.json(data ?? { ok: false });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.post("/make-server-37f42386/admin/parts-import/refresh", ...guard, async (c: Context) => {
    try {
      const body = await c.req.json().catch(() => ({})) as { batch_id?: string };
      const who = actor(c);
      const { error: refreshErr } = await supabase.rpc("refresh_variant_parts_readiness");
      if (refreshErr) throw refreshErr;
      if (body.batch_id && UUID_RE.test(body.batch_id)) {
        await supabase.from("part_import_batch").update({ refresh_warning: null }).eq("id", body.batch_id);
      } else {
        await supabase.from("part_import_batch").update({ refresh_warning: null }).not("refresh_warning", "is", null);
      }
      await logAdminAction({
        actorId: who.id,
        actorName: who.name,
        action: "parts_import_refresh_readiness",
        targetId: body.batch_id ?? "all",
        targetEmail: who.name,
      });
      return c.json({ ok: true });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get("/make-server-37f42386/admin/parts-import/batches/:id/source.csv", ...guard, async (c: Context) => {
    try {
      const batchId = c.req.param("id");
      const { data: batch } = await supabase.from("part_import_batch").select("storage_path").eq("id", batchId).single();
      if (!batch?.storage_path) return c.json({ error: "No file" }, 404);
      const { data: file, error } = await supabase.storage.from("parts-imports").download(batch.storage_path as string);
      if (error || !file) return c.json({ error: "Download failed" }, 404);
      c.header("Content-Type", "text/csv; charset=utf-8");
      return c.body(await file.text());
    } catch (e) {
      return fail(c, e);
    }
  });

  route.post("/make-server-37f42386/admin/parts-import/batches/:id/promote", ...guard, async (c: Context) => {
    try {
      const batchId = c.req.param("id");
      const who = actor(c);
      const { data, error } = await supabase.rpc("part_import_promote", { p_batch_id: batchId, p_actor: who.id || null });
      if (error) {
        const msg = error.message ?? "";
        if (/Already importing|must be checked|Rollback/i.test(msg)) return c.json({ error: msg }, 409);
        throw error;
      }
      const { data: meta } = await supabase.rpc("part_import_finalize_promote_meta", { p_batch_id: batchId });
      const merged = { ...(data as Record<string, unknown>), ...(meta as Record<string, unknown> | null) };
      const { data: batch } = await supabase.from("part_import_batch").select("code").eq("id", batchId).single();
      await logAdminAction({
        actorId: who.id,
        actorName: who.name,
        action: "parts_import_promoted",
        targetId: batchId,
        targetEmail: batch?.code ?? batchId,
        details: JSON.stringify(merged),
      });
      return c.json({ result: merged });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.post("/make-server-37f42386/admin/parts-import/batches/:id/undo", ...guard, async (c: Context) => {
    try {
      const batchId = c.req.param("id");
      const who = actor(c);
      const { data, error } = await supabase.rpc("part_import_undo", { p_batch_id: batchId, p_actor: who.id || null });
      if (error) {
        const msg = error.message ?? "";
        if (/Rollback window|not found|Undo blocked|preflight/i.test(msg)) return c.json({ error: msg }, 409);
        throw error;
      }
      if (data && typeof data === "object" && (data as { ok?: boolean }).ok === false) {
        return c.json(data, 409);
      }
      await logAdminAction({
        actorId: who.id,
        actorName: who.name,
        action: "parts_import_undone",
        targetId: batchId,
        targetEmail: batchId,
      });
      return c.json({ result: data });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.post("/make-server-37f42386/admin/parts-import/batches/:id/cancel", ...guard, async (c: Context) => {
    try {
      const { error } = await supabase.rpc("part_import_cancel_check", { p_batch_id: c.req.param("id") });
      if (error) throw error;
      return c.json({ ok: true });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get("/make-server-37f42386/admin/parts-import/batches/:id/failed.csv", ...guard, async (c: Context) => {
    try {
      const batchId = c.req.param("id");
      const { data: rows } = await supabase.from("part_import_row").select("line_no, raw, issues").eq("batch_id", batchId).eq("status", "error");
      const lines = ["line_no,error_code,error_message"];
      for (const row of rows ?? []) {
        const issue = (row.issues as Array<{ code?: string; message?: string }>)?.[0];
        lines.push(`${row.line_no},${issue?.code ?? ""},${(issue?.message ?? "").replace(/,/g, " ")}`);
      }
      c.header("Content-Type", "text/csv");
      return c.body(lines.join("\n"));
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get("/make-server-37f42386/admin/parts-import/ledger", ...guard, async (c: Context) => {
    try {
      const area = c.req.query("area") ?? "";
      const limit = Math.min(Number(c.req.query("limit") ?? "50"), 200);
      const offset = Math.max(Number(c.req.query("offset") ?? "0"), 0);
      let q = supabase.from("part_import_ledger_by_area").select("*", { count: "exact" }).order("created_at", { ascending: false });
      if (area && UUID_RE.test(area)) q = q.eq("area_id", area);
      const { data, error, count } = await q.range(offset, offset + limit - 1);
      if (error) throw error;
      const { data: areas } = await supabase.from("part_import_areas_summary").select("id, name");
      const perArea: Record<string, number> = {};
      for (const a of areas ?? []) {
        const { count: n } = await supabase
          .from("part_import_ledger_by_area")
          .select("*", { count: "exact", head: true })
          .eq("area_id", a.id as string);
        perArea[a.id as string] = n ?? 0;
      }
      return c.json({ items: data ?? [], total: count ?? 0, perArea });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get("/make-server-37f42386/admin/parts-import/ledger.csv", ...guard, async (c: Context) => {
    try {
      const { data, error } = await supabase.from("part_import_ledger_by_area").select("*").order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      const items = data ?? [];
      if (!items.length) {
        c.header("Content-Type", "text/csv");
        return c.body("code,area_name,status,promoted_at,rows_total,can_undo\n");
      }
      const keys = ["code", "area_name", "status", "promoted_at", "rows_total", "rows_unchanged", "can_undo"];
      const lines = [keys.join(",")];
      for (const row of items) {
        lines.push(keys.map((k) => String((row as Record<string, unknown>)[k] ?? "").replace(/,/g, " ")).join(","));
      }
      c.header("Content-Type", "text/csv; charset=utf-8");
      return c.body(lines.join("\n"));
    } catch (e) {
      return fail(c, e);
    }
  });

  route.post("/make-server-37f42386/admin/parts-import/request-access", requireAuth(), async (c: Context) => {
    try {
      const who = actor(c);
      if (!who.id) return c.json({ error: "Sign in required" }, 401);
      const { error } = await supabase.from("admin_access_requests").insert({
        user_id: who.id,
        request_type: "Access",
        permission: "catalog.import",
        status: "pending",
      });
      if (error) throw error;
      return c.json({ ok: true });
    } catch (e) {
      return fail(c, e);
    }
  });
}
