/**
 * Partner merchant application: maps config, geo, documents, bank, extended merchant create.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import {
  buildDraftMerchantInsert,
  isValidWizardStepKey,
  mergeOnboardingDraft,
  merchantPayloadFromBody,
  mirrorDraftScalarsToColumns,
  sanitizeOnboardingDraft,
  wizardStepFromKey,
} from "./partnerOnboarding.ts";
import { fetchBusinessTypeMetadataById } from "./admin/onboardingConfigRoutes.ts";
import {
  allowedDocumentTypesForMerchant,
  rowToBusinessTypeMetadata,
  verticalSnapshotFromMetadata,
} from "./verticalMetadata.ts";
import {
  computeSetupChecklist,
  computeApplicationReviewChecklist,
  persistMerchantHoursFromDraft,
} from "./admin/merchantSetupProgress.ts";
import { merchantGoLiveRuleFromRow } from "./verticalMetadata.ts";

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
  app.post("/partner/bootstrap", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

    const supabase = createDeliveryClient(authHeader);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const existing = await getMerchantForUser(supabase, user.id);
    if (existing) {
      return c.json({ merchant: existing, created: false });
    }

    const sb = getServiceSupabase();
    const insert = buildDraftMerchantInsert(user.id, user.email);
    const { data, error } = await sb
      .from("merchants")
      .insert(insert)
      .select()
      .single();
    if (error) return c.json({ error: error.message }, 500);

    await logMerchantAudit(data.id as string, "onboarding_draft_created", user.id);
    return c.json({ merchant: data, created: true }, 201);
  });

  app.patch("/partner/onboarding-draft", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

    const supabase = createDeliveryClient(authHeader);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const wizardStepKey = body.wizardStepKey;
    if (!isValidWizardStepKey(wizardStepKey)) {
      return c.json({ error: "Invalid wizardStepKey" }, 400);
    }

    const merchant = await getMerchantForUser(supabase, user.id);
    if (!merchant) {
      return c.json({ error: "No merchant draft found. Call POST /partner/bootstrap first." }, 404);
    }

    if (merchant.onboarding_status !== "draft") {
      return c.json({ error: "Application already submitted" }, 409);
    }

    const draftPatch = sanitizeOnboardingDraft(body.draft);
    const mergedDraft = mergeOnboardingDraft(
      merchant.onboarding_draft as Record<string, unknown>,
      draftPatch,
    );
    const wizardStep = typeof body.wizardStep === "number"
      ? body.wizardStep
      : wizardStepFromKey(wizardStepKey);
    const now = new Date().toISOString();

    const update = {
      onboarding_draft: mergedDraft,
      wizard_step: wizardStep,
      wizard_step_key: wizardStepKey,
      last_onboarding_activity_at: now,
      ...mirrorDraftScalarsToColumns(mergedDraft),
    };

    const sb = getServiceSupabase();
    const { data, error } = await sb
      .from("merchants")
      .update(update)
      .eq("id", merchant.id)
      .select()
      .single();
    if (error) return c.json({ error: error.message }, 500);

    return c.json({ merchant: data });
  });

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

    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const name = String(body.name || body.restaurantName || "").trim();
    if (!name) {
      return c.json({ error: "Restaurant name is required" }, 400);
    }

    const existing = await getMerchantForUser(supabase, user.id);
    const businessTypeId = String(body.businessType || existing?.business_type || "");
    const typeRow = businessTypeId
      ? await fetchBusinessTypeMetadataById(businessTypeId)
      : null;
    const typeMeta = typeRow
      ? rowToBusinessTypeMetadata(typeRow as unknown as Record<string, unknown>)
      : rowToBusinessTypeMetadata(null);
    const verticalSnapshot = verticalSnapshotFromMetadata(typeMeta);
    const payload = merchantPayloadFromBody({ ...body, name }, user.id, verticalSnapshot);
    const sb = getServiceSupabase();

    let merchant: Record<string, unknown>;
    let created = false;

    if (existing) {
      const onboardingStatus = String(existing.onboarding_status || "submitted");
      const verificationStatus = String(existing.verification_status || "pending");

      if (onboardingStatus === "draft") {
        const { data, error } = await sb
          .from("merchants")
          .update(payload)
          .eq("id", existing.id)
          .select()
          .single();
        if (error) return c.json({ error: error.message }, 500);
        merchant = data as Record<string, unknown>;
      } else if (!["pending", "rejected", "docs_requested"].includes(verificationStatus)) {
        return c.json({ error: "Merchant application already submitted" }, 409);
      } else {
        const { data, error } = await sb
          .from("merchants")
          .update(payload)
          .eq("id", existing.id)
          .select()
          .single();
        if (error) return c.json({ error: error.message }, 500);
        merchant = data as Record<string, unknown>;
        await logMerchantAudit(merchant.id as string, "application_updated", user.id, {
          from_status: verificationStatus,
          to_status: "pending",
        });
      }
    } else {
      const { data, error } = await sb
        .from("merchants")
        .insert(payload)
        .select()
        .single();
      if (error) return c.json({ error: error.message }, 500);
      merchant = data as Record<string, unknown>;
      created = true;
    }

    const { data: teamRow } = await sb
      .from("merchant_team_members")
      .select("id")
      .eq("merchant_id", merchant.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!teamRow) {
      await sb.from("merchant_team_members").insert({
        merchant_id: merchant.id,
        user_id: user.id,
        email: body.email || user.email,
        name: body.ownerFullName || body.ownerName || user.email?.split("@")[0] || "Owner",
        role: "admin",
        permissions: ["orders", "menu", "analytics", "payouts"],
        is_owner: true,
      });
    }

    if (created || String(existing?.onboarding_status) === "draft") {
      await logMerchantAudit(merchant.id as string, "application_submitted", user.id, {
        to_status: "pending",
      });
    }

    if (existing?.onboarding_status === "draft" && existing.onboarding_draft) {
      try {
        await persistMerchantHoursFromDraft(sb, merchant.id as string, existing.onboarding_draft);
      } catch {
        // Hours sync is best-effort; draft still holds the schedule.
      }
    }

    return c.json({ merchant }, created ? 201 : 200);
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
    const businessTypeId = String(merchant.business_type || "");
    const typeRow = businessTypeId
      ? await fetchBusinessTypeMetadataById(businessTypeId)
      : null;
    const typeMeta = typeRow
      ? rowToBusinessTypeMetadata(typeRow as unknown as Record<string, unknown>)
      : rowToBusinessTypeMetadata(null);
    const enableRegulated = Deno.env.get("ENABLE_REGULATED_VERTICAL_UPLOADS") === "true";
    const allowedTypes = allowedDocumentTypesForMerchant(typeMeta, enableRegulated);
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
          catalogComplete: false,
        },
      });
    }

    const serviceSb = getServiceSupabase();
    const payments = getPaymentsSupabase();

    const [{ data: documents }, { data: hours }, { count: menuItemCount }, { data: bank }] = await Promise.all([
      serviceSb.from("merchant_documents").select("doc_type, status").eq("merchant_id", merchant.id),
      serviceSb.from("merchant_hours").select("id").eq("merchant_id", merchant.id),
      serviceSb.from("menu_items").select("id", { count: "exact", head: true }).eq("merchant_id", merchant.id),
      payments.from("merchant_bank_accounts").select("id").eq("merchant_id", merchant.id).eq("is_default", true).maybeSingle(),
    ]);

    let hoursCount = (hours || []).length;
    if (hoursCount === 0 && merchant.onboarding_draft) {
      try {
        await persistMerchantHoursFromDraft(serviceSb, merchant.id, merchant.onboarding_draft);
        const { data: syncedHours } = await serviceSb
          .from("merchant_hours")
          .select("id")
          .eq("merchant_id", merchant.id);
        hoursCount = (syncedHours || []).length;
      } catch {
        // Fall back to draft-based review checklist below.
      }
    }

    const businessTypeId = String(merchant.business_type || "");
    const typeRow = businessTypeId
      ? await fetchBusinessTypeMetadataById(businessTypeId)
      : null;
    const typeMeta = typeRow
      ? rowToBusinessTypeMetadata(typeRow as unknown as Record<string, unknown>)
      : rowToBusinessTypeMetadata(null);

    const docTypes = (documents || []).map((d: { doc_type: string }) => d.doc_type);
    const checklist = computeSetupChecklist({
      merchant: merchant as Record<string, unknown>,
      documentTypes: docTypes,
      hoursCount,
      menuItemCount: menuItemCount ?? 0,
      hasBank: Boolean(bank),
      requiredDocumentTypes: typeMeta.required_document_types,
    });
    const reviewChecklist = computeApplicationReviewChecklist({
      merchant: merchant as Record<string, unknown>,
      documentTypes: docTypes,
      hoursCount,
      requiredDocumentTypes: typeMeta.required_document_types,
    });

    return c.json({
      hasMerchant: true,
      merchant: {
        id: merchant.id,
        verification_status: merchant.verification_status,
        onboarding_status: merchant.onboarding_status,
        wizard_step: merchant.wizard_step,
        wizard_step_key: merchant.wizard_step_key,
        verification_notes: merchant.verification_notes,
        rejection_reason: merchant.rejection_reason,
        vertical_type: merchant.vertical_type,
        fulfillment_type: merchant.fulfillment_type,
        go_live_rule: merchant.go_live_rule ?? merchantGoLiveRuleFromRow(merchant as Record<string, unknown>),
      },
      checklist,
      reviewChecklist,
      documents: documents || [],
    });
  });

  app.get("/merchant/settings", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const supabase = createDeliveryClient(authHeader);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const merchant = await getMerchantForUser(supabase, user.id);
    if (!merchant) {
      return c.json({
        settings: {
          allows_pickup: true,
          allows_scheduled: true,
          allows_doubledash: false,
        },
      });
    }

    const serviceSb = getServiceSupabase();
    const { data } = await serviceSb
      .from("merchant_settings")
      .select("allows_pickup, allows_scheduled, allows_doubledash")
      .eq("merchant_id", merchant.id)
      .maybeSingle();

    return c.json({
      settings: data ?? {
        allows_pickup: true,
        allows_scheduled: true,
        allows_doubledash: false,
      },
    });
  });

  app.put("/merchant/settings", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const supabase = createDeliveryClient(authHeader);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const merchant = await getMerchantForUser(supabase, user.id);
    if (!merchant) return c.json({ error: "Merchant not found" }, 404);

    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const patch = {
      merchant_id: merchant.id,
      allows_pickup: body.allows_pickup !== undefined ? Boolean(body.allows_pickup) : true,
      allows_scheduled: body.allows_scheduled !== undefined ? Boolean(body.allows_scheduled) : true,
      allows_doubledash: body.allows_doubledash !== undefined ? Boolean(body.allows_doubledash) : false,
    };

    const serviceSb = getServiceSupabase();
    const { data, error } = await serviceSb
      .from("merchant_settings")
      .upsert(patch, { onConflict: "merchant_id" })
      .select("allows_pickup, allows_scheduled, allows_doubledash")
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ settings: data });
  });

  app.post("/merchants/:id/catalog/import", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const supabase = createDeliveryClient(authHeader);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const { id } = c.req.param();
    const merchant = await getMerchantForUser(supabase, user.id);
    if (!merchant || String(merchant.id) !== id) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const rows = Array.isArray(body.items) ? body.items as Record<string, unknown>[] : [];
    if (!rows.length) return c.json({ error: "items array is required" }, 400);
    if (rows.length > 500) return c.json({ error: "Maximum 500 items per import" }, 400);

    const serviceSb = getServiceSupabase();
    const inserts = rows.map((row, index) => ({
      merchant_id: id,
      name: String(row.name || "").trim(),
      description: row.description ? String(row.description) : null,
      price: Number(row.price) || 0,
      sku: row.sku ? String(row.sku) : null,
      upc: row.upc ? String(row.upc) : null,
      unit: row.unit ? String(row.unit) : null,
      stock_qty: row.stock_qty != null ? Number(row.stock_qty) : null,
      is_available: row.is_available !== false,
      sort_order: index,
    })).filter((row) => row.name);

    if (!inserts.length) return c.json({ error: "No valid items to import" }, 400);

    const { error } = await serviceSb.from("menu_items").insert(inserts);
    if (error) return c.json({ error: error.message }, 500);

    return c.json({ imported: inserts.length });
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
