/**
 * Platform-global Jamaica vendor + expense category catalog.
 * Super Admin owns verified masters (like station:); fleets read + request pending.
 */
import type { Context } from "npm:hono";
import type { Hono } from "npm:hono";
import * as kv from "./kv_store.tsx";
import { requireAuth, requirePermission } from "./rbac_middleware.ts";
import { getOrgId } from "./org_scope.ts";
import type { ExpenseHubCategory, ExpenseVendor, PlatformVendorStatus } from "../../../types/expenseHub.ts";

const ADMIN = "/make-server-37f42386/admin/platform-vendors";
const ADMIN_CAT = "/make-server-37f42386/admin/platform-categories";
const FLEET_HUB = "/make-server-37f42386/expense-hub";

const VENDOR_PREFIX = "platform_vendor:";
const CATEGORY_PREFIX = "platform_expense_category:";
/** Legacy org-scoped keys — read during migration / dual-read fallback. */
const LEGACY_VENDOR_PREFIX = "expense_vendor:";
const LEGACY_CATEGORY_PREFIX = "expense_category:";

function nowIso() {
  return new Date().toISOString();
}

function normalizeName(name: string) {
  return String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

async function listPlatformVendors(): Promise<ExpenseVendor[]> {
  const items = (await kv.getByPrefix(VENDOR_PREFIX)) as ExpenseVendor[];
  return items || [];
}

async function listPlatformCategories(): Promise<ExpenseHubCategory[]> {
  return ((await kv.getByPrefix(CATEGORY_PREFIX)) as ExpenseHubCategory[]) || [];
}

const BUILT_IN_CATEGORIES: Array<{ value: string; label: string }> = [
  { value: "Insurance", label: "Insurance" },
  { value: "Security", label: "Security (Tracker/GPS)" },
  { value: "Lease", label: "Vehicle Lease/Financing" },
  { value: "Maintenance", label: "Maintenance Contract" },
  { value: "Software", label: "Software Subscription" },
  { value: "Permits", label: "Permits & Licenses" },
  { value: "Equipment", label: "Equipment Rental" },
  { value: "Parking", label: "Parking" },
  { value: "Other", label: "Other" },
];

function builtInCategoryItems(): ExpenseHubCategory[] {
  return BUILT_IN_CATEGORIES.map((c) => ({
    id: `system:${c.value}`,
    value: c.value,
    label: c.label,
    isSystem: true,
    isActive: true,
    createdAt: "",
    updatedAt: "",
  }));
}

/** Merge platform + built-in categories (platform rows win on same value). */
export async function mergeCategoryCatalog(): Promise<ExpenseHubCategory[]> {
  const allPlatform = await listPlatformCategories();
  const platform = allPlatform.filter((c) => c.isActive !== false);
  // Inactive platform rows suppress matching built-ins after soft-delete.
  const suppressed = new Set(
    allPlatform
      .filter((c) => c.isActive === false)
      .map((c) => String(c.value || "").toLowerCase()),
  );
  const builtIn = builtInCategoryItems();
  const seen = new Set(platform.map((c) => String(c.value || "").toLowerCase()));
  const extras = builtIn.filter(
    (c) => !seen.has(c.value.toLowerCase()) && !suppressed.has(c.value.toLowerCase()),
  );
  return [...platform, ...extras];
}

/**
 * Fleet-visible vendors: all verified active + pending requested by this org.
 * Rejected / other orgs' pending are hidden from pickers.
 */
export async function listFleetVisibleVendors(orgId: string | null): Promise<ExpenseVendor[]> {
  const all = await listPlatformVendors();
  return all.filter((v) => {
    if (v.isActive === false) return false;
    if (v.mergedIntoVendorId) return false;
    const status = (v.status || "verified") as PlatformVendorStatus;
    if (status === "verified") return true;
    if (status === "pending" && orgId && v.requestedByOrgId === orgId) return true;
    return false;
  });
}

/**
 * Fleet request: create pending platform vendor (or return existing verified/pending match).
 */
export async function requestPlatformVendor(
  c: Context,
  body: { name?: string; categoryDefault?: string; notes?: string },
): Promise<{ vendor: ExpenseVendor; alreadyExists: boolean } | { error: string; status: number }> {
  const name = String(body.name || "").trim();
  if (!name) return { error: "Name required", status: 400 };
  const orgId = getOrgId(c);
  const all = await listPlatformVendors();
  const key = normalizeName(name);
  const verifiedHit = all.find(
    (v) =>
      (v.status || "verified") === "verified" &&
      v.isActive !== false &&
      !v.mergedIntoVendorId &&
      normalizeName(v.name) === key,
  );
  if (verifiedHit) return { vendor: verifiedHit, alreadyExists: true };
  const pendingHit = all.find(
    (v) =>
      v.status === "pending" &&
      v.requestedByOrgId === orgId &&
      normalizeName(v.name) === key,
  );
  if (pendingHit) return { vendor: pendingHit, alreadyExists: true };

  const rbacUser = c.get("rbacUser") as { userId?: string } | undefined;
  const vendor: ExpenseVendor = {
    id: crypto.randomUUID(),
    name,
    categoryDefault: body.categoryDefault as ExpenseVendor["categoryDefault"],
    notes: body.notes ? String(body.notes).trim() : undefined,
    isActive: true,
    status: "pending",
    requestedByOrgId: orgId || undefined,
    requestedByUserId: rbacUser?.userId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await kv.set(`${VENDOR_PREFIX}${vendor.id}`, vendor);
  return { vendor, alreadyExists: false };
}

type VerifyFn = (
  c: Context,
) => Promise<{ userId: string; email: string; name: string } | Response>;

export function registerPlatformVendorRoutes(app: Hono, verifySuperadmin: VerifyFn) {
  // ── Super Admin: vendors ───────────────────────────────────────────────
  app.get(ADMIN, async (c: Context) => {
    const auth = await verifySuperadmin(c);
    if (auth instanceof Response) return auth;
    const status = String(c.req.query("status") || "").trim();
    const includeInactive = String(c.req.query("includeInactive") || "") === "1";
    let items = await listPlatformVendors();
    if (!includeInactive) items = items.filter((v) => v.isActive !== false);
    if (status) items = items.filter((v) => (v.status || "verified") === status);
    items.sort((a, b) => a.name.localeCompare(b.name));
    return c.json({ items });
  });

  app.post(ADMIN, async (c: Context) => {
    const auth = await verifySuperadmin(c);
    if (auth instanceof Response) return auth;
    const body = await c.req.json();
    const name = String(body.name || "").trim();
    if (!name) return c.json({ error: "Name required" }, 400);

    const all = await listPlatformVendors();
    const key = normalizeName(name);
    if (
      all.some(
        (v) =>
          (v.status || "verified") === "verified" &&
          v.isActive !== false &&
          !v.mergedIntoVendorId &&
          normalizeName(v.name) === key,
      )
    ) {
      return c.json({ error: "A verified vendor with that name already exists" }, 409);
    }

    const vendor: ExpenseVendor = {
      id: body.id || crypto.randomUUID(),
      name,
      categoryDefault: body.categoryDefault,
      notes: body.notes ? String(body.notes).trim() : undefined,
      isActive: body.isActive !== false,
      status: "verified",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    await kv.set(`${VENDOR_PREFIX}${vendor.id}`, vendor);
    return c.json({ success: true, data: vendor });
  });

  app.post(`${ADMIN}/bulk`, async (c: Context) => {
    const auth = await verifySuperadmin(c);
    if (auth instanceof Response) return auth;
    const body = await c.req.json();
    const rawNames: string[] = Array.isArray(body.names)
      ? body.names.map((n: unknown) => String(n || "").trim())
      : String(body.text || "")
          .split(/\r?\n/)
          .map((n: string) => n.trim());
    const names = rawNames.filter(Boolean);
    if (names.length === 0) return c.json({ error: "At least one vendor name is required" }, 400);
    if (names.length > 200) return c.json({ error: "Maximum 200 vendors per bulk add" }, 400);

    const all = await listPlatformVendors();
    const seen = new Set(
      all
        .filter((v) => (v.status || "verified") === "verified" && v.isActive !== false)
        .map((v) => normalizeName(v.name)),
    );
    const created: ExpenseVendor[] = [];
    const skipped: string[] = [];
    const ts = nowIso();
    const categoryDefault =
      body.categoryDefault && body.categoryDefault !== "none"
        ? String(body.categoryDefault)
        : undefined;

    for (const name of names) {
      const key = normalizeName(name);
      if (seen.has(key)) {
        skipped.push(name);
        continue;
      }
      seen.add(key);
      const vendor: ExpenseVendor = {
        id: crypto.randomUUID(),
        name,
        categoryDefault: categoryDefault as ExpenseVendor["categoryDefault"],
        notes: body.notes ? String(body.notes).trim() : undefined,
        isActive: true,
        status: "verified",
        createdAt: ts,
        updatedAt: ts,
      };
      await kv.set(`${VENDOR_PREFIX}${vendor.id}`, vendor);
      created.push(vendor);
    }
    return c.json({
      success: true,
      created,
      skipped,
      summary: { created: created.length, skipped: skipped.length },
    });
  });

  app.put(`${ADMIN}/:id`, async (c: Context) => {
    const auth = await verifySuperadmin(c);
    if (auth instanceof Response) return auth;
    const id = c.req.param("id");
    const existing = (await kv.get(`${VENDOR_PREFIX}${id}`)) as ExpenseVendor | null;
    if (!existing) return c.json({ error: "Vendor not found" }, 404);
    const body = await c.req.json();
    let categoryDefault = existing.categoryDefault;
    if (body.categoryDefault !== undefined) {
      const raw = body.categoryDefault;
      categoryDefault =
        raw == null || String(raw).trim() === "" || String(raw) === "none"
          ? undefined
          : (String(raw).trim() as ExpenseVendor["categoryDefault"]);
    }
    const next: ExpenseVendor = {
      ...existing,
      name: body.name != null ? String(body.name).trim() : existing.name,
      categoryDefault,
      notes: body.notes !== undefined ? String(body.notes || "").trim() || undefined : existing.notes,
      isActive: body.isActive !== undefined ? Boolean(body.isActive) : existing.isActive,
      status: body.status !== undefined ? body.status : existing.status || "verified",
      updatedAt: nowIso(),
    };
    if (!next.name) return c.json({ error: "Name required" }, 400);
    await kv.set(`${VENDOR_PREFIX}${id}`, next);
    return c.json({ success: true, data: next });
  });

  /** Soft-delete — hides from catalog pickers; keeps history on existing docs. */
  app.delete(`${ADMIN}/:id`, async (c: Context) => {
    const auth = await verifySuperadmin(c);
    if (auth instanceof Response) return auth;
    const id = c.req.param("id");
    const existing = (await kv.get(`${VENDOR_PREFIX}${id}`)) as ExpenseVendor | null;
    if (!existing) return c.json({ error: "Vendor not found" }, 404);
    const next: ExpenseVendor = {
      ...existing,
      isActive: false,
      updatedAt: nowIso(),
    };
    await kv.set(`${VENDOR_PREFIX}${id}`, next);
    return c.json({ success: true, data: next });
  });

  /** Approve pending → verified, or merge into an existing verified vendor. */
  app.post(`${ADMIN}/:id/approve`, async (c: Context) => {
    const auth = await verifySuperadmin(c);
    if (auth instanceof Response) return auth;
    const id = c.req.param("id");
    const existing = (await kv.get(`${VENDOR_PREFIX}${id}`)) as ExpenseVendor | null;
    if (!existing) return c.json({ error: "Vendor not found" }, 404);
    const body = await c.req.json().catch(() => ({}));
    const mergeIntoId = body.mergeIntoVendorId ? String(body.mergeIntoVendorId) : "";

    if (mergeIntoId) {
      const target = (await kv.get(`${VENDOR_PREFIX}${mergeIntoId}`)) as ExpenseVendor | null;
      if (!target || (target.status || "verified") !== "verified") {
        return c.json({ error: "Merge target must be a verified vendor" }, 400);
      }
      const merged: ExpenseVendor = {
        ...existing,
        status: "rejected",
        isActive: false,
        mergedIntoVendorId: mergeIntoId,
        updatedAt: nowIso(),
      };
      await kv.set(`${VENDOR_PREFIX}${id}`, merged);
      await remapVendorReferences(id, mergeIntoId);
      return c.json({ success: true, data: merged, mergedInto: target });
    }

    const next: ExpenseVendor = {
      ...existing,
      status: "verified",
      isActive: true,
      mergedIntoVendorId: undefined,
      updatedAt: nowIso(),
      name: body.name != null ? String(body.name).trim() || existing.name : existing.name,
      categoryDefault:
        body.categoryDefault !== undefined ? body.categoryDefault : existing.categoryDefault,
      notes: body.notes !== undefined ? String(body.notes || "").trim() || undefined : existing.notes,
    };
    await kv.set(`${VENDOR_PREFIX}${id}`, next);
    return c.json({ success: true, data: next });
  });

  app.post(`${ADMIN}/:id/reject`, async (c: Context) => {
    const auth = await verifySuperadmin(c);
    if (auth instanceof Response) return auth;
    const id = c.req.param("id");
    const existing = (await kv.get(`${VENDOR_PREFIX}${id}`)) as ExpenseVendor | null;
    if (!existing) return c.json({ error: "Vendor not found" }, 404);
    const next: ExpenseVendor = {
      ...existing,
      status: "rejected",
      isActive: false,
      updatedAt: nowIso(),
    };
    await kv.set(`${VENDOR_PREFIX}${id}`, next);
    return c.json({ success: true, data: next });
  });

  /** Lift legacy org expense_vendor / expense_category rows into platform catalog. */
  app.post(`${ADMIN}/migrate-legacy`, async (c: Context) => {
    const auth = await verifySuperadmin(c);
    if (auth instanceof Response) return auth;
    const body = await c.req.json().catch(() => ({}));
    const dryRun = body.dryRun !== false && body.confirm !== true;

    const legacyVendors = ((await kv.getByPrefix(LEGACY_VENDOR_PREFIX)) as ExpenseVendor[]) || [];
    const platform = await listPlatformVendors();
    const byName = new Map(
      platform
        .filter((v) => (v.status || "verified") === "verified" && !v.mergedIntoVendorId)
        .map((v) => [normalizeName(v.name), v]),
    );

    const created: ExpenseVendor[] = [];
    const merged: Array<{ legacyId: string; platformId: string; name: string }> = [];
    const skipped: string[] = [];
    const idMap: Record<string, string> = {};
    const ts = nowIso();

    for (const legacy of legacyVendors) {
      if (!legacy?.id || !legacy.name) {
        skipped.push(String(legacy?.id || "unknown"));
        continue;
      }
      // Already promoted?
      const existingPlat = platform.find((p) => p.id === legacy.id);
      if (existingPlat) {
        idMap[legacy.id] = existingPlat.mergedIntoVendorId || existingPlat.id;
        skipped.push(legacy.id);
        continue;
      }
      const key = normalizeName(legacy.name);
      const hit = byName.get(key);
      if (hit) {
        idMap[legacy.id] = hit.id;
        merged.push({ legacyId: legacy.id, platformId: hit.id, name: legacy.name });
        if (!dryRun) await remapVendorReferences(legacy.id, hit.id);
        continue;
      }
      const vendor: ExpenseVendor = {
        id: legacy.id,
        name: legacy.name.trim(),
        categoryDefault: legacy.categoryDefault,
        notes: legacy.notes,
        isActive: legacy.isActive !== false,
        status: "verified",
        createdAt: legacy.createdAt || ts,
        updatedAt: ts,
      };
      created.push(vendor);
      byName.set(key, vendor);
      idMap[legacy.id] = vendor.id;
      if (!dryRun) await kv.set(`${VENDOR_PREFIX}${vendor.id}`, vendor);
    }

    // Categories
    const legacyCats =
      ((await kv.getByPrefix(LEGACY_CATEGORY_PREFIX)) as ExpenseHubCategory[]) || [];
    const platCats = await listPlatformCategories();
    const catByValue = new Map(platCats.map((c) => [String(c.value || "").toLowerCase(), c]));
    const catsCreated: ExpenseHubCategory[] = [];
    for (const legacy of legacyCats) {
      if (!legacy?.value) continue;
      const vk = legacy.value.toLowerCase();
      if (catByValue.has(vk) || BUILT_IN_CATEGORIES.some((b) => b.value.toLowerCase() === vk)) {
        continue;
      }
      const cat: ExpenseHubCategory = {
        id: legacy.id || crypto.randomUUID(),
        value: legacy.value,
        label: legacy.label || legacy.value,
        notes: legacy.notes,
        isSystem: false,
        isActive: legacy.isActive !== false,
        createdAt: legacy.createdAt || ts,
        updatedAt: ts,
      };
      catsCreated.push(cat);
      catByValue.set(vk, cat);
      if (!dryRun) await kv.set(`${CATEGORY_PREFIX}${cat.id}`, cat);
    }

    return c.json({
      dryRun,
      vendors: {
        created: created.length,
        merged: merged.length,
        skipped: skipped.length,
        sampleCreated: created.slice(0, 10),
        sampleMerged: merged.slice(0, 10),
        idMapSample: Object.fromEntries(Object.entries(idMap).slice(0, 20)),
      },
      categories: { created: catsCreated.length, sample: catsCreated.slice(0, 10) },
    });
  });

  // ── Super Admin: categories ────────────────────────────────────────────
  app.get(ADMIN_CAT, async (c: Context) => {
    const auth = await verifySuperadmin(c);
    if (auth instanceof Response) return auth;
    const items = await mergeCategoryCatalog();
    return c.json({ items });
  });

  app.post(ADMIN_CAT, async (c: Context) => {
    const auth = await verifySuperadmin(c);
    if (auth instanceof Response) return auth;
    const body = await c.req.json();
    const label = String(body.label || body.name || "").trim();
    if (!label) return c.json({ error: "Category name is required" }, 400);
    const slugParts = label.split(/[^a-zA-Z0-9]+/).filter(Boolean);
    const autoValue = slugParts
      .map((p: string) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
      .join("");
    const value = String(body.value || autoValue || "Custom").trim();
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(value)) {
      return c.json({ error: "Category code must start with a letter (letters/numbers/_ only)" }, 400);
    }
    if (BUILT_IN_CATEGORIES.some((b) => b.value.toLowerCase() === value.toLowerCase())) {
      return c.json({ error: "That category already exists in the standard list" }, 409);
    }
    const existing = await listPlatformCategories();
    if (
      existing.some(
        (c) => c.isActive !== false && String(c.value || "").toLowerCase() === value.toLowerCase(),
      )
    ) {
      return c.json({ error: "A category with that code already exists" }, 409);
    }
    const category: ExpenseHubCategory = {
      id: body.id || crypto.randomUUID(),
      value,
      label,
      notes: body.notes ? String(body.notes).trim() : undefined,
      isSystem: false,
      isActive: true,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    await kv.set(`${CATEGORY_PREFIX}${category.id}`, category);
    return c.json({ success: true, data: category });
  });

  app.put(`${ADMIN_CAT}/:id`, async (c: Context) => {
    const auth = await verifySuperadmin(c);
    if (auth instanceof Response) return auth;
    const id = c.req.param("id");
    const body = await c.req.json();
    const label = body.label != null ? String(body.label).trim() : "";

    // Built-ins are code seeds — editing materializes a platform override (same value, new label).
    if (id.startsWith("system:")) {
      const value = id.slice("system:".length);
      const builtIn = BUILT_IN_CATEGORIES.find((b) => b.value === value);
      if (!builtIn) return c.json({ error: "Category not found" }, 404);
      const nextLabel = label || builtIn.label;
      if (!nextLabel) return c.json({ error: "Category name is required" }, 400);
      const all = await listPlatformCategories();
      const existingOverride = all.find(
        (c) => String(c.value || "").toLowerCase() === value.toLowerCase(),
      );
      const now = nowIso();
      const next: ExpenseHubCategory = existingOverride
        ? {
            ...existingOverride,
            label: nextLabel,
            notes:
              body.notes !== undefined
                ? String(body.notes).trim() || undefined
                : existingOverride.notes,
            isActive:
              body.isActive !== undefined ? Boolean(body.isActive) : existingOverride.isActive !== false,
            updatedAt: now,
          }
        : {
            id: crypto.randomUUID(),
            value: builtIn.value,
            label: nextLabel,
            notes: body.notes !== undefined ? String(body.notes).trim() || undefined : undefined,
            isSystem: false,
            isActive: true,
            createdAt: now,
            updatedAt: now,
          };
      await kv.set(`${CATEGORY_PREFIX}${next.id}`, next);
      return c.json({ success: true, data: next });
    }

    const existing = (await kv.get(`${CATEGORY_PREFIX}${id}`)) as ExpenseHubCategory | null;
    if (!existing) return c.json({ error: "Category not found" }, 404);
    const nextLabel = label || existing.label;
    if (!nextLabel) return c.json({ error: "Category name is required" }, 400);
    const next: ExpenseHubCategory = {
      ...existing,
      label: nextLabel,
      notes:
        body.notes !== undefined ? String(body.notes).trim() || undefined : existing.notes,
      isActive: body.isActive !== undefined ? Boolean(body.isActive) : existing.isActive !== false,
      updatedAt: nowIso(),
    };
    await kv.set(`${CATEGORY_PREFIX}${id}`, next);
    return c.json({ success: true, data: next });
  });

  /** Soft-delete category (built-ins become suppressed via inactive platform override). */
  app.delete(`${ADMIN_CAT}/:id`, async (c: Context) => {
    const auth = await verifySuperadmin(c);
    if (auth instanceof Response) return auth;
    const id = c.req.param("id");

    if (id.startsWith("system:")) {
      const value = id.slice("system:".length);
      const builtIn = BUILT_IN_CATEGORIES.find((b) => b.value === value);
      if (!builtIn) return c.json({ error: "Category not found" }, 404);
      const all = await listPlatformCategories();
      const existingOverride = all.find(
        (c) => String(c.value || "").toLowerCase() === value.toLowerCase(),
      );
      const now = nowIso();
      const next: ExpenseHubCategory = existingOverride
        ? { ...existingOverride, isActive: false, updatedAt: now }
        : {
            id: crypto.randomUUID(),
            value: builtIn.value,
            label: builtIn.label,
            isSystem: false,
            isActive: false,
            createdAt: now,
            updatedAt: now,
          };
      await kv.set(`${CATEGORY_PREFIX}${next.id}`, next);
      return c.json({ success: true, data: next });
    }

    const existing = (await kv.get(`${CATEGORY_PREFIX}${id}`)) as ExpenseHubCategory | null;
    if (!existing) return c.json({ error: "Category not found" }, 404);
    const next: ExpenseHubCategory = {
      ...existing,
      isActive: false,
      updatedAt: nowIso(),
    };
    await kv.set(`${CATEGORY_PREFIX}${id}`, next);
    return c.json({ success: true, data: next });
  });

  // ── Fleet: request pending vendor (replaces org create) ────────────────
  app.post(
    `${FLEET_HUB}/vendors/request`,
    requireAuth(),
    requirePermission("expenses.create"),
    async (c: Context) => {
      const body = await c.req.json();
      const result = await requestPlatformVendor(c, body);
      if ("error" in result) return c.json({ error: result.error }, result.status);
      return c.json({
        success: true,
        data: result.vendor,
        alreadyExists: result.alreadyExists,
      });
    },
  );
}

/** Remap vendorId on expense docs + rule groups when merging. */
async function remapVendorReferences(fromId: string, toId: string) {
  const docs = (await kv.getByPrefix("expense_doc:")) as Array<{
    id: string;
    vendorId?: string;
    vendorName?: string;
    [k: string]: unknown;
  }>;
  for (const doc of docs) {
    if (doc?.vendorId === fromId) {
      const target = (await kv.get(`${VENDOR_PREFIX}${toId}`)) as ExpenseVendor | null;
      await kv.set(`expense_doc:${doc.id}`, {
        ...doc,
        vendorId: toId,
        vendorName: target?.name || doc.vendorName,
      });
    }
  }
  const rules = (await kv.getByPrefix("expense_rule_group:")) as Array<{
    id: string;
    vendorId?: string;
    vendorName?: string;
    [k: string]: unknown;
  }>;
  for (const rule of rules) {
    if (rule?.vendorId === fromId) {
      const target = (await kv.get(`${VENDOR_PREFIX}${toId}`)) as ExpenseVendor | null;
      await kv.set(`expense_rule_group:${rule.id}`, {
        ...rule,
        vendorId: toId,
        vendorName: target?.name || rule.vendorName,
      });
    }
  }
}
