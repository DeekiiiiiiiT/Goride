/** Pure catalog/fleet parts shaping. No database. */

export type CatalogOffer = {
  id: string;
  supplier_id: string;
  part_id: string;
  supplier_sku: string;
  unit_price: number;
  currency: string;
  moq?: number;
  lead_time_days?: number | null;
  url?: string | null;
  is_active?: boolean;
  price_observed_at?: string | null;
  source?: string | null;
  core_charge?: number | null;
  warranty_months?: number | null;
  warranty_km?: number | null;
  organization_id?: string | null;
  freight_estimate?: number | null;
  duty_rate?: number | null;
  fx_rate_to_jmd?: number | null;
  supplier?: {
    id: string;
    name: string;
    default_lead_time_days?: number | null;
    freight_estimate?: number | null;
    duty_rate?: number | null;
    fx_rate_to_jmd?: number | null;
  } | null;
};

export type CatalogPartItem = {
  fitmentId: string;
  tier?: number;
  part: Record<string, unknown>;
  offers: CatalogOffer[];
  catalogDecision?: string | null;
  ruleSource?: string | null;
  position?: string | null;
  alsoKnownAs?: string[];
  sisterNames?: string | null;
  sourceMake?: string | null;
  referenceOem?: string | null;
  confirmedInstalls?: number;
  fitScope?: string | null;
};

export function selectPartsMode(input: { killed: boolean; ready: boolean }): "tiered" | "legacy" {
  if (input.killed) return "legacy";
  return input.ready ? "tiered" : "legacy";
}

export function referenceOffersOnly(offers: CatalogOffer[]): CatalogOffer[] {
  return offers.filter((offer) => !offer.organization_id);
}

export function offersForFleet(offers: CatalogOffer[], organizationId: string | null): CatalogOffer[] {
  return offers.filter((offer) => {
    if (!offer.organization_id) return true;
    return Boolean(organizationId) && offer.organization_id === organizationId;
  });
}

export const CORE_PART_OP_CODES = [
  "ENG-OIL",
  "ENG-SPARK",
  "ENG-THERM",
  "FILT-AIR",
  "HVAC-CABIN",
  "BRK-PADS",
  "BELT-SERP",
  "LGT-WIPER",
  "BRK-ROTOR",
  "SUS-SHOCK",
] as const;

export function variantPartsReady(verifiedCount: number, required = CORE_PART_OP_CODES.length): boolean {
  return Number.isFinite(verifiedCount) && verifiedCount >= required;
}

const FORBIDDEN_IDENTITY_KEYS = new Set([
  "organization_id",
  "organizationId",
  "organization_name",
  "organizationName",
  "vehicle_id",
  "vehicleId",
  "fleet_vehicle_id",
  "fleetVehicleId",
  "customer_name",
  "customerName",
  "org_name",
  "fleetVehicle",
]);

/** Path of the first customer-identity field, or null when the payload is safe. */
export function findCustomerIdentityLeak(value: unknown, path = "$"): string | null {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findCustomerIdentityLeak(value[i], `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_IDENTITY_KEYS.has(key)) return `${path}.${key}`;
    const hit = findCustomerIdentityLeak(child, `${path}.${key}`);
    if (hit) return hit;
  }
  return null;
}

export function assertNoCustomerIdentity(body: unknown): void {
  const leak = findCustomerIdentityLeak(body);
  if (leak) {
    throw new Error(`Dominion response included a customer field at ${leak}`);
  }
}
