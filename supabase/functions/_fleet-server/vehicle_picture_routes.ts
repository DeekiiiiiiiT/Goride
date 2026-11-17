import type { Hono } from "npm:hono";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { authorizeCronOrServiceRole } from "../_shared/authorizeCronOrServiceRole.ts";
import { VEHICLE_COLORS } from "../_shared/vehiclePictures/color.ts";
import type { VehicleColor } from "../_shared/vehiclePictures/color.ts";
import { R2Client, r2ConfigFromEnv } from "../_shared/objectStorage/r2Client.ts";
import {
  createProductionPictureLookupDeps,
  readPictureForVehicle,
  runPictureLookup,
} from "./vehicle_picture_lookup.ts";
import { createProductionImagenCaller } from "./vehicle_picture_imagen.ts";
import { runVehiclePictureWorker } from "./vehicle_picture_worker.ts";
import { runVehiclePictureFill } from "./vehicle_picture_fill.ts";
import { loadVehiclePicturesSettings } from "./vehicle_pictures_settings.ts";
import { createVehiclePictureDb } from "./vehicle_picture_db.ts";
import { requireAuth, type RbacUser } from "./rbac_middleware.ts";

function pickOrgId(c: { get: (k: string) => unknown }): string {
  const u = c.get("rbacUser") as RbacUser | undefined;
  return String(u?.organizationId ?? "").trim();
}

export function registerVehiclePictureRoutes(app: Hono, supabase: SupabaseClient): void {
  const lookupDeps = () => createProductionPictureLookupDeps(supabase);
  let r2: R2Client | null = null;
  try {
    r2 = new R2Client(r2ConfigFromEnv());
  } catch {
    r2 = null;
  }

  app.post("/make-server-37f42386/internal/vehicle-pictures/run", async (c) => {
    const auth = await authorizeCronOrServiceRole(c.req.raw);
    if (!auth.ok) return c.json({ error: auth.error }, auth.status);
    const result = await runVehiclePictureWorker({
      now: () => new Date(),
      loadSettings: loadVehiclePicturesSettings,
      db: createVehiclePictureDb(supabase),
      imagen: createProductionImagenCaller(() => Deno.env.get("GEMINI_API_KEY")),
      r2,
      randomJitterSec: () => Math.floor(Math.random() * 31),
    });
    return c.json(result);
  });

  app.post("/make-server-37f42386/internal/vehicle-pictures/fill", async (c) => {
    const auth = await authorizeCronOrServiceRole(c.req.raw);
    if (!auth.ok) return c.json({ error: auth.error }, auth.status);
    let afterId: string | null = null;
    try {
      const body = await c.req.json().catch(() => ({})) as { afterId?: string };
      afterId = body.afterId?.trim() || c.req.query("after_id")?.trim() || null;
    } catch {
      afterId = c.req.query("after_id")?.trim() || null;
    }
    const result = await runVehiclePictureFill(
      {
        now: () => new Date(),
        lookupDeps: lookupDeps(),
        db: createVehiclePictureDb(supabase),
        supabase,
      },
      { afterId },
    );
    return c.json(result);
  });

  app.get(
    "/make-server-37f42386/vehicles/:id/picture",
    requireAuth({ requireOrg: true }),
    async (c) => {
      const orgId = pickOrgId(c);
      if (!orgId) return c.json({ error: "Unauthorized" }, 401);
      const vehicleId = c.req.param("id")?.trim() ?? "";
      const { data, error } = await supabase
        .from("fleet_vehicles")
        .select("id, organization_id, vehicle_catalog_id, color_standard, picture_id")
        .eq("id", vehicleId)
        .maybeSingle();
      if (error) throw error;
      if (!data || data.organization_id !== orgId) {
        return c.json({ error: "Not found" }, 404);
      }
      const deps = lookupDeps();
      const picture = await readPictureForVehicle(deps, {
        vehicleId,
        organizationId: orgId,
        vehicleCatalogId: data.vehicle_catalog_id,
        colorStandard: data.color_standard,
        pictureId: data.picture_id,
      });
      c.header("Cache-Control", "no-store");
      return c.json({ picture });
    },
  );

  /**
   * Latest fitness and registration document checks for one vehicle (Documents tab, audit §5.1).
   * Dates and who checked when — never the file (none is kept) and never fields_json.
   */
  app.get(
    "/make-server-37f42386/vehicles/:id/document-checks",
    requireAuth({ requireOrg: true }),
    async (c) => {
      const orgId = pickOrgId(c);
      if (!orgId) return c.json({ error: "Unauthorized" }, 401);
      const vehicleId = c.req.param("id")?.trim() ?? "";
      const { data: vehicle, error: vErr } = await supabase
        .from("fleet_vehicles")
        .select("id, organization_id")
        .eq("id", vehicleId)
        .maybeSingle();
      if (vErr) throw vErr;
      if (!vehicle || vehicle.organization_id !== orgId) return c.json({ error: "Not found" }, 404);
      const checks = await loadLatestDocumentChecks(supabase, vehicleId, orgId);
      c.header("Cache-Control", "no-store");
      return c.json({ checks });
    },
  );

  app.post(
    "/make-server-37f42386/vehicles/:id/color",
    requireAuth({ requireOrg: true }),
    async (c) => {
      const orgId = pickOrgId(c);
      if (!orgId) return c.json({ error: "Unauthorized" }, 401);
      const vehicleId = c.req.param("id")?.trim() ?? "";
      const body = (await c.req.json()) as { colorStandard?: string };
      const colorStandard = String(body.colorStandard ?? "").trim();
      if (!(VEHICLE_COLORS as readonly string[]).includes(colorStandard)) {
        return c.json({ error: "Invalid colorStandard" }, 400);
      }
      const { data, error } = await supabase
        .from("fleet_vehicles")
        .select("id, organization_id, vehicle_catalog_id, color_standard, picture_id")
        .eq("id", vehicleId)
        .maybeSingle();
      if (error) throw error;
      if (!data || data.organization_id !== orgId) {
        return c.json({ error: "Not found" }, 404);
      }
      await supabase
        .from("fleet_vehicles")
        .update({ color_standard: colorStandard, picture_id: null })
        .eq("id", vehicleId);
      const picture = await runPictureLookup(lookupDeps(), {
        vehicleId,
        organizationId: orgId,
        vehicleCatalogId: data.vehicle_catalog_id,
        colorStandard,
      });
      return c.json({ picture });
    },
  );
}
export type DocumentCheckSummary = {
  docType: "fitness" | "registration";
  issueDate: string | null;
  expiryDate: string | null;
  readAt: string;
  readByName: string | null;
};

/** Newest check per document type, with a display name for who checked it (no file, no fields). */
export async function loadLatestDocumentChecks(
  supabase: SupabaseClient,
  vehicleId: string,
  orgId: string,
): Promise<DocumentCheckSummary[]> {
  const { data, error } = await supabase
    .from("fleet_vehicle_document_check")
    .select("doc_type, issue_date, expiry_date, read_at, read_by")
    .eq("vehicle_id", vehicleId)
    .eq("organization_id", orgId)
    .order("read_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  const latest = new Map<string, { doc_type: string; issue_date: string | null; expiry_date: string | null; read_at: string; read_by: string | null }>();
  for (const row of data ?? []) {
    if (!latest.has(row.doc_type)) latest.set(row.doc_type, row);
  }
  const names = new Map<string, string | null>();
  for (const row of latest.values()) {
    if (!row.read_by || names.has(row.read_by)) continue;
    try {
      const { data: u } = await supabase.auth.admin.getUserById(row.read_by);
      const meta = (u?.user?.user_metadata ?? {}) as Record<string, unknown>;
      const name = String(meta.full_name ?? meta.name ?? "").trim();
      names.set(row.read_by, name || null);
    } catch {
      names.set(row.read_by, null);
    }
  }
  return (["fitness", "registration"] as const)
    .filter((t) => latest.has(t))
    .map((t) => {
      const row = latest.get(t)!;
      return {
        docType: t,
        issueDate: row.issue_date,
        expiryDate: row.expiry_date,
        readAt: row.read_at,
        readByName: row.read_by ? names.get(row.read_by) ?? null : null,
      };
    });
}
