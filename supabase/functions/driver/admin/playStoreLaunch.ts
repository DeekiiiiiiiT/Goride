/**
 * Admin API for Play Store launch tracker (Roam Driver).
 */
import type { Context, Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { getDriverAdminDb } from "../../_shared/driverAdminDb.ts";

const WRITE_ROLES = new Set(["platform_owner", "superadmin", "driver_admin"]);

const VALID_STATUS = new Set(["todo", "done", "na"]);
const VALID_TRACK = new Set(["internal", "closed", "open", "production"]);

type AdminUser = { id: string; role: string };

type ChecklistState = Record<
  string,
  { status: string; notes?: string; completedAt?: string }
>;

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

function canWrite(role: string): boolean {
  return WRITE_ROLES.has(role);
}

function adminFromContext(c: Context): AdminUser {
  return c.get("adminUser") as AdminUser;
}

export function registerDriverPlayStoreLaunchRoutes(admin: Hono) {
  admin.get("/play-store", async (c) => {
    const resolved = await getDriverAdminDb();
    const { db, tables } = resolved;

    const { data: launchRow, error: launchErr } = await db
      .from(tables.play_store_launch)
      .select("checklist, data_safety_notes")
      .eq("id", 1)
      .maybeSingle();

    if (launchErr) {
      return c.json({ error: "load_failed", message: launchErr.message }, 500);
    }

    const { data: releases, error: relErr } = await db
      .from(tables.play_store_releases)
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
      releases: releases ?? [],
    });
  });

  admin.patch("/play-store/checklist", async (c) => {
    const adminUser = adminFromContext(c);
    if (!canWrite(adminUser.role)) {
      return c.json({ error: "forbidden", message: "driver_admin role required" }, 403);
    }

    const body = await c.req.json().catch(() => ({})) as {
      patches?: { itemId?: string; status?: string; notes?: string }[];
      data_safety_notes?: string;
    };

    const resolved = await getDriverAdminDb();
    const { db, tables } = resolved;

    const { data: existing } = await db
      .from(tables.play_store_launch)
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
      .from(tables.play_store_launch)
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

  admin.post("/play-store/releases", async (c) => {
    const adminUser = adminFromContext(c);
    if (!canWrite(adminUser.role)) {
      return c.json({ error: "forbidden", message: "driver_admin role required" }, 403);
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

    const resolved = await getDriverAdminDb();
    const { db, tables } = resolved;

    const { data, error } = await db
      .from(tables.play_store_releases)
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

  admin.delete("/play-store/releases/:id", async (c) => {
    const adminUser = adminFromContext(c);
    if (!canWrite(adminUser.role)) {
      return c.json({ error: "forbidden", message: "driver_admin role required" }, 403);
    }

    const id = c.req.param("id");
    const resolved = await getDriverAdminDb();
    const { db, tables } = resolved;

    const { error } = await db.from(tables.play_store_releases).delete().eq("id", id);
    if (error) {
      return c.json({ error: "delete_failed", message: error.message }, 500);
    }

    return c.json({ ok: true });
  });
}
