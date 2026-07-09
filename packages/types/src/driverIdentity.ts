/**
 * Canonical driver identity — one Roam profile may own Roam + Uber + InDrive IDs.
 * Toll receipts and trip imports often disagree on name format; these helpers
 * normalize display names and treat linked IDs as the same person.
 */

export type DriverIdentityLike = {
  id?: string;
  driverId?: string;
  name?: string;
  driverName?: string;
  firstName?: string;
  lastName?: string;
  uberDriverId?: string;
  inDriveDriverId?: string;
  email?: string;
};

export function driverNamesReferToSamePerson(a: string, b: string): boolean {
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length >= 3 && right.length >= 3 && (left.includes(right) || right.includes(left))) {
    return true;
  }

  const tokensA = left.split(/\s+/).filter((t) => t.length >= 2);
  const tokensB = right.split(/\s+/).filter((t) => t.length >= 2);
  const shared = tokensA.filter((t) => tokensB.includes(t));
  return shared.length >= 2;
}

export function getCanonicalDriverName(record: DriverIdentityLike | null | undefined): string {
  if (!record) return '';

  const fromParts = [record.firstName, record.lastName].filter(Boolean).join(' ').trim();
  const name = String(record.name || '').trim();
  const driverName = String(record.driverName || '').trim();

  const candidates = [fromParts, name, driverName].filter(Boolean);
  if (candidates.length === 0) return '';

  return candidates.reduce((best, current) => {
    const bestTokens = best.split(/\s+/).filter(Boolean).length;
    const currentTokens = current.split(/\s+/).filter(Boolean).length;
    if (currentTokens !== bestTokens) return currentTokens > bestTokens ? current : best;
    return current.length > best.length ? current : best;
  });
}

export function collectDriverAliasIds(record: DriverIdentityLike): string[] {
  const ids = new Set<string>();
  for (const raw of [record.id, record.driverId, record.uberDriverId, record.inDriveDriverId]) {
    const id = String(raw || '').trim();
    if (id) ids.add(id);
  }
  return [...ids];
}

/** Map every known driver id (Roam / Uber / InDrive) → canonical Roam id. */
export function buildDriverAliasMap(drivers: DriverIdentityLike[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const driver of drivers) {
    const canonicalId = String(driver.id || driver.driverId || '').trim();
    if (!canonicalId) continue;
    for (const alias of collectDriverAliasIds(driver)) {
      map.set(alias, canonicalId);
    }
  }
  return map;
}

export function getCanonicalDriverIdFromMap(
  driverId: string | null | undefined,
  aliasMap: Map<string, string>,
): string | null {
  const id = String(driverId || '').trim();
  if (!id) return null;
  return aliasMap.get(id) ?? id;
}

export function driverIdsReferToSamePerson(
  a: string | null | undefined,
  b: string | null | undefined,
  aliasMap?: Map<string, string>,
): boolean {
  const left = String(a || '').trim();
  const right = String(b || '').trim();
  if (!left || !right) return false;
  if (left === right) return true;
  if (!aliasMap) return false;
  const canonLeft = aliasMap.get(left) ?? left;
  const canonRight = aliasMap.get(right) ?? right;
  return canonLeft === canonRight;
}

export function findDriverByAnyId(
  driverId: string | null | undefined,
  drivers: DriverIdentityLike[],
): DriverIdentityLike | undefined {
  const id = String(driverId || '').trim();
  if (!id) return undefined;
  return drivers.find((d) => collectDriverAliasIds(d).includes(id));
}

export function findDriverByName(
  name: string | null | undefined,
  drivers: DriverIdentityLike[],
): DriverIdentityLike | undefined {
  const query = String(name || '').trim();
  if (!query) return undefined;
  return drivers.find((d) => driverNamesReferToSamePerson(getCanonicalDriverName(d), query));
}

export function resolveCanonicalDriverIdentity(
  record: DriverIdentityLike | null | undefined,
  fallback?: { id?: string; name?: string; email?: string },
): { driverId: string; driverName: string } {
  const driverId = String(record?.id || record?.driverId || fallback?.id || '').trim();
  const driverName =
    getCanonicalDriverName(record) ||
    String(fallback?.name || '').trim() ||
    String(fallback?.email || '').trim();

  return { driverId, driverName };
}

/** Prefer fleet profile name over a stale toll-row name when IDs align. */
export function resolveTollDisplayDriverName(
  toll: { driverId?: string | null; driverName?: string | null },
  drivers: DriverIdentityLike[],
): string {
  const stored = String(toll.driverName || '').trim();
  const profile = toll.driverId
    ? findDriverByAnyId(toll.driverId, drivers)
    : stored
      ? findDriverByName(stored, drivers)
      : undefined;

  const canonical = getCanonicalDriverName(profile);
  if (canonical) return canonical;
  return stored;
}
