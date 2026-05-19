/**
 * Link rider-facing services to Commando body types (priority order).
 */
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { requireProductAdmin } from "../../_shared/productAdmin.ts";
import type { RidesAdminTables } from "../../_shared/ridesAdminDb.ts";
import { invalidateServiceMatchingCache } from "../fare/serviceMatching.ts";

type DbBundle = {
  db: import("https://esm.sh/@supabase/supabase-js@2").SupabaseClient;
  tables: RidesAdminTables;
};

function linkTable(tables: RidesAdminTables): string {
  return tables.service_body_types;
}

async function assertServiceSlug(
  db: DbBundle["db"],
  tables: RidesAdminTables,
  slug: string,
): Promise<boolean> {
  const { data } = await db.from(tables.vehicle_types).select("slug, solution_kind").eq("slug", slug).maybeSingle();
  return !!data && (data as { solution_kind: string }).solution_kind === "service";
}

async function assertBodyTypeSlugs(
  db: DbBundle["db"],
  tables: RidesAdminTables,
  slugs: string[],
): Promise<string | null> {
  if (!slugs.length) return null;
  const { data } = await db.from(tables.vehicle_types).select("slug, solution_kind, is_active")
    .in("slug", slugs);
  const rows = data ?? [];
  if (rows.length !== slugs.length) return "unknown_body_type";
  for (const r of rows as { slug: string; solution_kind: string; is_active: boolean }[]) {
    if (r.solution_kind !== "vehicle") return "not_a_body_type";
    if (!r.is_active) return "inactive_body_type";
  }
  return null;
}

export function registerServiceBodyTypeRoutes(
  admin: Hono,
  ridesDbOrResponse: (c: { json: (body: unknown, status?: number) => Response }) => Promise<DbBundle | Response>,
) {
  admin.get("/services/:slug/body-types", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;
    const serviceSlug = decodeURIComponent(c.req.param("slug")).trim().toLowerCase();
    const resolved = await ridesDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const { db, tables } = resolved;

    if (!(await assertServiceSlug(db, tables, serviceSlug))) {
      return c.json({ error: "service_not_found" }, 404);
    }

    const { data, error } = await db.from(linkTable(tables))
      .select("body_type_slug, priority")
      .eq("service_slug", serviceSlug)
      .order("priority")
      .order("body_type_slug");

    if (error) return c.json({ error: "list_failed", message: error.message }, 500);

    const slugs = (data ?? []).map((r: { body_type_slug: string }) => r.body_type_slug);
    let labels: Record<string, string> = {};
    if (slugs.length) {
      const { data: bodies } = await db.from(tables.vehicle_types)
        .select("slug, label, commando_body_type")
        .in("slug", slugs);
      for (const b of bodies ?? []) {
        const row = b as { slug: string; label: string; commando_body_type?: string | null };
        labels[row.slug] = row.commando_body_type?.trim() || row.label;
      }
    }

    return c.json({
      service_slug: serviceSlug,
      body_types: (data ?? []).map((r: { body_type_slug: string; priority: number }) => ({
        body_type_slug: r.body_type_slug,
        priority: r.priority,
        label: labels[r.body_type_slug] ?? r.body_type_slug,
      })),
    });
  });

  admin.put("/services/:slug/body-types", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;
    const serviceSlug = decodeURIComponent(c.req.param("slug")).trim().toLowerCase();
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const resolved = await ridesDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const { db, tables } = resolved;

    if (!(await assertServiceSlug(db, tables, serviceSlug))) {
      return c.json({ error: "service_not_found" }, 404);
    }

    const raw = body.body_types;
    if (!Array.isArray(raw)) return c.json({ error: "body_types_required" }, 400);

    const parsed: { body_type_slug: string; priority: number }[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < raw.length; i++) {
      const item = raw[i] as Record<string, unknown>;
      const body_type_slug = typeof item.body_type_slug === "string"
        ? item.body_type_slug.trim().toLowerCase()
        : "";
      if (!body_type_slug) return c.json({ error: "invalid_body_type_slug" }, 400);
      if (seen.has(body_type_slug)) return c.json({ error: "duplicate_body_type" }, 400);
      seen.add(body_type_slug);
      const priority = typeof item.priority === "number"
        ? Math.round(item.priority)
        : typeof item.priority === "string"
        ? parseInt(item.priority, 10)
        : (i + 1) * 10;
      parsed.push({ body_type_slug, priority: Number.isFinite(priority) ? priority : (i + 1) * 10 });
    }

    const slugList = parsed.map((p) => p.body_type_slug);
    const bodyErr = await assertBodyTypeSlugs(db, tables, slugList);
    if (bodyErr) return c.json({ error: bodyErr }, 400);

    const lt = linkTable(tables);
    await db.from(lt).delete().eq("service_slug", serviceSlug);

    if (parsed.length) {
      const { error: insErr } = await db.from(lt).insert(
        parsed.map((p) => ({
          service_slug: serviceSlug,
          body_type_slug: p.body_type_slug,
          priority: p.priority,
        })),
      );
      if (insErr) return c.json({ error: "save_failed", message: insErr.message }, 500);
    }

    invalidateServiceMatchingCache();
    return c.json({ service_slug: serviceSlug, body_types: parsed });
  });
}
