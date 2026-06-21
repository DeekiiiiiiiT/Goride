/**
 * Partner merchant application: maps config, geo, documents, bank, extended merchant create.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";

type SupabaseClient = ReturnType<typeof createDeliveryClient>;

function createDeliveryClient(authHeader: string | null) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (authHeader) {
    return createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      db: { schema: "delivery" },
    });
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    db: { schema: "delivery" },
  });
}

function getServiceSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "delivery" } },
  );
}

function getPaymentsSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "payments" } },
  );
}

function getStorageSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function getMerchantForUser(supabase: SupabaseClient, userId: string) {
  const { data: merchant, error } = await supabase
    .from("merchants")
    .select("*")
    .eq("owner_id", userId)
    .maybeSingle();
  if (error || !merchant) return null;
  return merchant as Record<string, unknown>;
}

function mapsApiKey() {
  return Deno.env.get("GOOGLE_MAPS_API_KEY_MERCHANT") ||
    Deno.env.get("GOOGLE_MAPS_API_KEY") ||
    "";
}

function buildAddress(body: Record<string, unknown>): string {
  if (typeof body.address === "string" && body.address.trim()) {
    return body.address.trim();
  }
  const parts = [
    body.streetAddress,
    body.city,
    body.postalCode,
  ].filter((p) => typeof p === "string" && p.trim());
  return parts.join(", ");
}

function parsePrepTime(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const digits = parseInt(value.replace(/\D/g, ""), 10);
    if (Number.isFinite(digits)) return digits;
  }
  return 30;
}

function parseDeliveryRadius(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const digits = parseInt(value.replace(/\D/g, ""), 10);
    if (Number.isFinite(digits)) return digits;
  }
  return 10;
}

function merchantPayloadFromBody(body: Record<string, unknown>, userId: string) {
  const cuisineTypes = Array.isArray(body.cuisineTypes)
    ? (body.cuisineTypes as string[]).filter(Boolean).slice(0, 3)
    : [];
  const primaryCuisine = typeof body.cuisineType === "string" && body.cuisineType
    ? body.cuisineType
    : cuisineTypes[0] || null;

  const name = String(body.name || "").trim();
  const slugBase = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

  return {
    owner_id: userId,
    name,
    slug: `${slugBase}-${Date.now().toString(36)}`,
    description: body.description || null,
    address: buildAddress(body),
    lat: body.lat ?? null,
    lng: body.lng ?? null,
    phone: body.phone || null,
    email: body.email || null,
    cuisine_type: primaryCuisine,
    cuisine_types: cuisineTypes,
    logo_url: body.logoUrl || null,
    cover_image_url: body.coverImageUrl || null,
    delivery_radius_km: parseDeliveryRadius(body.deliveryRadiusKm ?? body.deliveryRadius),
    avg_prep_time_mins: parsePrepTime(body.avgPrepTimeMins ?? body.avgPrepTime),
    business_type: body.businessType || null,
    business_registration_number: body.businessRegistrationNumber || null,
    tax_id: body.taxId || null,
    owner_full_name: body.ownerFullName || body.ownerName || null,
    city: body.city || null,
    postal_code: body.postalCode || null,
    website: body.website || null,
    verification_status: "pending",
    submitted_at: new Date().toISOString(),
  };
}

const MERCHANT_UPDATE_ALLOWLIST = new Set([
  "name",
  "description",
  "address",
  "lat",
  "lng",
  "phone",
  "email",
  "cuisine_type",
  "cuisine_types",
  "logo_url",
  "cover_image_url",
  "delivery_radius_km",
  "avg_prep_time_mins",
  "business_type",
  "business_registration_number",
  "tax_id",
  "owner_full_name",
  "city",
  "postal_code",
  "website",
  "is_accepting_orders",
  "notification_settings",
]);

async function logMerchantAudit(
  merchantId: string,
  action: string,
  actorId: string,
  extra: Record<string, unknown> = {},
) {
  const sb = getServiceSupabase();
  await sb.from("merchant_audit_log").insert({
    merchant_id: merchantId,
    actor_id: actorId,
    action,
    ...extra,
  });
}

export function registerMerchantApplicationRoutes(app: Hono) {
  app.get("/maps-config", (c) => {
    const apiKey = mapsApiKey();
    if (!apiKey) {
      return c.json({ error: "Maps API not configured" }, 503);
    }
    return c.json({ apiKey });
  });

  app.post("/geo/geocode", async (c) => {
    const apiKey = mapsApiKey();
    if (!apiKey) return c.json({ error: "Maps API not configured" }, 503);
    const body = await c.req.json().catch(() => ({}));
    const address = String(body.address || "").trim();
    if (!address) return c.json({ error: "Address is required" }, 400);

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&region=jm&key=${apiKey}`,
    );
    const data = await response.json();
    if (data.status !== "OK" || !data.results?.[0]) {
      return c.json({ error: `Geocoding failed: ${data.status}` }, 400);
    }
    const result = data.results[0];
    const location = result.geometry.location;
    let city = "";
    let parish = "";
    let streetAddress = "";
    let postalCode = "";
    for (const component of result.address_components || []) {
      const types: string[] = component.types || [];
      if (types.includes("locality")) city = component.long_name;
      if (types.includes("administrative_area_level_1")) parish = component.long_name;
      if (types.includes("postal_code")) postalCode = component.long_name;
      if (types.includes("route")) streetAddress = component.long_name;
      if (types.includes("street_number")) {
        streetAddress = `${component.long_name} ${streetAddress}`.trim();
      }
    }
    return c.json({
      lat: location.lat,
      lng: location.lng,
      formattedAddress: result.formatted_address,
      streetAddress: streetAddress || result.formatted_address.split(",")[0],
      city: city || parish,
      parish,
      postalCode,
    });
  });

  app.post("/geo/reverse-geocode", async (c) => {
    const apiKey = mapsApiKey();
    if (!apiKey) return c.json({ error: "Maps API not configured" }, 503);
    const body = await c.req.json().catch(() => ({}));
    const lat = body.lat;
    const lng = body.lng;
    if (lat == null || lng == null) return c.json({ error: "lat and lng are required" }, 400);

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`,
    );
    const data = await response.json();
    if (data.status !== "OK" || !data.results?.length) {
      return c.json({ error: `Reverse geocoding failed: ${data.status}` }, 400);
    }

    const looksLikePlusCode = (addr: string) =>
      /^[23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]+/i.test(addr.trim());

    let primaryResult = data.results.find((r: { formatted_address?: string; types?: string[] }) =>
      !r.types?.includes("plus_code") && !looksLikePlusCode(r.formatted_address || ""),
    ) || data.results[0];

    let city = "";
    let parish = "";
    let streetAddress = "";
    let postalCode = "";
    for (const component of primaryResult.address_components || []) {
      const types: string[] = component.types || [];
      if (types.includes("locality")) city = component.long_name;
      if (types.includes("administrative_area_level_1")) parish = component.long_name;
      if (types.includes("postal_code")) postalCode = component.long_name;
      if (types.includes("route")) streetAddress = component.long_name;
      if (types.includes("street_number")) {
        streetAddress = `${component.long_name} ${streetAddress}`.trim();
      }
    }

    return c.json({
      lat: Number(lat),
      lng: Number(lng),
      formattedAddress: primaryResult.formatted_address,
      streetAddress: streetAddress || primaryResult.formatted_address.split(",")[0],
      city: city || parish,
      parish,
      postalCode,
    });
  });

  app.post("/merchants", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

    const supabase = createDeliveryClient(authHeader);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const body = await c.req.json().catch(() => ({}));
    if (!body.name || !String(body.name).trim()) {
      return c.json({ error: "Restaurant name is required" }, 400);
    }

    const existing = await getMerchantForUser(supabase, user.id);
    const payload = merchantPayloadFromBody(body as Record<string, unknown>, user.id);

    let merchant: Record<string, unknown>;
    if (existing) {
      const status = String(existing.verification_status || "pending");
      if (!["pending", "rejected", "docs_requested"].includes(status)) {
        return c.json({ error: "Merchant application already submitted" }, 409);
      }
      const { data, error } = await supabase
        .from("merchants")
        .update(payload)
        .eq("id", existing.id)
        .select()
        .single();
      if (error) return c.json({ error: error.message }, 500);
      merchant = data as Record<string, unknown>;
      await logMerchantAudit(merchant.id as string, "application_updated", user.id, {
        from_status: status,
        to_status: "pending",
      });
    } else {
      const { data, error } = await supabase
        .from("merchants")
        .insert(payload)
        .select()
        .single();
      if (error) return c.json({ error: error.message }, 500);
      merchant = data as Record<string, unknown>;

      await supabase.from("merchant_team_members").insert({
        merchant_id: merchant.id,
        user_id: user.id,
        email: body.email || user.email,
        name: body.ownerFullName || body.ownerName || user.email?.split("@")[0] || "Owner",
        role: "admin",
        permissions: ["orders", "menu", "analytics", "payouts"],
        is_owner: true,
      });

      await logMerchantAudit(merchant.id as string, "application_submitted", user.id, {
        to_status: "pending",
      });
    }

    return c.json({ merchant }, existing ? 200 : 201);
  });

  app.put("/merchants/:id", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

    const supabase = createDeliveryClient(authHeader);
    const { id } = c.req.param();
    const body = await c.req.json().catch(() => ({}));

    const update: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      if (MERCHANT_UPDATE_ALLOWLIST.has(key)) {
        update[key] = value;
      }
    }
    if (Object.keys(update).length === 0) {
      return c.json({ error: "No valid fields to update" }, 400);
    }

    const { data, error } = await supabase
      .from("merchants")
      .update(update)
      .eq("id", id)
      .select()
      .single();

    if (error) return c.json({ error: error.message }, 500);
    return c.json({ merchant: data });
  });

  app.get("/merchant/documents", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const supabase = createDeliveryClient(authHeader);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const merchant = await getMerchantForUser(supabase, user.id);
    if (!merchant) return c.json({ documents: [] });

    const { data, error } = await supabase
      .from("merchant_documents")
      .select("*")
      .eq("merchant_id", merchant.id)
      .order("uploaded_at", { ascending: false });
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ documents: data || [] });
  });

  app.post("/merchant/documents", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const supabase = createDeliveryClient(authHeader);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const merchant = await getMerchantForUser(supabase, user.id);
    if (!merchant) {
      return c.json({ error: "Create merchant profile before uploading documents" }, 400);
    }

    const form = await c.req.parseBody();
    const file = form.file;
    const docType = String(form.docType || "");
    const allowedTypes = new Set(["id_front", "id_back", "proof_of_business"]);
    if (!allowedTypes.has(docType)) {
      return c.json({ error: "Invalid docType" }, 400);
    }
    if (!(file instanceof File)) {
      return c.json({ error: "file is required" }, 400);
    }
    if (file.size > 10 * 1024 * 1024) {
      return c.json({ error: "File must be 10MB or smaller" }, 400);
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const storagePath = `${merchant.id}/${docType}-${Date.now()}.${ext}`;
    const storage = getStorageSupabase();
    const buffer = await file.arrayBuffer();

    const { error: uploadError } = await storage.storage
      .from("merchant-documents")
      .upload(storagePath, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: true,
      });
    if (uploadError) {
      return c.json({ error: uploadError.message }, 500);
    }

    const serviceSb = getServiceSupabase();
    const { data: doc, error: docError } = await serviceSb
      .from("merchant_documents")
      .upsert({
        merchant_id: merchant.id,
        doc_type: docType,
        file_path: storagePath,
        status: "pending",
        rejection_reason: null,
        uploaded_at: new Date().toISOString(),
      }, { onConflict: "merchant_id,doc_type" })
      .select()
      .single();
    if (docError) return c.json({ error: docError.message }, 500);

    await logMerchantAudit(merchant.id as string, "document_uploaded", user.id, {
      notes: docType,
    });

    return c.json({ document: doc }, 201);
  });

  app.get("/merchant/bank-account", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const supabase = createDeliveryClient(authHeader);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const merchant = await getMerchantForUser(supabase, user.id);
    if (!merchant) return c.json({ bankAccount: null });

    const payments = getPaymentsSupabase();
    const { data, error } = await payments
      .from("merchant_bank_accounts")
      .select("id, merchant_id, bank_name, account_holder_name, account_last4, routing_number_last4, account_type, is_default, is_verified")
      .eq("merchant_id", merchant.id)
      .eq("is_default", true)
      .maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ bankAccount: data });
  });

  app.post("/merchant/bank-account", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const supabase = createDeliveryClient(authHeader);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const merchant = await getMerchantForUser(supabase, user.id);
    if (!merchant) return c.json({ error: "Merchant not found" }, 404);

    const body = await c.req.json().catch(() => ({}));
    const bankName = String(body.bankName || "").trim();
    const accountHolderName = String(body.accountHolderName || "").trim();
    const accountNumber = String(body.accountNumber || "").replace(/\D/g, "");
    const routingNumber = String(body.routingNumber || "").replace(/\D/g, "");
    const accountType = body.accountType === "savings" ? "savings" : "checking";

    if (!bankName || !accountHolderName || accountNumber.length < 4) {
      return c.json({ error: "Invalid bank account details" }, 400);
    }

    const accountLast4 = accountNumber.slice(-4);
    const routingLast4 = routingNumber ? routingNumber.slice(-4) : null;

    const payments = getPaymentsSupabase();
    await payments
      .from("merchant_bank_accounts")
      .update({ is_default: false })
      .eq("merchant_id", merchant.id);

    const { data, error } = await payments
      .from("merchant_bank_accounts")
      .insert({
        merchant_id: merchant.id,
        bank_name: bankName,
        account_holder_name: accountHolderName,
        account_last4: accountLast4,
        routing_number_last4: routingLast4,
        account_type: accountType,
        is_default: true,
        is_verified: false,
      })
      .select("id, merchant_id, bank_name, account_holder_name, account_last4, routing_number_last4, account_type, is_default, is_verified")
      .single();
    if (error) return c.json({ error: error.message }, 500);

    await logMerchantAudit(merchant.id as string, "bank_account_added", user.id);

    return c.json({ bankAccount: data }, 201);
  });

  app.get("/merchant/notification-settings", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const supabase = createDeliveryClient(authHeader);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const merchant = await getMerchantForUser(supabase, user.id);
    if (!merchant) return c.json({ settings: {} });
    return c.json({ settings: merchant.notification_settings || {} });
  });

  app.put("/merchant/notification-settings", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const supabase = createDeliveryClient(authHeader);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const merchant = await getMerchantForUser(supabase, user.id);
    if (!merchant) return c.json({ error: "Merchant not found" }, 404);

    const body = await c.req.json().catch(() => ({}));
    const settings = typeof body.settings === "object" && body.settings ? body.settings : body;

    const { data, error } = await supabase
      .from("merchants")
      .update({ notification_settings: settings })
      .eq("id", merchant.id)
      .select("notification_settings")
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ settings: data?.notification_settings || {} });
  });

  app.get("/merchant/application-status", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const supabase = createDeliveryClient(authHeader);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const merchant = await getMerchantForUser(supabase, user.id);
    if (!merchant) {
      return c.json({
        hasMerchant: false,
        checklist: {
          profileComplete: false,
          documentsComplete: false,
          bankComplete: false,
          hoursComplete: false,
          menuComplete: false,
        },
      });
    }

    const serviceSb = getServiceSupabase();
    const payments = getPaymentsSupabase();

    const [{ data: documents }, { data: hours }, { data: items }, { data: bank }] = await Promise.all([
      serviceSb.from("merchant_documents").select("doc_type, status").eq("merchant_id", merchant.id),
      serviceSb.from("merchant_hours").select("id").eq("merchant_id", merchant.id),
      serviceSb.from("menu_items").select("id").eq("merchant_id", merchant.id).limit(5),
      payments.from("merchant_bank_accounts").select("id").eq("merchant_id", merchant.id).eq("is_default", true).maybeSingle(),
    ]);

    const docTypes = new Set((documents || []).map((d: { doc_type: string }) => d.doc_type));
    const documentsComplete = ["id_front", "id_back", "proof_of_business"].every((t) => docTypes.has(t));
    const profileComplete = Boolean(
      merchant.name && merchant.address && merchant.lat != null && merchant.lng != null,
    );

    return c.json({
      hasMerchant: true,
      merchant: {
        id: merchant.id,
        verification_status: merchant.verification_status,
        verification_notes: merchant.verification_notes,
        rejection_reason: merchant.rejection_reason,
      },
      checklist: {
        profileComplete,
        documentsComplete,
        bankComplete: Boolean(bank),
        hoursComplete: (hours || []).length > 0,
        menuComplete: (items || []).length >= 5,
      },
      documents: documents || [],
    });
  });
}

export async function extendAdminMerchantDetail(
  merchantId: string,
): Promise<{ documents: unknown[]; bankAccount: unknown | null }> {
  const serviceSb = getServiceSupabase();
  const payments = getPaymentsSupabase();
  const storage = getStorageSupabase();

  const [{ data: documents }, { data: bankAccount }] = await Promise.all([
    serviceSb.from("merchant_documents").select("*").eq("merchant_id", merchantId),
    payments
      .from("merchant_bank_accounts")
      .select("id, bank_name, account_holder_name, account_last4, routing_number_last4, account_type, is_default, is_verified")
      .eq("merchant_id", merchantId)
      .eq("is_default", true)
      .maybeSingle(),
  ]);

  const docsWithUrls = await Promise.all(
    (documents || []).map(async (doc: Record<string, unknown>) => {
      const filePath = doc.file_path as string;
      const { data: signed } = await storage.storage
        .from("merchant-documents")
        .createSignedUrl(filePath, 3600);
      return { ...doc, signedUrl: signed?.signedUrl || null };
    }),
  );

  return { documents: docsWithUrls, bankAccount: bankAccount || null };
}
