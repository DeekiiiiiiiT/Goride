/**
 * Partner onboarding draft lifecycle (server-side wizard progress).
 */

export const WIZARD_STEPS = [
  { id: 1, key: "restaurant-info", label: "Info" },
  { id: 2, key: "categories", label: "Categories" },
  { id: 3, key: "location", label: "Location" },
  { id: 4, key: "business-details", label: "Details" },
  { id: 5, key: "contact-hours", label: "Contact" },
  { id: 6, key: "verification", label: "Verify" },
  { id: 7, key: "bank-details", label: "Payouts" },
] as const;

export type WizardStepKey = (typeof WIZARD_STEPS)[number]["key"];

const WIZARD_STEP_KEYS = new Set<string>(WIZARD_STEPS.map((s) => s.key));

const DRAFT_JSON_ALLOWLIST = new Set([
  "restaurantName",
  "phone",
  "email",
  "businessType",
  "cuisineTypes",
  "inventoryCategories",
  "location",
  "streetAddress",
  "city",
  "postalCode",
  "addressSearch",
  "businessRegistrationNumber",
  "taxId",
  "avgPrepTime",
  "deliveryRadius",
  "ownerFullName",
  "description",
  "website",
  "logoUrl",
  "coverImageUrl",
  "bankName",
  "accountHolderName",
  "accountType",
  "idFrontDoc",
  "idBackDoc",
  "proofOfBusinessDoc",
  "hours",
]);

export function wizardStepFromKey(key: string): number {
  const found = WIZARD_STEPS.find((s) => s.key === key);
  return found?.id ?? 1;
}

export function wizardKeyFromStep(step: number): WizardStepKey {
  const found = WIZARD_STEPS.find((s) => s.id === step);
  return found?.key ?? "restaurant-info";
}

export function wizardStepLabel(key: string | null | undefined): string {
  const found = WIZARD_STEPS.find((s) => s.key === key);
  return found?.label ?? "Info";
}

export function isValidWizardStepKey(key: unknown): key is WizardStepKey {
  return typeof key === "string" && WIZARD_STEP_KEYS.has(key);
}

export function sanitizeOnboardingDraft(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!DRAFT_JSON_ALLOWLIST.has(key)) continue;
    if (key.endsWith("File")) continue;
    out[key] = value;
  }
  return out;
}

export function mergeOnboardingDraft(
  existing: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return { ...(existing ?? {}), ...patch };
}

export function draftSlugForUser(userId: string): string {
  const prefix = userId.replace(/-/g, "").slice(0, 8);
  return `draft-${prefix}-${Date.now().toString(36)}`;
}

export function buildDraftMerchantInsert(userId: string, email: string | null | undefined) {
  const now = new Date().toISOString();
  return {
    owner_id: userId,
    name: null,
    slug: draftSlugForUser(userId),
    address: null,
    email: email || null,
    onboarding_status: "draft",
    verification_status: "pending",
    submitted_at: null,
    wizard_step: 1,
    wizard_step_key: "restaurant-info",
    onboarding_draft: {},
    last_onboarding_activity_at: now,
    is_active: false,
    is_verified: false,
    is_accepting_orders: false,
  };
}

export function mirrorDraftScalarsToColumns(
  draft: Record<string, unknown>,
): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  if (typeof draft.email === "string" && draft.email.trim()) {
    update.email = draft.email.trim();
  }
  if (typeof draft.phone === "string" && draft.phone.trim()) {
    update.phone = draft.phone.trim();
  }
  if (typeof draft.description === "string") {
    update.description = draft.description || null;
  }
  if (typeof draft.restaurantName === "string" && draft.restaurantName.trim()) {
    update.name = draft.restaurantName.trim();
  }
  const loc = draft.location as Record<string, unknown> | null | undefined;
  if (loc && typeof loc === "object") {
    if (loc.lat != null) update.lat = loc.lat;
    if (loc.lng != null) update.lng = loc.lng;
    const street = typeof loc.streetAddress === "string" ? loc.streetAddress : draft.streetAddress;
    const city = typeof loc.city === "string" ? loc.city : draft.city;
    const postal = typeof loc.postalCode === "string" ? loc.postalCode : draft.postalCode;
    const parts = [street, city, postal].filter((p) => typeof p === "string" && p.trim());
    if (parts.length) update.address = parts.join(", ");
    if (typeof city === "string" && city.trim()) update.city = city.trim();
    if (typeof postal === "string" && postal.trim()) update.postal_code = postal.trim();
  }
  return update;
}

export function buildAddress(body: Record<string, unknown>): string {
  if (typeof body.address === "string" && body.address.trim()) {
    return body.address.trim();
  }
  const parts = [
    body.streetAddress,
    body.city,
    body.postalCode,
  ].filter((p) => typeof p === "string" && (p as string).trim());
  return parts.join(", ");
}

export function parsePrepTime(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const digits = parseInt(value.replace(/\D/g, ""), 10);
    if (Number.isFinite(digits)) return digits;
  }
  return 30;
}

export function parseDeliveryRadius(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const digits = parseInt(value.replace(/\D/g, ""), 10);
    if (Number.isFinite(digits)) return digits;
  }
  return 10;
}

export function merchantPayloadFromBody(
  body: Record<string, unknown>,
  userId: string,
  verticalSnapshot?: {
    vertical_type?: string;
    fulfillment_type?: string;
    go_live_rule?: string;
  },
) {
  const cuisineTypes = Array.isArray(body.cuisineTypes)
    ? (body.cuisineTypes as string[]).filter(Boolean).slice(0, 3)
    : [];
  const inventoryCategories = Array.isArray(body.inventoryCategories)
    ? (body.inventoryCategories as string[]).filter(Boolean).slice(0, 5)
    : [];
  const primaryCuisine = typeof body.cuisineType === "string" && body.cuisineType
    ? body.cuisineType
    : cuisineTypes[0] || inventoryCategories[0] || null;

  const name = String(body.name || body.restaurantName || "").trim();
  const slugBase = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || "merchant";

  return {
    owner_id: userId,
    name,
    slug: `${slugBase}-${Date.now().toString(36)}`,
    description: body.description || null,
    address: buildAddress(body),
    lat: body.lat ?? (body.location as Record<string, unknown> | undefined)?.lat ?? null,
    lng: body.lng ?? (body.location as Record<string, unknown> | undefined)?.lng ?? null,
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
    vertical_type: verticalSnapshot?.vertical_type ?? null,
    fulfillment_type: verticalSnapshot?.fulfillment_type ?? null,
    go_live_rule: verticalSnapshot?.go_live_rule ?? null,
    verification_status: "pending",
    onboarding_status: "submitted",
    submitted_at: new Date().toISOString(),
    wizard_step: 7,
    wizard_step_key: "bank-details",
    last_onboarding_activity_at: new Date().toISOString(),
  };
}

export function incompleteSetupStageLabel(row: Record<string, unknown>): string {
  if (row.onboarding_status === "draft") {
    const step = Number(row.wizard_step) || wizardStepFromKey(String(row.wizard_step_key || ""));
    const label = wizardStepLabel(row.wizard_step_key as string);
    return `Step ${step} of 7 — ${label}`;
  }
  return "";
}
