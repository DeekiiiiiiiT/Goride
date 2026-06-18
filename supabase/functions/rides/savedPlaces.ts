import type { Context, Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { deniesPassengerSurface, jsonEdgeForbidden } from "../_shared/authEdge.ts";
import type { RidesContactsDb } from "../_shared/ridesContactsDb.ts";

const VALID_ICONS = new Set([
  "home", "work", "saved", "star", "gym", "school", "coffee", "hospital", "location",
]);

const SLOT_ICONS = new Set(["home", "work"]);

type SavedPlacesDeps = {
  getContactsDb: () => Promise<RidesContactsDb>;
  requireUser: (authHeader: string | undefined) => Promise<
    { user: { id: string } } | { error: string; status: 401 }
  >;
};

function parseIcon(raw: unknown): string | null {
  if (typeof raw !== "string") return "saved";
  const icon = raw.trim().toLowerCase();
  return VALID_ICONS.has(icon) ? icon : null;
}

async function clearSlotIcon(
  db: RidesContactsDb["db"],
  table: string,
  ownerId: string,
  icon: string,
  exceptId?: string,
): Promise<void> {
  let query = db.from(table).delete().eq("owner_user_id", ownerId).eq("icon", icon);
  if (exceptId) query = query.neq("id", exceptId);
  await query;
}

export function registerSavedPlacesRoutes(app: Hono, deps: SavedPlacesDeps) {
  const requirePassenger = async (c: Context) => {
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return { error: auth, response: c.json({ error: auth.error }, auth.status) };
    if (deniesPassengerSurface(auth.user)) {
      return { error: null, response: jsonEdgeForbidden(c, "forbidden_role") };
    }
    return { user: auth.user, response: null };
  };

  app.get("/v1/saved-places", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    const { db, tables: t } = await deps.getContactsDb();
    const { data, error } = await db.from(t.passenger_saved_places).select("*")
      .eq("owner_user_id", gate.user!.id)
      .order("created_at", { ascending: true });
    if (error) return c.json({ error: "fetch_failed", message: error.message }, 500);
    return c.json({ places: data ?? [] });
  });

  app.post("/v1/saved-places", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    const body = await c.req.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const address = typeof body.address === "string" ? body.address.trim() : "";
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const icon = parseIcon(body.icon);
    if (!name || !address || Number.isNaN(lat) || Number.isNaN(lng) || !icon) {
      return c.json({ error: "invalid_body" }, 400);
    }

    const { db, tables: t } = await deps.getContactsDb();
    const ownerId = gate.user!.id;
    const now = new Date().toISOString();

    if (SLOT_ICONS.has(icon)) {
      await clearSlotIcon(db, t.passenger_saved_places, ownerId, icon);
    }

    const { data, error } = await db.from(t.passenger_saved_places).insert({
      owner_user_id: ownerId,
      name,
      address,
      lat,
      lng,
      icon,
      updated_at: now,
    }).select("*").single();

    if (error) {
      if (error.code === "23505") return c.json({ error: "slot_taken" }, 409);
      return c.json({ error: "insert_failed", message: error.message }, 500);
    }
    return c.json({ place: data });
  });

  app.patch("/v1/saved-places/:id", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    const body = await c.req.json().catch(() => ({}));
    const placeId = c.req.param("id");
    const { db, tables: t } = await deps.getContactsDb();
    const ownerId = gate.user!.id;

    const { data: existing } = await db.from(t.passenger_saved_places).select("*")
      .eq("id", placeId)
      .eq("owner_user_id", ownerId)
      .maybeSingle();
    if (!existing) return c.json({ error: "not_found" }, 404);

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.name === "string") patch.name = body.name.trim();
    if (typeof body.address === "string") patch.address = body.address.trim();
    if (body.lat != null) patch.lat = Number(body.lat);
    if (body.lng != null) patch.lng = Number(body.lng);
    if (body.icon != null) {
      const icon = parseIcon(body.icon);
      if (!icon) return c.json({ error: "invalid_icon" }, 400);
      if (SLOT_ICONS.has(icon) && icon !== existing.icon) {
        await clearSlotIcon(db, t.passenger_saved_places, ownerId, icon, placeId);
      }
      patch.icon = icon;
    }

    if (typeof patch.name === "string" && !patch.name) return c.json({ error: "invalid_body" }, 400);
    if (typeof patch.address === "string" && !patch.address) return c.json({ error: "invalid_body" }, 400);

    const { data, error } = await db.from(t.passenger_saved_places).update(patch)
      .eq("id", placeId)
      .eq("owner_user_id", ownerId)
      .select("*")
      .single();
    if (error || !data) return c.json({ error: "update_failed", message: error?.message }, 500);
    return c.json({ place: data });
  });

  app.delete("/v1/saved-places/:id", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    const placeId = c.req.param("id");
    const { db, tables: t } = await deps.getContactsDb();
    const { data: existing } = await db.from(t.passenger_saved_places).select("id")
      .eq("id", placeId)
      .eq("owner_user_id", gate.user!.id)
      .maybeSingle();
    if (!existing) return c.json({ error: "not_found" }, 404);
    const { error } = await db.from(t.passenger_saved_places).delete()
      .eq("id", placeId)
      .eq("owner_user_id", gate.user!.id);
    if (error) return c.json({ error: "delete_failed", message: error.message }, 500);
    return c.json({ ok: true });
  });
}
