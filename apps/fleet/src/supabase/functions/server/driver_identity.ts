/**
 * Server-side driver identity helpers (mirrors @roam/types/driverIdentity).
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
  return (aliasMap.get(left) ?? left) === (aliasMap.get(right) ?? right);
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

export function resolveDriverFromFleetRecords(
  input: { driverId?: string; driverName?: string },
  drivers: DriverIdentityLike[],
): { canonicalId: string; driverName: string; resolved: boolean } {
  const byId = input.driverId ? findDriverByAnyId(input.driverId, drivers) : undefined;
  const byName = !byId && input.driverName ? findDriverByName(input.driverName, drivers) : undefined;
  const match = byId || byName;

  if (match?.id) {
    return {
      canonicalId: String(match.id),
      driverName: getCanonicalDriverName(match) || String(input.driverName || 'Unknown'),
      resolved: true,
    };
  }

  const fallbackId = String(input.driverId || '').trim();
  return {
    canonicalId: fallbackId || 'unknown',
    driverName: String(input.driverName || 'Unknown'),
    resolved: false,
  };
}
