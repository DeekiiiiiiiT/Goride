/**
 * Shared Play Store launch admin routes (Dash customer + Courier).
 * Tables live in public.*; service client uses default public schema.
 */
import type { Context, Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  computeImportDiff,
  hasBlockingIssues,
  mergeImportWithTemplate,
  normalizeDataSafetyRows,
  parseDataSafetyCsv,
  serializeDataSafetyCsv,
  sha256Hex,
  validateDataSafetyState,
  type DataSafetyState,
} from "../../_shared/dataSafetyCsv.ts";

const VALID_STATUS = new Set(["todo", "done", "na"]);
const VALID_TRACK = new Set(["internal", "closed", "open", "production"]);

type AdminUser = { id: string; role: string; roles?: string[] };

type ChecklistState = Record<
  string,
  { status: string; notes?: string; completedAt?: string }
>;

export type DashPlayStoreRouteOpts = {
  /** URL prefix on the product admin Hono, e.g. "/play-store" or "/courier-play-store" */
  basePath: string;
  launchTable: string;
  releasesTable: string;
  writeRoles: ReadonlySet<string>;
  forbiddenMessage: string;
};

function publicDb() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

function normalizeChecklist(raw: unknown): ChecklistState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: ChecklistState = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!val || typeof val !== "object" || Array.isArray(val)) continue;
    const status = (val as { status?: string }).status ?? "todo";
    if (!VALID_STATUS.has(status)) continue;
    const notes = (val as { notes?: string }).notes;
    const completedAt = (val as { completedAt?: string }).completedAt;
    out[key] = {
      status,
      ...(typeof notes === "string" && notes.trim() ? { notes: notes.trim() } : {}),
      ...(typeof completedAt === "string" ? { completedAt } : {}),
    };
  }
  return out;
}

function adminFromContext(c: Context): AdminUser {
  return c.get("adminUser") as AdminUser;
}

function canWrite(admin: AdminUser, writeRoles: ReadonlySet<string>): boolean {
  if (writeRoles.has(admin.role)) return true;
  const roles = admin.roles ?? [];
  return roles.some((r) => writeRoles.has(r));
}

function stateFromDbRow(raw: unknown, templateVersion: string | null): DataSafetyState | null {
  const rows = normalizeDataSafetyRows(raw);
  if (!rows) return null;
  return { rows, ...(templateVersion ? { templateVersion } : {}) };
}

const launchDataSafetySelect =
  "checklist, data_safety_notes, data_safety_rows, data_safety_imported_at, data_safety_source_hash, data_safety_template_version, updated_at, updated_by";

export function registerDashPlayStoreLaunchRoutes(admin: Hono, opts: DashPlayStoreRouteOpts) {
  const base = opts.basePath.replace(/\/$/, "") || "/play-store";

  admin.get(base, async (c) => {
    const db = publicDb();
    const { data: launchRow, error: launchErr } = await db
      .from(opts.launchTable)
      .select(launchDataSafetySelect)
      .eq("id", 1)
      .maybeSingle();

    if (launchErr) {
      return c.json({ error: "load_failed", message: launchErr.message }, 500);
    }

    const { data: releases, error: relErr } = await db
      .from(opts.releasesTable)
      .select("id, version_name, version_code, track, uploaded_at, notes, created_at")
      .order("uploaded_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50);

    if (relErr) {
      return c.json({ error: "load_failed", message: relErr.message }, 500);
    }

    return c.json({
      checklist: normalizeChecklist(launchRow?.checklist ?? {}),
      data_safety_notes: launchRow?.data_safety_notes ?? null,
      data_safety_rows: launchRow?.data_safety_rows ?? null,
      data_safety_imported_at: launchRow?.data_safety_imported_at ?? null,
      data_safety_source_hash: launchRow?.data_safety_source_hash ?? null,
      data_safety_template_version: launchRow?.data_safety_template_version ?? null,
      updated_at: launchRow?.updated_at ?? null,
      updated_by: launchRow?.updated_by ?? null,
      releases: releases ?? [],
    });
  });

  admin.patch(`${base}/checklist`, async (c) => {
    const adminUser = adminFromContext(c);
    if (!canWrite(adminUser, opts.writeRoles)) {
      return c.json({ error: "forbidden", message: opts.forbiddenMessage }, 403);
    }

    const body = await c.req.json().catch(() => ({})) as {
      patches?: { itemId?: string; status?: string; notes?: string }[];
      data_safety_notes?: string;
    };

    const db = publicDb();
    const { data: existing } = await db
      .from(opts.launchTable)
      .select("checklist, data_safety_notes")
      .eq("id", 1)
      .maybeSingle();

    const checklist = normalizeChecklist(existing?.checklist ?? {});
    const patches = Array.isArray(body.patches) ? body.patches : [];

    for (const p of patches) {
      const itemId = (p.itemId ?? "").trim();
      if (!itemId) continue;
      const status = p.status ?? checklist[itemId]?.status ?? "todo";
      if (!VALID_STATUS.has(status)) {
        return c.json({ error: "invalid_status", itemId }, 400);
      }
      const entry: ChecklistState[string] = {
        status,
        ...(typeof p.notes === "string" ? { notes: p.notes.trim() } : {}),
      };
      if (status === "done" || status === "na") {
        entry.completedAt = new Date().toISOString();
      }
      checklist[itemId] = entry;
    }

    const updateRow: Record<string, unknown> = {
      checklist,
      updated_at: new Date().toISOString(),
      updated_by: adminUser.id,
    };

    if (typeof body.data_safety_notes === "string") {
      updateRow.data_safety_notes = body.data_safety_notes.trim() || null;
    }

    const { data, error } = await db
      .from(opts.launchTable)
      .update(updateRow)
      .eq("id", 1)
      .select("checklist, data_safety_notes")
      .single();

    if (error) {
      return c.json({ error: "update_failed", message: error.message }, 500);
    }

    return c.json({
      checklist: normalizeChecklist(data.checklist),
      data_safety_notes: data.data_safety_notes ?? null,
    });
  });

  admin.post(`${base}/releases`, async (c) => {
    const adminUser = adminFromContext(c);
    if (!canWrite(adminUser, opts.writeRoles)) {
      return c.json({ error: "forbidden", message: opts.forbiddenMessage }, 403);
    }

    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const version_name = String(body.version_name ?? "").trim();
    const version_code = Number(body.version_code);
    const track = String(body.track ?? "").trim();
    const uploaded_at = String(body.uploaded_at ?? "").trim();
    const notes = typeof body.notes === "string" ? body.notes.trim() : null;

    if (!version_name) return c.json({ error: "version_name_required" }, 400);
    if (!Number.isFinite(version_code) || version_code < 1) {
      return c.json({ error: "invalid_version_code" }, 400);
    }
    if (!VALID_TRACK.has(track)) return c.json({ error: "invalid_track" }, 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(uploaded_at)) {
      return c.json({ error: "invalid_uploaded_at" }, 400);
    }

    const db = publicDb();
    const { data, error } = await db
      .from(opts.releasesTable)
      .insert({
        version_name,
        version_code: Math.round(version_code),
        track,
        uploaded_at,
        notes: notes || null,
        created_by: adminUser.id,
      })
      .select("id, version_name, version_code, track, uploaded_at, notes, created_at")
      .single();

    if (error) {
      return c.json({ error: "insert_failed", message: error.message }, 500);
    }

    return c.json({ release: data });
  });

  admin.delete(`${base}/releases/:id`, async (c) => {
    const adminUser = adminFromContext(c);
    if (!canWrite(adminUser, opts.writeRoles)) {
      return c.json({ error: "forbidden", message: opts.forbiddenMessage }, 403);
    }

    const id = c.req.param("id");
    const db = publicDb();
    const { error } = await db.from(opts.releasesTable).delete().eq("id", id);
    if (error) {
      return c.json({ error: "delete_failed", message: error.message }, 500);
    }

    return c.json({ ok: true });
  });

  admin.put(`${base}/data-safety`, async (c) => {
    const adminUser = adminFromContext(c);
    if (!canWrite(adminUser, opts.writeRoles)) {
      return c.json({ error: "forbidden", message: opts.forbiddenMessage }, 403);
    }

    const body = await c.req.json().catch(() => ({})) as {
      rows?: unknown;
      templateVersion?: string;
      expectedUpdatedAt?: string;
    };

    const db = publicDb();
    const { data: existing } = await db
      .from(opts.launchTable)
      .select(launchDataSafetySelect)
      .eq("id", 1)
      .maybeSingle();

    if (
      typeof body.expectedUpdatedAt === "string" &&
      existing?.updated_at &&
      body.expectedUpdatedAt !== existing.updated_at
    ) {
      return c.json({ error: "conflict", message: "Data safety was updated elsewhere." }, 409);
    }

    const rows = normalizeDataSafetyRows({ rows: body.rows });
    if (!rows) {
      return c.json({ error: "invalid_rows", message: "rows array required" }, 400);
    }

    const state: DataSafetyState = {
      rows,
      ...(typeof body.templateVersion === "string" ? { templateVersion: body.templateVersion } : {}),
    };
    const issues = validateDataSafetyState(state);
    if (hasBlockingIssues(issues)) {
      return c.json({ error: "validation_failed", issues }, 400);
    }

    const { data, error } = await db
      .from(opts.launchTable)
      .update({
        data_safety_rows: { rows: state.rows, templateVersion: state.templateVersion ?? null },
        data_safety_template_version:
          state.templateVersion ?? existing?.data_safety_template_version ?? null,
        updated_at: new Date().toISOString(),
        updated_by: adminUser.id,
      })
      .eq("id", 1)
      .select(launchDataSafetySelect)
      .single();

    if (error) {
      return c.json({ error: "update_failed", message: error.message }, 500);
    }

    return c.json({
      data_safety_rows: data.data_safety_rows,
      data_safety_template_version: data.data_safety_template_version,
      updated_at: data.updated_at,
      updated_by: data.updated_by,
      issues,
    });
  });

  admin.post(`${base}/data-safety/import`, async (c) => {
    const adminUser = adminFromContext(c);
    if (!canWrite(adminUser, opts.writeRoles)) {
      return c.json({ error: "forbidden", message: opts.forbiddenMessage }, 403);
    }

    const contentType = c.req.header("content-type") ?? "";
    let csvText = "";
    let dryRun = false;
    let templateVersion: string | undefined;

    if (contentType.includes("text/csv")) {
      csvText = await c.req.text();
    } else {
      const body = await c.req.json().catch(() => ({})) as {
        csv?: string;
        dryRun?: boolean;
        templateVersion?: string;
      };
      csvText = String(body.csv ?? "");
      dryRun = body.dryRun === true;
      templateVersion = typeof body.templateVersion === "string" ? body.templateVersion : undefined;
    }

    if (!csvText.trim()) {
      return c.json({ error: "csv_required" }, 400);
    }

    let imported: DataSafetyState;
    try {
      imported = parseDataSafetyCsv(csvText);
    } catch (e) {
      return c.json({
        error: "parse_failed",
        message: e instanceof Error ? e.message : "Invalid CSV",
      }, 400);
    }

    if (templateVersion) imported.templateVersion = templateVersion;

    const db = publicDb();
    const { data: existing } = await db
      .from(opts.launchTable)
      .select(launchDataSafetySelect)
      .eq("id", 1)
      .maybeSingle();

    const previous = stateFromDbRow(
      existing?.data_safety_rows,
      existing?.data_safety_template_version ?? null,
    );
    const template = previous ?? imported;
    const merged = mergeImportWithTemplate(template, imported);
    const issues = validateDataSafetyState(merged);
    const diff = computeImportDiff(previous, merged);

    if (dryRun) {
      return c.json({ diff, issues, rowCount: merged.rows.length });
    }

    if (hasBlockingIssues(issues)) {
      return c.json({ error: "validation_failed", issues, diff }, 400);
    }

    const sourceHash = await sha256Hex(csvText);

    const { data, error } = await db
      .from(opts.launchTable)
      .update({
        data_safety_rows: { rows: merged.rows, templateVersion: merged.templateVersion ?? null },
        data_safety_imported_at: new Date().toISOString(),
        data_safety_source_hash: sourceHash,
        data_safety_template_version:
          merged.templateVersion ?? existing?.data_safety_template_version ?? null,
        updated_at: new Date().toISOString(),
        updated_by: adminUser.id,
      })
      .eq("id", 1)
      .select(launchDataSafetySelect)
      .single();

    if (error) {
      return c.json({ error: "import_failed", message: error.message }, 500);
    }

    return c.json({
      data_safety_rows: data.data_safety_rows,
      data_safety_imported_at: data.data_safety_imported_at,
      data_safety_source_hash: data.data_safety_source_hash,
      data_safety_template_version: data.data_safety_template_version,
      updated_at: data.updated_at,
      diff,
      issues,
    });
  });

  admin.get(`${base}/data-safety/export`, async (c) => {
    const db = publicDb();
    const { data: existing, error } = await db
      .from(opts.launchTable)
      .select("data_safety_rows")
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      return c.json({ error: "load_failed", message: error.message }, 500);
    }

    const state = stateFromDbRow(existing?.data_safety_rows, null);
    if (!state) {
      return c.json({ error: "no_data", message: "Import data safety CSV first." }, 404);
    }

    const csv = serializeDataSafetyCsv(state);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="data_safety_export.csv"',
      },
    });
  });
}
