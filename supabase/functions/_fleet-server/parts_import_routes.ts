import type { Context } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { requireAuth, requirePermission } from "./rbac_middleware.ts";
import { logAdminAction } from "./audit_log.ts";
import { detectBadUpload, parsePartsImportCsv, sha256Hex } from "./parts_import_csv.ts";
import { resolveImportBatchVehicles } from "./parts_import_vehicle_resolve.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteApp = {
  get: (path: string, ...handlers: unknown[]) => void;
  post: (path: string, ...handlers: unknown[]) => void;
  patch: (path: string, ...handlers: unknown[]) => void;
};

function fail(c: Context, e: unknown, status = 500) {
  const message = e instanceof Error ? e.message : String(e);
  return c.json({ error: message }, status as 400 | 500);
}

function actor(c: Context) {
  const u = c.get("rbacUser") as { id?: string; email?: string; name?: string } | undefined;
  return { id: u?.id ?? "", name: u?.name ?? u?.email ?? "Staff" };
}

async function runImportCheck(supabase: SupabaseClient, batchId: string, who: { id: string; name: string }) {
  const { data: batch, error: bErr } = await supabase.from("part_import_batch").select("*").eq("id", batchId).single();
  if (bErr || !batch) throw new Error("Batch not found");

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
  const parsed = parsePartsImportCsv(text);
  if (parsed.headerErrors.length) {
    const msg = parsed.headerErrors.map((e) => e.message).join("; ");
    await supabase.from("part_import_batch").update({ status: "failed", failure_message: msg }).eq("id", batchId);
    throw new Error(msg);
  }
  if (parsed.rows.length > 5000) throw new Error("Max 5000 rows per file");

  const staged = parsed.rows.map((row) => ({ line_no: row.line_no, raw: row.raw }));
  const { error: insErr } = await supabase.rpc("part_import_insert_staged_rows", {
    p_batch_id: batchId,
    p_rows: staged,
  });
  if (insErr) throw insErr;

  await resolveImportBatchVehicles(supabase, batchId, async (checked, total) => {
    await supabase.from("part_import_batch").update({ rows_checked: checked, rows_total: total }).eq("id", batchId);
  });

  const { data: val, error: vErr } = await supabase.rpc("part_import_validate", { p_batch_id: batchId });
  if (vErr) throw vErr;

  await supabase.from("part_import_batch").update({
    file_sha256: hash,
    file_bytes: bytes.length,
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

  route.get("/make-server-37f42386/admin/parts-import/areas", ...guard, async (c: Context) => {
    try {
      const { data: systems, error } = await supabase
        .from("maintenance_service_categories")
        .select("id, name, plain_name, op_code, icon_key, sort_order")
        .eq("kind", "system")
        .order("sort_order");
      if (error) throw error;
      const areas = [];
      for (const sys of systems ?? []) {
        const { data: childRows } = await supabase.from("maintenance_service_categories").select("id").eq("parent_id", sys.id);
        const childIds = (childRows ?? []).map((r) => r.id);
        let partsCount = 0;
        if (childIds.length) {
          const { count } = await supabase
            .from("part_master")
            .select("id", { count: "exact", head: true })
            .in("maintenance_component_id", childIds);
          partsCount = count ?? 0;
        }
        const { data: lastBatch } = await supabase
          .from("part_import_batch")
          .select("promoted_at, code")
          .eq("area_id", sys.id)
          .eq("status", "imported")
          .order("promoted_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const { count: reviewWaiting } = await supabase
          .from("part_import_batch")
          .select("id", { count: "exact", head: true })
          .eq("area_id", sys.id)
          .eq("status", "checked")
          .not("source_batch_id", "is", null);
        const { data: tmpl } = await supabase
          .from("part_import_template")
          .select("version")
          .eq("area_id", sys.id)
          .eq("active", true)
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle();
        areas.push({
          id: sys.id,
          name: sys.plain_name || sys.name,
          opCode: sys.op_code,
          iconKey: sys.icon_key,
          partsOnFile: partsCount ?? 0,
          lastImportAt: lastBatch?.promoted_at ?? null,
          templateVersion: tmpl?.version ?? 1,
          reviewRowsWaiting: reviewWaiting ?? 0,
        });
      }
      return c.json({ areas });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get("/make-server-37f42386/admin/parts-import/template/:areaId.csv", ...guard, async (c: Context) => {
    try {
      const areaId = c.req.param("areaId");
      const { data: tmpl } = await supabase
        .from("part_import_template")
        .select("columns, help_lines, example_rows")
        .eq("area_id", areaId)
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
      const { data, error } = await supabase
        .from("vehicle_catalog")
        .select("id, make, model, chassis_code, engine_code, production_start_year, production_end_year, version_name")
        .order("make")
        .order("model")
        .limit(5000);
      if (error) throw error;
      const header = "id,make,model,chassis,engine,year_from,year_to,version_name";
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
        ].join(",")
      );
      c.header("Content-Type", "text/csv; charset=utf-8");
      return c.body([header, ...rows].join("\n"));
    } catch (e) {
      return fail(c, e);
    }
  });

  route.post("/make-server-37f42386/admin/parts-import/batches", ...guard, async (c: Context) => {
    try {
      const body = await c.req.json().catch(() => ({})) as { area_id?: string; file_name?: string };
      if (!body.area_id || !UUID_RE.test(body.area_id)) return c.json({ error: "area_id required" }, 400);
      const { data: tmpl } = await supabase
        .from("part_import_template")
        .select("version")
        .eq("area_id", body.area_id)
        .eq("active", true)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data: code, error: codeErr } = await supabase.rpc("part_import_next_code", { p_area_id: body.area_id });
      if (codeErr) throw codeErr;
      const batchCode = String(code ?? "");
      const { data: batch, error } = await supabase
        .from("part_import_batch")
        .insert({
          code: batchCode,
          area_id: body.area_id,
          template_version: tmpl?.version ?? 2,
          file_name: body.file_name ?? null,
          status: "uploaded",
          uploaded_by: actor(c).id || null,
        })
        .select("*")
        .single();
      if (error) throw error;
      const path = `${batch.id}/source.csv`;
      const { data: signed, error: signErr } = await supabase.storage.from("parts-imports").createSignedUploadUrl(path);
      if (signErr) throw signErr;
      await supabase.from("part_import_batch").update({ storage_path: path }).eq("id", batch.id);
      return c.json({ batch, uploadUrl: signed.signedUrl, path });
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

      await supabase.from("part_import_batch").update({ status: "checking", rows_checked: 0, failure_message: null }).eq("id", batchId);

      const work = (async () => {
        try {
          await runImportCheck(supabase, batchId, who);
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          if (!/failed|Upload|PARSER|Max 5000|header/i.test(message)) {
            await supabase.from("part_import_batch").update({ status: "failed", failure_message: message }).eq("id", batchId);
          }
        }
      })();

      const edge = (globalThis as { EdgeRuntime?: { waitUntil?: (x: Promise<unknown>) => void } }).EdgeRuntime;
      if (edge?.waitUntil) {
        edge.waitUntil(work);
        return c.json({ status: "checking", batchId, priorImport: prior ?? null }, 202);
      }
      await work;
      const { data: updated } = await supabase.from("part_import_batch").select("*").eq("id", batchId).single();
      return c.json({ batch: updated, priorImport: prior ?? null });
    } catch (e) {
      await supabase.from("part_import_batch").update({
        status: "failed",
        failure_message: e instanceof Error ? e.message : String(e),
      }).eq("id", batchId);
      return fail(c, e);
    }
  });

  route.patch("/make-server-37f42386/admin/parts-import/batches/:id/rows/:line", ...guard, async (c: Context) => {
    try {
      const batchId = c.req.param("id");
      const lineNo = Number(c.req.param("line"));
      if (!Number.isFinite(lineNo)) return c.json({ error: "Invalid line" }, 400);
      const body = await c.req.json().catch(() => ({})) as { column?: string; value?: string; vehicle?: string };
      const { data: row, error: rErr } = await supabase
        .from("part_import_row")
        .select("raw")
        .eq("batch_id", batchId)
        .eq("line_no", lineNo)
        .maybeSingle();
      if (rErr || !row) return c.json({ error: "Row not found" }, 404);
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

  route.get("/make-server-37f42386/admin/parts-import/batches/:id", ...guard, async (c: Context) => {
    try {
      const batchId = c.req.param("id");
      const status = c.req.query("status") ?? "";
      const limit = Math.min(Number(c.req.query("limit") ?? "25"), 100);
      const offset = Number(c.req.query("offset") ?? "0");
      const { data: batch, error } = await supabase.from("part_import_batch").select("*").eq("id", batchId).single();
      if (error) throw error;
      let q = supabase.from("part_import_row").select("*", { count: "exact" }).eq("batch_id", batchId).order("line_no");
      if (status) q = q.eq("status", status);
      const { data: rows, count, error: rErr } = await q.range(offset, offset + limit - 1);
      if (rErr) throw rErr;
      return c.json({ batch, rows: rows ?? [], total: count ?? 0 });
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
      const { data: batch } = await supabase.from("part_import_batch").select("code").eq("id", batchId).single();
      await logAdminAction({
        actorId: who.id,
        actorName: who.name,
        action: "parts_import_promoted",
        targetId: batchId,
        targetEmail: batch?.code ?? batchId,
        details: JSON.stringify(data),
      });
      return c.json({ result: data });
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
      let q = supabase.from("part_import_ledger_by_area").select("*").order("created_at", { ascending: false }).limit(100);
      if (area && UUID_RE.test(area)) q = q.eq("area_id", area);
      const { data, error } = await q;
      if (error) throw error;
      return c.json({ items: data ?? [] });
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
