/**
 * Customer account routes — profile, saved addresses, merchant + item favorites.
 * Service-role writes for delivery.customers + auth user_metadata.
 */
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { detectFileMagicBytes, extForMime, IMAGE_MIMES } from "../_shared/fileMagic.ts";
import { validateBody, z } from "../_shared/validateBody.ts";

const AVATAR_BUCKET = "customer-avatars";
const ISSUE_PHOTO_BUCKET = "customer-issue-photos";
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export type CustomerAccountRoutesDeps = {
  getSupabase: (authHeader: string) => SupabaseClient;
  getServiceSupabase: () => SupabaseClient;
};

const SavedAddressSchema = z.object({
  id: z.string().min(1),
  label: z.enum(["home", "work", "other"]),
  line1: z.string().min(1),
  line2: z.string().optional(),
  instructions: z.string().optional(),
  city: z.string().optional(),
  isDefault: z.boolean().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

const PatchProfileBody = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  name: z.string().optional(),
  phone: z.string().optional(),
  email: z.union([z.string().email(), z.literal("")]).optional(),
  savedAddresses: z.array(SavedAddressSchema).optional(),
  notificationPrefs: z.object({
    orderUpdates: z.boolean().optional(),
    promotions: z.boolean().optional(),
    newRestaurants: z.boolean().optional(),
    personalizedPicks: z.boolean().optional(),
    emailNewsletters: z.boolean().optional(),
    smsUpdates: z.boolean().optional(),
  }).optional(),
  preferredPaymentMethod: z.enum(["wipay", "cash"]).optional(),
}).passthrough();

const FavoriteBody = z.object({
  merchantId: z.string().min(1),
});

const FavoriteItemBody = z.object({
  merchantId: z.string().min(1),
  menuItemId: z.string().min(1),
});

async function resolveMerchantId(serviceSb: SupabaseClient, merchantId: string): Promise<string | null> {
  const byId = await serviceSb.from("merchants").select("id").eq("id", merchantId).maybeSingle();
  if (byId.data) return String((byId.data as { id: string }).id);
  const bySlug = await serviceSb.from("merchants").select("id").eq("slug", merchantId).maybeSingle();
  return bySlug.data ? String((bySlug.data as { id: string }).id) : null;
}

type CustomerRow = {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  default_address: string | null;
  default_lat: number | null;
  default_lng: number | null;
  saved_addresses: unknown;
  notification_prefs?: unknown;
  preferred_payment_method?: string | null;
  avatar_url?: string | null;
  avatar_path?: string | null;
  account_status?: string;
  created_at?: string;
  updated_at?: string;
};

function getAuthAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function defaultNotificationPrefs() {
  return {
    orderUpdates: true,
    promotions: true,
    newRestaurants: false,
    personalizedPicks: true,
    emailNewsletters: true,
    smsUpdates: true,
  };
}

function mergeNotificationPrefs(raw: unknown) {
  const base = defaultNotificationPrefs();
  if (!raw || typeof raw !== "object") return base;
  const row = raw as Record<string, unknown>;
  return {
    orderUpdates: typeof row.orderUpdates === "boolean" ? row.orderUpdates : base.orderUpdates,
    promotions: typeof row.promotions === "boolean" ? row.promotions : base.promotions,
    newRestaurants: typeof row.newRestaurants === "boolean" ? row.newRestaurants : base.newRestaurants,
    personalizedPicks: typeof row.personalizedPicks === "boolean" ? row.personalizedPicks : base.personalizedPicks,
    emailNewsletters: typeof row.emailNewsletters === "boolean" ? row.emailNewsletters : base.emailNewsletters,
    smsUpdates: typeof row.smsUpdates === "boolean" ? row.smsUpdates : base.smsUpdates,
  };
}

function normalizePreferredPayment(raw: unknown): "wipay" | "cash" {
  if (raw === "cash") return "cash";
  // legacy paypal → wipay
  if (raw === "wipay" || raw === "paypal") return "wipay";
  return "wipay";
}

function profileDto(row: CustomerRow) {
  const { firstName, lastName } = splitName(row.name || "");
  const savedAddresses = Array.isArray(row.saved_addresses) ? row.saved_addresses : [];
  return {
    id: row.id,
    userId: row.user_id,
    firstName,
    lastName,
    name: row.name,
    phone: row.phone,
    email: row.email,
    defaultAddress: row.default_address,
    defaultLat: row.default_lat,
    defaultLng: row.default_lng,
    savedAddresses,
    accountStatus: row.account_status ?? "active",
    notificationPrefs: mergeNotificationPrefs(row.notification_prefs),
    preferredPaymentMethod: normalizePreferredPayment(row.preferred_payment_method),
    avatarUrl: row.avatar_url || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function requireUser(authHeader: string | undefined, getSupabase: CustomerAccountRoutesDeps["getSupabase"]) {
  if (!authHeader) return { error: "Unauthorized" as const, status: 401 as const };
  const supabase = getSupabase(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" as const, status: 401 as const };
  return { user, supabase };
}

async function ensureCustomer(
  serviceSb: SupabaseClient,
  user: { id: string; email?: string | null; phone?: string | null; user_metadata?: Record<string, unknown> },
): Promise<{ customer: CustomerRow | null; error: string | null }> {
  const { data: existing, error: fetchErr } = await serviceSb
    .from("customers")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchErr) return { customer: null, error: fetchErr.message };
  if (existing) return { customer: existing as CustomerRow, error: null };

  const meta = user.user_metadata ?? {};
  const metaName = typeof meta.name === "string" ? meta.name.trim() : "";
  const first = typeof meta.first_name === "string" ? meta.first_name.trim() : "";
  const last = typeof meta.last_name === "string" ? meta.last_name.trim() : "";
  const name = metaName || [first, last].filter(Boolean).join(" ") ||
    user.email?.split("@")[0] ||
    "Customer";
  const phone = (typeof meta.phone === "string" && meta.phone) || user.phone || null;

  const { data: created, error: insertErr } = await serviceSb
    .from("customers")
    .insert({
      user_id: user.id,
      name,
      phone,
      email: user.email ?? null,
      saved_addresses: [],
    })
    .select("*")
    .single();

  if (insertErr) return { customer: null, error: insertErr.message };
  return { customer: created as CustomerRow, error: null };
}

function defaultAddressFromSaved(saved: z.infer<typeof SavedAddressSchema>[]): {
  default_address: string | null;
  default_lat: number | null;
  default_lng: number | null;
} {
  const def = saved.find((a) => a.isDefault) ?? saved[0];
  if (!def) return { default_address: null, default_lat: null, default_lng: null };
  const parts = [def.line1, def.line2, def.city].filter(Boolean);
  return {
    default_address: parts.join(", "),
    default_lat: def.lat ?? null,
    default_lng: def.lng ?? null,
  };
}

export function registerCustomerAccountRoutes(app: Hono, deps: CustomerAccountRoutesDeps) {
  const { getSupabase, getServiceSupabase } = deps;

  // GET /customer/profile
  app.get("/customer/profile", async (c) => {
    const auth = await requireUser(c.req.header("Authorization"), getSupabase);
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);

    const serviceSb = getServiceSupabase();
    const { customer, error } = await ensureCustomer(serviceSb, auth.user);
    if (error || !customer) return c.json({ error: error || "profile_unavailable" }, 500);

    return c.json({ profile: profileDto(customer) });
  });

  // PATCH /customer/profile — updates delivery.customers + auth user_metadata
  app.patch("/customer/profile", async (c) => {
    const auth = await requireUser(c.req.header("Authorization"), getSupabase);
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);

    const body = await validateBody(c, PatchProfileBody);
    if (body instanceof Response) return body;

    const serviceSb = getServiceSupabase();
    const { customer, error } = await ensureCustomer(serviceSb, auth.user);
    if (error || !customer) return c.json({ error: error || "profile_unavailable" }, 500);

    const firstName = body.firstName?.trim();
    const lastName = body.lastName?.trim();
    const nameFromParts = [firstName, lastName].filter(Boolean).join(" ");
    const name = (body.name?.trim() || nameFromParts || customer.name).trim();

    const update: Record<string, unknown> = {
      name,
      updated_at: new Date().toISOString(),
    };
    if (body.phone !== undefined) update.phone = body.phone.trim() || null;
    if (body.email !== undefined) update.email = body.email.trim() || null;

    if (body.savedAddresses !== undefined) {
      update.saved_addresses = body.savedAddresses;
      Object.assign(update, defaultAddressFromSaved(body.savedAddresses));
    }

    if (body.notificationPrefs !== undefined) {
      update.notification_prefs = mergeNotificationPrefs({
        ...mergeNotificationPrefs(customer.notification_prefs),
        ...body.notificationPrefs,
      });
    }

    if (body.preferredPaymentMethod !== undefined) {
      update.preferred_payment_method = body.preferredPaymentMethod;
    }

    const { data: updated, error: updateErr } = await serviceSb
      .from("customers")
      .update(update)
      .eq("id", customer.id)
      .select("*")
      .single();

    if (updateErr || !updated) {
      return c.json({ error: updateErr?.message || "update_failed" }, 500);
    }

    // Mirror display fields into auth user_metadata (service role)
    try {
      const admin = getAuthAdmin();
      const { data: authUser } = await admin.auth.admin.getUserById(auth.user.id);
      const prev = (authUser?.user?.user_metadata ?? {}) as Record<string, unknown>;
      const { firstName: f, lastName: l } = splitName(name);
      await admin.auth.admin.updateUserById(auth.user.id, {
        user_metadata: {
          ...prev,
          name,
          first_name: firstName ?? f,
          last_name: lastName ?? l,
          phone: (update.phone as string | null) ?? prev.phone ?? null,
        },
      });
    } catch {
      // Profile row is source of truth; metadata sync is best-effort
    }

    return c.json({ profile: profileDto(updated as CustomerRow) });
  });

  // GET /customer/favorites
  app.get("/customer/favorites", async (c) => {
    const auth = await requireUser(c.req.header("Authorization"), getSupabase);
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);

    const serviceSb = getServiceSupabase();
    const { customer, error } = await ensureCustomer(serviceSb, auth.user);
    if (error || !customer) return c.json({ error: error || "profile_unavailable" }, 500);

    const { data, error: favErr } = await serviceSb
      .from("customer_favorites")
      .select("merchant_id, created_at")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false });

    if (favErr) return c.json({ error: favErr.message }, 500);

    return c.json({
      favorites: (data ?? []).map((row) => ({
        merchantId: row.merchant_id as string,
        createdAt: row.created_at as string,
      })),
      merchantIds: (data ?? []).map((row) => row.merchant_id as string),
    });
  });

  // POST /customer/favorites
  app.post("/customer/favorites", async (c) => {
    const auth = await requireUser(c.req.header("Authorization"), getSupabase);
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);

    const body = await validateBody(c, FavoriteBody);
    if (body instanceof Response) return body;

    const serviceSb = getServiceSupabase();
    const { customer, error } = await ensureCustomer(serviceSb, auth.user);
    if (error || !customer) return c.json({ error: error || "profile_unavailable" }, 500);

    const merchantId = await resolveMerchantId(serviceSb, body.merchantId);
    if (!merchantId) return c.json({ error: "merchant_not_found" }, 404);

    const { error: insertErr } = await serviceSb
      .from("customer_favorites")
      .upsert(
        { customer_id: customer.id, merchant_id: merchantId },
        { onConflict: "customer_id,merchant_id", ignoreDuplicates: true },
      );

    if (insertErr) return c.json({ error: insertErr.message }, 500);

    return c.json({ ok: true, merchantId });
  });

  // DELETE /customer/favorites/:merchantId
  app.delete("/customer/favorites/:merchantId", async (c) => {
    const auth = await requireUser(c.req.header("Authorization"), getSupabase);
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);

    const merchantId = c.req.param("merchantId");
    if (!merchantId) return c.json({ error: "merchant_id_required" }, 400);

    const serviceSb = getServiceSupabase();
    const { customer, error } = await ensureCustomer(serviceSb, auth.user);
    if (error || !customer) return c.json({ error: error || "profile_unavailable" }, 500);

    const resolvedId = (await resolveMerchantId(serviceSb, merchantId)) ?? merchantId;

    const { error: delErr } = await serviceSb
      .from("customer_favorites")
      .delete()
      .eq("customer_id", customer.id)
      .eq("merchant_id", resolvedId);

    if (delErr) return c.json({ error: delErr.message }, 500);

    return c.json({ ok: true, merchantId });
  });

  // GET /customer/favorite-items
  app.get("/customer/favorite-items", async (c) => {
    const auth = await requireUser(c.req.header("Authorization"), getSupabase);
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);

    const serviceSb = getServiceSupabase();
    const { customer, error } = await ensureCustomer(serviceSb, auth.user);
    if (error || !customer) return c.json({ error: error || "profile_unavailable" }, 500);

    const { data, error: favErr } = await serviceSb
      .from("customer_favorite_items")
      .select("merchant_id, menu_item_id, created_at")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false });

    if (favErr) return c.json({ error: favErr.message }, 500);

    const items = (data ?? []).map((row) => ({
      merchantId: row.merchant_id as string,
      menuItemId: row.menu_item_id as string,
      createdAt: row.created_at as string,
    }));

    return c.json({
      items,
      itemKeys: items.map((row) => `${row.merchantId}:${row.menuItemId}`),
    });
  });

  // POST /customer/favorite-items
  app.post("/customer/favorite-items", async (c) => {
    const auth = await requireUser(c.req.header("Authorization"), getSupabase);
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);

    const body = await validateBody(c, FavoriteItemBody);
    if (body instanceof Response) return body;

    const serviceSb = getServiceSupabase();
    const { customer, error } = await ensureCustomer(serviceSb, auth.user);
    if (error || !customer) return c.json({ error: error || "profile_unavailable" }, 500);

    const { data: merchant } = await serviceSb
      .from("merchants")
      .select("id")
      .eq("id", body.merchantId)
      .maybeSingle();
    if (!merchant) return c.json({ error: "merchant_not_found" }, 404);

    const { error: insertErr } = await serviceSb
      .from("customer_favorite_items")
      .upsert(
        {
          customer_id: customer.id,
          merchant_id: body.merchantId,
          menu_item_id: body.menuItemId,
        },
        { onConflict: "customer_id,merchant_id,menu_item_id", ignoreDuplicates: true },
      );

    if (insertErr) return c.json({ error: insertErr.message }, 500);

    return c.json({
      ok: true,
      merchantId: body.merchantId,
      menuItemId: body.menuItemId,
      itemKey: `${body.merchantId}:${body.menuItemId}`,
    });
  });

  // DELETE /customer/favorite-items/:merchantId/:menuItemId
  app.delete("/customer/favorite-items/:merchantId/:menuItemId", async (c) => {
    const auth = await requireUser(c.req.header("Authorization"), getSupabase);
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);

    const merchantId = c.req.param("merchantId");
    const menuItemId = c.req.param("menuItemId");
    if (!merchantId || !menuItemId) {
      return c.json({ error: "merchant_id_and_menu_item_id_required" }, 400);
    }

    const serviceSb = getServiceSupabase();
    const { customer, error } = await ensureCustomer(serviceSb, auth.user);
    if (error || !customer) return c.json({ error: error || "profile_unavailable" }, 500);

    const { error: delErr } = await serviceSb
      .from("customer_favorite_items")
      .delete()
      .eq("customer_id", customer.id)
      .eq("merchant_id", merchantId)
      .eq("menu_item_id", menuItemId);

    if (delErr) return c.json({ error: delErr.message }, 500);

    return c.json({ ok: true, merchantId, menuItemId });
  });

  // POST /customer/avatar — magic-byte check, then service-role write to customer-avatars
  app.post("/customer/avatar", async (c) => {
    const auth = await requireUser(c.req.header("Authorization"), getSupabase);
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);

    const form = await c.req.parseBody();
    const file = form.file;
    if (!(file instanceof File)) {
      return c.json({ error: "file is required" }, 400);
    }
    if (file.size > AVATAR_MAX_BYTES) {
      return c.json({ error: "Photo must be 2MB or smaller" }, 413);
    }

    const buffer = new Uint8Array(await file.arrayBuffer());
    const detected = detectFileMagicBytes(buffer);
    if (!detected || !IMAGE_MIMES.has(detected)) {
      return c.json({ error: "Use a JPEG, PNG, or WebP photo" }, 400);
    }

    const serviceSb = getServiceSupabase();
    const { customer, error } = await ensureCustomer(serviceSb, auth.user);
    if (error || !customer) return c.json({ error: error || "profile_unavailable" }, 500);

    const path = `${auth.user.id}/avatars/${crypto.randomUUID()}.${extForMime(detected)}`;
    const storage = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { error: uploadError } = await storage.storage.from(AVATAR_BUCKET).upload(path, buffer, {
      contentType: detected,
      cacheControl: "3600",
      upsert: false,
    });
    if (uploadError) {
      return c.json({ error: uploadError.message }, 500);
    }

    const previousPath = customer.avatar_path;
    if (previousPath && previousPath.startsWith(`${auth.user.id}/`)) {
      await storage.storage.from(AVATAR_BUCKET).remove([previousPath]);
    }

    const { data: { publicUrl } } = storage.storage.from(AVATAR_BUCKET).getPublicUrl(path);
    const { data: updated, error: updateErr } = await serviceSb
      .from("customers")
      .update({ avatar_url: publicUrl, avatar_path: path })
      .eq("id", customer.id)
      .select("*")
      .single();

    if (updateErr || !updated) {
      return c.json({ error: updateErr?.message || "update_failed" }, 500);
    }

    try {
      const admin = getAuthAdmin();
      const { data: authUser } = await admin.auth.admin.getUserById(auth.user.id);
      const prev = (authUser?.user?.user_metadata ?? {}) as Record<string, unknown>;
      await admin.auth.admin.updateUserById(auth.user.id, {
        user_metadata: { ...prev, avatar_url: publicUrl },
      });
    } catch {
      // Profile row is source of truth
    }

    return c.json({ profile: profileDto(updated as CustomerRow) }, 201);
  });

  // POST /customer/issue-photo — private evidence; signed URL for preview only
  app.post("/customer/issue-photo", async (c) => {
    const auth = await requireUser(c.req.header("Authorization"), getSupabase);
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);

    const form = await c.req.parseBody();
    const file = form.file;
    if (!(file instanceof File)) {
      return c.json({ error: "file is required" }, 400);
    }
    if (file.size > AVATAR_MAX_BYTES) {
      return c.json({ error: "Photo must be 2MB or smaller" }, 413);
    }

    const buffer = new Uint8Array(await file.arrayBuffer());
    const detected = detectFileMagicBytes(buffer);
    if (!detected || !IMAGE_MIMES.has(detected)) {
      return c.json({ error: "Use a JPEG, PNG, or WebP photo" }, 400);
    }

    const path = `${auth.user.id}/issues/${crypto.randomUUID()}.${extForMime(detected)}`;
    const storage = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { error: uploadError } = await storage.storage.from(ISSUE_PHOTO_BUCKET).upload(path, buffer, {
      contentType: detected,
      cacheControl: "3600",
      upsert: false,
    });
    if (uploadError) {
      return c.json({ error: uploadError.message }, 500);
    }

    const { data: signed, error: signErr } = await storage.storage
      .from(ISSUE_PHOTO_BUCKET)
      .createSignedUrl(path, 60 * 60 * 24 * 7);
    if (signErr || !signed?.signedUrl) {
      return c.json({ error: signErr?.message || "Could not sign photo" }, 500);
    }

    return c.json({ path, signedUrl: signed.signedUrl }, 201);
  });
}
