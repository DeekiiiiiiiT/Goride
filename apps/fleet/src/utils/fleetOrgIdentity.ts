/**
 * Platform fleet / organization UUIDs — never treat as driver IDs.
 * Hardcoded Uber UUID remains a safe fallback until org settings are populated.
 */

/** Uber Organization UUID for this fleet (payments_organization) — never a driver. */
export const FLEET_ORG_UUID = '73dfc14d-3798-4a00-8d86-b2a3eb632f54';

export type OrganizationPlatformSettings = {
  uberOrganizationUuid?: string | null;
  roamOrganizationUuid?: string | null;
  inDriveOrganizationUuid?: string | null;
};

/** UUIDs that identify a fleet account on a rideshare platform (not a person-driver). */
export function collectFleetOrgUuids(
  settings?: OrganizationPlatformSettings | null,
): Set<string> {
  const out = new Set<string>();
  const add = (raw: unknown) => {
    const id = String(raw || '').trim().toLowerCase();
    if (id) out.add(id);
  };
  add(FLEET_ORG_UUID);
  add(settings?.uberOrganizationUuid);
  add(settings?.roamOrganizationUuid);
  add(settings?.inDriveOrganizationUuid);
  return out;
}

export function isFleetOrgUuid(
  id: string | null | undefined,
  settings?: OrganizationPlatformSettings | null,
): boolean {
  const key = String(id || '').trim().toLowerCase();
  if (!key) return false;
  return collectFleetOrgUuids(settings).has(key);
}

/** Ledger driverId slot for org-owned payout_bank (excluded from driver desks). */
export function orgBankLedgerDriverId(
  organizationUuid?: string | null,
): string {
  const id = String(organizationUuid || '').trim();
  return id || FLEET_ORG_UUID;
}
