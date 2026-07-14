/**
 * Validates an EarningsPolicy payload before persisting.
 * Dependency-free for Edge (no date-fns). Migrates legacy version windows → assignments.
 */

function isMondayYmd(ymd: string): boolean {
  const key = String(ymd || '').split('T')[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCDay() === 1;
}

function windowsOverlap(
  a: { effectiveFrom: string; effectiveUntil?: string },
  b: { effectiveFrom: string; effectiveUntil?: string },
): boolean {
  const aFrom = String(a.effectiveFrom || '').split('T')[0];
  const bFrom = String(b.effectiveFrom || '').split('T')[0];
  const aUntil = a.effectiveUntil ? String(a.effectiveUntil).split('T')[0] : '9999-12-31';
  const bUntil = b.effectiveUntil ? String(b.effectiveUntil).split('T')[0] : '9999-12-31';
  if (!aFrom || !bFrom) return false;
  return aFrom < bUntil && bFrom < aUntil;
}

/** Convert legacy version.effectiveFrom/Until + driverIds → assignments (idempotent). */
export function migrateVersionAssignmentsServer(v: any): any {
  if (!v || typeof v !== 'object') return v;
  if (Array.isArray(v.assignments) && v.assignments.length > 0) {
    return {
      ...v,
      assignments: v.assignments.map((a: any) => ({
        driverId: String(a.driverId),
        effectiveFrom: String(a.effectiveFrom || '').split('T')[0],
        ...(a.effectiveUntil
          ? { effectiveUntil: String(a.effectiveUntil).split('T')[0] }
          : {}),
      })),
    };
  }

  const legacyIds = Array.isArray(v.driverIds) ? v.driverIds.filter(Boolean) : [];
  const from = v.effectiveFrom ? String(v.effectiveFrom).split('T')[0] : '';
  if (legacyIds.length > 0 && from) {
    const until = v.effectiveUntil ? String(v.effectiveUntil).split('T')[0] : undefined;
    return {
      ...v,
      assignments: legacyIds.map((driverId: string) => ({
        driverId: String(driverId),
        effectiveFrom: from,
        ...(until ? { effectiveUntil: until } : {}),
      })),
    };
  }

  return {
    ...v,
    assignments: Array.isArray(v.assignments) ? v.assignments : [],
  };
}

/** Normalize policy versions for persist: migrate legacy → assignments, strip legacy fields. */
export function normalizeEarningsPolicyForPersist(item: any): any {
  if (!item || typeof item !== 'object') return item;
  const versions = Array.isArray(item.versions)
    ? item.versions.map((raw: any) => {
        const migrated = migrateVersionAssignmentsServer(raw);
        const {
          effectiveFrom: _ef,
          effectiveUntil: _eu,
          driverIds: _ids,
          ...rest
        } = migrated;
        return {
          ...rest,
          assignments: Array.isArray(migrated.assignments) ? migrated.assignments : [],
        };
      })
    : [];
  return { ...item, versions };
}

function validateAssignmentsOnVersions(versions: any[]): string | null {
  // Per-version: unique driverId, Monday dates, until > from
  for (let vi = 0; vi < versions.length; vi++) {
    const v = versions[vi];
    if (!v || typeof v !== 'object') return `Version ${vi + 1} is invalid.`;
    if (!v.id || typeof v.id !== 'string') return `Version ${vi + 1} id is required.`;
    if (!Array.isArray(v.assignments)) {
      return `Version ${vi + 1} assignments array is required (after migrate).`;
    }

    const seen = new Set<string>();
    for (let ai = 0; ai < v.assignments.length; ai++) {
      const a = v.assignments[ai];
      if (!a || typeof a !== 'object') {
        return `Version ${vi + 1} assignment ${ai + 1} is invalid.`;
      }
      if (!a.driverId || typeof a.driverId !== 'string') {
        return `Version ${vi + 1} assignment ${ai + 1}: driverId is required.`;
      }
      if (seen.has(a.driverId)) {
        return `Version ${vi + 1}: driver ${a.driverId} appears more than once.`;
      }
      seen.add(a.driverId);

      const from = String(a.effectiveFrom || '').split('T')[0];
      if (!isMondayYmd(from)) {
        return `Version ${vi + 1} assignment for ${a.driverId}: start must be a Monday (yyyy-MM-dd).`;
      }
      if (a.effectiveUntil) {
        const until = String(a.effectiveUntil).split('T')[0];
        if (!isMondayYmd(until)) {
          return `Version ${vi + 1} assignment for ${a.driverId}: end must be a Monday (yyyy-MM-dd).`;
        }
        if (until <= from) {
          return `Version ${vi + 1} assignment for ${a.driverId}: end must be after start.`;
        }
      }
    }
  }

  // Cross-version / same-policy overlaps for same driver
  const byDriver = new Map<string, { from: string; until?: string; versionId: string }[]>();
  for (const v of versions) {
    for (const a of v.assignments || []) {
      const list = byDriver.get(a.driverId) || [];
      list.push({
        from: String(a.effectiveFrom).split('T')[0],
        until: a.effectiveUntil ? String(a.effectiveUntil).split('T')[0] : undefined,
        versionId: v.id,
      });
      byDriver.set(a.driverId, list);
    }
  }

  for (const [driverId, windows] of byDriver) {
    for (let i = 0; i < windows.length; i++) {
      for (let j = i + 1; j < windows.length; j++) {
        const a = { effectiveFrom: windows[i].from, effectiveUntil: windows[i].until };
        const b = { effectiveFrom: windows[j].from, effectiveUntil: windows[j].until };
        if (windowsOverlap(a, b)) {
          return `Driver ${driverId} has overlapping assignment windows on this policy.`;
        }
      }
    }
  }

  return null;
}

export function validateEarningsPolicyPayload(item: any): string | null {
  if (!item || typeof item !== 'object') return 'Invalid policy payload.';
  if (!item.id || typeof item.id !== 'string') return 'Policy id is required.';
  if (!item.name || typeof item.name !== 'string' || !item.name.trim()) {
    return 'Policy name is required.';
  }

  if (!Array.isArray(item.tiers)) return 'Tiers array is required.';
  for (let i = 0; i < item.tiers.length; i++) {
    const tier = item.tiers[i];
    if (!tier || typeof tier !== 'object') return `Tier ${i + 1} is invalid.`;
    if (typeof tier.name !== 'string' || !tier.name.trim()) {
      return `Tier ${i + 1} name is required.`;
    }
    if (typeof tier.minEarnings !== 'number' || tier.minEarnings < 0) {
      return `Tier ${i + 1} minEarnings must be >= 0.`;
    }
    if (
      tier.maxEarnings !== null &&
      (typeof tier.maxEarnings !== 'number' || tier.maxEarnings < tier.minEarnings)
    ) {
      return `Tier ${i + 1} maxEarnings must be null or >= minEarnings.`;
    }
    if (
      typeof tier.sharePercentage !== 'number' ||
      tier.sharePercentage < 0 ||
      tier.sharePercentage > 100
    ) {
      return `Tier ${i + 1} sharePercentage must be 0-100.`;
    }
  }

  if (!item.quotas || typeof item.quotas !== 'object') return 'Quotas object is required.';
  for (const period of ['daily', 'weekly', 'monthly'] as const) {
    const q = item.quotas[period];
    if (!q || typeof q !== 'object') return `Quotas.${period} is required.`;
    if (typeof q.enabled !== 'boolean') return `Quotas.${period}.enabled must be boolean.`;
    if (typeof q.amount !== 'number' || q.amount < 0) {
      return `Quotas.${period}.amount must be >= 0.`;
    }
  }

  const pa = item.personalAllowance;
  if (!pa || typeof pa !== 'object') return 'PersonalAllowance object is required.';
  if (typeof pa.enabled !== 'boolean') return 'PersonalAllowance.enabled must be boolean.';
  if (
    pa.weeklyQuotaOverrideJmd !== null &&
    (typeof pa.weeklyQuotaOverrideJmd !== 'number' || pa.weeklyQuotaOverrideJmd < 0)
  ) {
    return 'PersonalAllowance.weeklyQuotaOverrideJmd must be null or >= 0.';
  }
  if (typeof pa.nextWeekBonusKm !== 'number' || pa.nextWeekBonusKm < 0) {
    return 'PersonalAllowance.nextWeekBonusKm must be >= 0.';
  }

  if (!Array.isArray(pa.bands) || pa.bands.length === 0) {
    return 'PersonalAllowance must have at least one band.';
  }
  const bandError = validatePersonalAllowanceBandsServer(pa.bands);
  if (bandError) return bandError;

  // Versions optional; when present migrate + validate assignments
  if (item.versions !== undefined && !Array.isArray(item.versions)) {
    return 'Versions must be an array when provided.';
  }
  if (Array.isArray(item.versions) && item.versions.length > 0) {
    const migrated = item.versions.map(migrateVersionAssignmentsServer);
    // Reject bare driverIds without a usable Monday window (malformed after migrate)
    for (let i = 0; i < item.versions.length; i++) {
      const raw = item.versions[i];
      const mig = migrated[i];
      const hadLegacyIds = Array.isArray(raw?.driverIds) && raw.driverIds.length > 0;
      const hadFrom = !!raw?.effectiveFrom;
      if (hadLegacyIds && !hadFrom && !(mig.assignments || []).length) {
        return `Version ${i + 1}: driverIds require effectiveFrom (or use assignments).`;
      }
    }
    const assignErr = validateAssignmentsOnVersions(migrated);
    if (assignErr) return assignErr;
  }

  return null;
}

function validatePersonalAllowanceBandsServer(bands: any[]): string | null {
  const sorted = [...bands].sort((a, b) => (a.minPctInclusive ?? 0) - (b.minPctInclusive ?? 0));
  for (let i = 0; i < sorted.length; i++) {
    const b = sorted[i];
    if (typeof b.minPctInclusive !== 'number' || b.minPctInclusive < 0) {
      return 'Band minPctInclusive must be >= 0.';
    }
    if (typeof b.earnedKm !== 'number' || b.earnedKm < 0) {
      return 'Band earnedKm must be >= 0.';
    }
    if (b.maxPctExclusive !== null && typeof b.maxPctExclusive !== 'number') {
      return 'Band maxPctExclusive must be null or number.';
    }
    if (b.maxPctExclusive !== null && b.maxPctExclusive <= b.minPctInclusive) {
      return 'Band maxPctExclusive must be greater than minPctInclusive.';
    }
    if (i > 0) {
      const prev = sorted[i - 1];
      if (prev.maxPctExclusive === null) {
        return 'Only the top band may be open-ended (maxPctExclusive: null).';
      }
      if (b.minPctInclusive < prev.maxPctExclusive) {
        return 'Bands must not overlap.';
      }
    }
  }
  const openCount = sorted.filter((b) => b.maxPctExclusive === null).length;
  if (openCount > 1) {
    return 'Only one open-ended (top) band is allowed.';
  }
  return null;
}
