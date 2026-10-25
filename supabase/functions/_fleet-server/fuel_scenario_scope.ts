/**
 * Fuel policies are company-scoped. Null-org rows are not shared.
 * Pure helpers — no KV — so tests can import this file.
 */

export type FuelScenarioRecord = Record<string, unknown> & {
  id?: string;
  organizationId?: string | null;
  isDefault?: boolean;
  archived?: boolean;
};

export function fuelScenarioOrgId(row: FuelScenarioRecord | null | undefined): string | null {
  const id = row?.organizationId ?? (row as { orgId?: string } | null)?.orgId;
  const text = id == null ? "" : String(id).trim();
  return text || null;
}

/** Exact org match only. Archived rows stay so a closed week can still resolve its split. */
export function filterFuelScenariosForOrg<T extends FuelScenarioRecord>(
  records: T[],
  orgId: string | null | undefined,
): T[] {
  const id = String(orgId || "").trim();
  if (!id) return [];
  return records.filter((row) => fuelScenarioOrgId(row) === id);
}

export function standardFuelScenario(orgId: string, id: string): FuelScenarioRecord {
  return {
    id,
    name: "Standard",
    description: "Default 80/20 company and driver split.",
    isDefault: true,
    organizationId: orgId,
    archived: false,
    rules: [
      {
        id: crypto.randomUUID(),
        category: "Fuel",
        coverageType: "Percentage",
        coverageValue: 80,
        rideShareCoverage: 80,
        companyUsageCoverage: 80,
        deadheadCoverage: 80,
        personalCoverage: 0,
        miscCoverage: 100,
        conditions: { requiresReceipt: true },
      },
    ],
    versions: [],
  };
}
