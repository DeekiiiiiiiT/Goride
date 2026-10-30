import type { Hono } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

type Owner = { id: string };
type ReadGuard = (c: any) => Promise<Owner | Response>;

const TABLES = new Set(["category_group", "category", "place_type", "facility_type", "brand"]);
const SLUG = /^[a-z0-9_]+$/;
const CODE = /^[a-z0-9_.]+$/;

export function taxonomyKeyOk(table: string, value: string): boolean {
  const key = value.trim();
  if (table === "category_group" || table === "category") return CODE.test(key);
  if (table === "brand") return SLUG.test(key) || /^[0-9a-f-]{36}$/i.test(key);
  return SLUG.test(key);
}

/** match_profile is an engine contract. A patch must not change it. */
export function stripTaxonomyPatch(body: Record<string, unknown>): Record<string, unknown> {
  const patch = { ...body };
  delete patch.match_profile;
  delete patch.retire;
  delete patch.restore;
  delete patch.reason;
  delete patch.code;
  delete patch.slug;
  delete patch.id;
  return patch;
}

export function taxonomyFailure(err: unknown, fallback: string): { status: 400 | 403 | 409 | 500; body: Record<string, unknown> } {
  const message = err instanceof Error ? err.message : fallback;
  const details = err && typeof err === "object" && "details" in err ? String((err as { details?: string }).details || "") : "";
  const code = err && typeof err === "object" && "code" in err ? String((err as { code?: string }).code || "") : "";
  const blob = `${message} ${details} ${code}`;
  if (/only the owner/i.test(message)) return { status: 403, body: { error: message } };
  if (/\bin_use\b/i.test(blob)) {
    let blocked_by: Record<string, unknown> = {};
    try {
      blocked_by = details ? JSON.parse(details) as Record<string, unknown> : {};
    } catch {
      blocked_by = {};
    }
    return { status: 409, body: { error: "in_use", blocked_by } };
  }
  if (/parent_retired/i.test(blob)) {
    return { status: 409, body: { error: details || "Restore the parent first" } };
  }
  if (
    code === "22023"
    || code === "23505"
    || code === "23514"
    || code === "22P02"
    || /at least 10|bad slug|cannot be edited|nothing to change|not found|already|duplicate|invalid/i.test(blob)
  ) {
    return { status: 400, body: { error: message } };
  }
  return { status: 500, body: { error: fallback } };
}

function places(sb: SupabaseClient) {
  return sb.schema("places");
}

function reasonOf(body: Record<string, unknown>): string {
  return String(body.reason || "");
}

export function registerTaxonomyRoutes(
  app: Hono,
  deps: { admin: () => SupabaseClient; requireOwner: (c: any) => Promise<Owner>; requirePlatformAdmin: ReadGuard },
) {
  app.get("/admin/taxonomy", async (c) => {
    try {
      const auth = await deps.requirePlatformAdmin(c);
      if (auth instanceof Response) return auth;
      const { data, error } = await places(deps.admin()).rpc("taxonomy_admin");
      if (error) throw error;
      return c.json(data || {});
    } catch (err) {
      const failed = taxonomyFailure(err, "Could not load categories");
      return c.json(failed.body, failed.status);
    }
  });

  app.get("/admin/taxonomy/history", async (c) => {
    try {
      const auth = await deps.requirePlatformAdmin(c);
      if (auth instanceof Response) return auth;
      const table = String(c.req.query("table") || "");
      const id = String(c.req.query("id") || "");
      const limit = Number(c.req.query("limit") || 50);
      const { data, error } = await places(deps.admin()).rpc("taxonomy_history", {
        p_table: table,
        p_id: id,
        p_limit: limit,
      });
      if (error) throw error;
      return c.json({ rows: data || [] });
    } catch (err) {
      const failed = taxonomyFailure(err, "Could not load categories");
      return c.json(failed.body, failed.status);
    }
  });

  app.post("/admin/taxonomy/:table", async (c) => {
    try {
      const owner = await deps.requireOwner(c);
      const table = c.req.param("table");
      const body = await c.req.json() as Record<string, unknown>;
      if (!TABLES.has(table)) return c.json({ error: "That list cannot be edited" }, 400);
      const key = table === "category" || table === "category_group" ? String(body.code || "") : String(body.slug || "");
      if (!taxonomyKeyOk(table, key)) return c.json({ error: "bad slug" }, 400);
      const { data, error } = await places(deps.admin()).rpc("create_taxonomy", {
        p_table: table,
        p_row: body,
        p_reason: reasonOf(body),
        p_actor: owner.id,
      });
      if (error) throw error;
      return c.json(data || { ok: true });
    } catch (err) {
      const failed = taxonomyFailure(err, "Could not update the list");
      return c.json(failed.body, failed.status);
    }
  });

  app.patch("/admin/taxonomy/:table/:id", async (c) => {
    try {
      const owner = await deps.requireOwner(c);
      const table = c.req.param("table");
      const id = c.req.param("id");
      const body = await c.req.json() as Record<string, unknown>;
      if (!TABLES.has(table)) return c.json({ error: "That list cannot be edited" }, 400);
      const sb = places(deps.admin());
      if (body.retire === true) {
        const { data, error } = await sb.rpc("retire_taxonomy", {
          p_table: table,
          p_id: id,
          p_reason: reasonOf(body),
          p_actor: owner.id,
        });
        if (error) throw error;
        return c.json(data || { ok: true });
      }
      if (body.restore === true) {
        const { data, error } = await sb.rpc("restore_taxonomy", {
          p_table: table,
          p_id: id,
          p_reason: reasonOf(body),
          p_actor: owner.id,
        });
        if (error) throw error;
        return c.json(data || { ok: true });
      }
      const patch = stripTaxonomyPatch(body);
      if (!Object.keys(patch).length) return c.json({ error: "Nothing to change" }, 400);
      const { data, error } = await sb.rpc("save_taxonomy", {
        p_table: table,
        p_id: id,
        p_patch: patch,
        p_reason: reasonOf(body),
        p_actor: owner.id,
      });
      if (error) throw error;
      return c.json(data || { ok: true });
    } catch (err) {
      const failed = taxonomyFailure(err, "Could not update the list");
      return c.json(failed.body, failed.status);
    }
  });
}
