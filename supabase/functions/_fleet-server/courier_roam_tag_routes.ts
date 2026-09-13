/**
 * Courier-only Roam Tags — ensure / me / claim / lookup.
 * Separate namespace from passenger rides.roam_passenger_tags.
 */
import type { Hono } from "npm:hono";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { RbacUser } from "./rbac_middleware.ts";

function rbacFromContext(c: { get: (k: string) => unknown }): RbacUser | null {
  const user = c.get("rbacUser") as RbacUser | undefined;
  return user?.userId ? user : null;
}

function generateInternalCourierTagId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const arr = new Uint8Array(10);
  crypto.getRandomValues(arr);
  const body = Array.from(arr, (b) => chars[b % chars.length]).join("");
  return `CT-${body}`;
}

function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@+/, "");
}

const RESERVED = new Set([
  "admin", "support", "help", "roam", "rush", "courier", "official", "system", "null", "undefined",
]);

function validateTag(raw: string): string | null {
  const name = normalizeTag(raw);
  if (name.length < 3 || name.length > 24) return "tag_length";
  if (!/^[a-z0-9_]+$/.test(name)) return "tag_format";
  if (RESERVED.has(name)) return "tag_reserved";
  if (/^(rt|ct)[-_]?[a-z0-9]+$/i.test(name)) return "tag_reserved";
  return null;
}

function toPublicDto(row: Record<string, unknown>) {
  const custom = row.custom_tag_name as string | null;
  return {
    custom_tag_name: custom,
    has_custom_tag: Boolean(custom?.trim()),
  };
}

async function insertInternalTag(
  supabase: SupabaseClient,
  userId: string,
): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const internalTagId = generateInternalCourierTagId();
    const { data, error } = await supabase.schema("delivery").from("courier_roam_tags").insert({
      user_id: userId,
      internal_tag_id: internalTagId,
      updated_at: new Date().toISOString(),
    }).select("user_id, custom_tag_name, created_at, updated_at").single();

    if (!error && data) return data as Record<string, unknown>;

    const code = error?.code ?? "";
    const msg = (error?.message ?? "").toLowerCase();
    if (code === "23505" && msg.includes("internal")) continue;
    if (code === "23505") {
      const { data: existing } = await supabase.schema("delivery").from("courier_roam_tags")
        .select("user_id, custom_tag_name, created_at, updated_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (existing) return existing as Record<string, unknown>;
    }
    throw new Error(error?.message ?? "insert_failed");
  }
  throw new Error("could_not_generate_internal_tag");
}

async function ensureCourierTag(
  supabase: SupabaseClient,
  userId: string,
): Promise<Record<string, unknown>> {
  const { data: existing } = await supabase.schema("delivery").from("courier_roam_tags")
    .select("user_id, custom_tag_name, created_at, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) return existing as Record<string, unknown>;
  return insertInternalTag(supabase, userId);
}

export function registerCourierRoamTagRoutes(
  app: Hono,
  deps: {
    supabase: SupabaseClient;
    requireAuth: () => unknown;
  },
): void {
  const base = "/make-server-37f42386/courier-roam-tag";

  app.post(`${base}/ensure`, deps.requireAuth() as never, async (c) => {
    try {
      const rbac = rbacFromContext(c);
      if (!rbac) return c.json({ error: "Unauthorized" }, 401);
      const row = await ensureCourierTag(deps.supabase, rbac.userId);
      return c.json(toPublicDto(row));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  app.get(`${base}/me`, deps.requireAuth() as never, async (c) => {
    try {
      const rbac = rbacFromContext(c);
      if (!rbac) return c.json({ error: "Unauthorized" }, 401);
      const row = await ensureCourierTag(deps.supabase, rbac.userId);
      return c.json(toPublicDto(row));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  app.patch(`${base}/me`, deps.requireAuth() as never, async (c) => {
    try {
      const rbac = rbacFromContext(c);
      if (!rbac) return c.json({ error: "Unauthorized" }, 401);

      const body = await c.req.json().catch(() => ({}));
      const raw = typeof body.custom_tag_name === "string" ? body.custom_tag_name : "";
      const validationError = validateTag(raw);
      if (validationError) {
        return c.json({ error: validationError, message: "Invalid Roam Tag" }, 400);
      }
      const normalized = normalizeTag(raw);

      await ensureCourierTag(deps.supabase, rbac.userId);

      const { data: current } = await deps.supabase.schema("delivery").from("courier_roam_tags")
        .select("custom_tag_name")
        .eq("user_id", rbac.userId)
        .maybeSingle();

      if (current?.custom_tag_name) {
        if (current.custom_tag_name === normalized) {
          return c.json(toPublicDto({ custom_tag_name: normalized }));
        }
        return c.json({ error: "tag_locked", message: "Roam Tag cannot be changed once set" }, 409);
      }

      const { data: taken } = await deps.supabase.schema("delivery").from("courier_roam_tags")
        .select("user_id")
        .eq("custom_tag_name", normalized)
        .maybeSingle();
      if (taken && taken.user_id !== rbac.userId) {
        return c.json({ error: "tag_taken", message: "That Roam Tag is already taken" }, 409);
      }

      const { data: updated, error } = await deps.supabase.schema("delivery").from("courier_roam_tags")
        .update({
          custom_tag_name: normalized,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", rbac.userId)
        .select("user_id, custom_tag_name, created_at, updated_at")
        .single();

      if (error) {
        if (error.code === "23505") {
          return c.json({ error: "tag_taken", message: "That Roam Tag is already taken" }, 409);
        }
        throw error;
      }
      return c.json(toPublicDto(updated as Record<string, unknown>));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  /** Fleet owner lookup — resolves courier @tag for invite targeting. */
  app.get(`${base}/lookup/:name`, deps.requireAuth() as never, async (c) => {
    try {
      const rbac = rbacFromContext(c);
      if (!rbac) return c.json({ error: "Unauthorized" }, 401);

      const normalized = normalizeTag(c.req.param("name") ?? "");
      if (!normalized) return c.json({ error: "tag_required" }, 400);

      const { data: tagRow, error } = await deps.supabase.schema("delivery").from("courier_roam_tags")
        .select("user_id, custom_tag_name")
        .eq("custom_tag_name", normalized)
        .maybeSingle();

      if (error) throw error;
      if (!tagRow?.custom_tag_name) return c.json({ error: "not_found" }, 404);

      const { data: profile } = await deps.supabase.schema("delivery").from("courier_profiles")
        .select("display_name")
        .eq("user_id", tagRow.user_id)
        .maybeSingle();

      return c.json({
        custom_tag_name: tagRow.custom_tag_name as string,
        display_name: (profile?.display_name as string | null) ?? null,
        user_id: tagRow.user_id as string,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });
}
