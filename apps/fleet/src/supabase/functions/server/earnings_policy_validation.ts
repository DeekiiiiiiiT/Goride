/**
 * Validates an EarningsPolicy payload before persisting.
 * Mirrors fuel_scenario_validation.ts patterns.
 * 
 * Dependency-free module for Vitest unit testing.
 */

export function validateEarningsPolicyPayload(item: any): string | null {
  if (!item || typeof item !== "object") return "Invalid policy payload.";
  if (!item.id || typeof item.id !== "string") return "Policy id is required.";
  if (!item.name || typeof item.name !== "string" || !item.name.trim()) {
    return "Policy name is required.";
  }

  // Validate tiers
  if (!Array.isArray(item.tiers)) return "Tiers array is required.";
  for (let i = 0; i < item.tiers.length; i++) {
    const tier = item.tiers[i];
    if (!tier || typeof tier !== "object") return `Tier ${i + 1} is invalid.`;
    if (typeof tier.name !== "string" || !tier.name.trim()) {
      return `Tier ${i + 1} name is required.`;
    }
    if (typeof tier.minEarnings !== "number" || tier.minEarnings < 0) {
      return `Tier ${i + 1} minEarnings must be >= 0.`;
    }
    if (tier.maxEarnings !== null && (typeof tier.maxEarnings !== "number" || tier.maxEarnings < tier.minEarnings)) {
      return `Tier ${i + 1} maxEarnings must be null or >= minEarnings.`;
    }
    if (typeof tier.sharePercentage !== "number" || tier.sharePercentage < 0 || tier.sharePercentage > 100) {
      return `Tier ${i + 1} sharePercentage must be 0-100.`;
    }
  }

  // Validate quotas
  if (!item.quotas || typeof item.quotas !== "object") return "Quotas object is required.";
  for (const period of ["daily", "weekly", "monthly"] as const) {
    const q = item.quotas[period];
    if (!q || typeof q !== "object") return `Quotas.${period} is required.`;
    if (typeof q.enabled !== "boolean") return `Quotas.${period}.enabled must be boolean.`;
    if (typeof q.amount !== "number" || q.amount < 0) {
      return `Quotas.${period}.amount must be >= 0.`;
    }
  }

  // Validate personalAllowance
  const pa = item.personalAllowance;
  if (!pa || typeof pa !== "object") return "PersonalAllowance object is required.";
  if (typeof pa.enabled !== "boolean") return "PersonalAllowance.enabled must be boolean.";
  if (pa.weeklyQuotaOverrideJmd !== null && (typeof pa.weeklyQuotaOverrideJmd !== "number" || pa.weeklyQuotaOverrideJmd < 0)) {
    return "PersonalAllowance.weeklyQuotaOverrideJmd must be null or >= 0.";
  }
  if (typeof pa.nextWeekBonusKm !== "number" || pa.nextWeekBonusKm < 0) {
    return "PersonalAllowance.nextWeekBonusKm must be >= 0.";
  }

  // Validate bands
  if (!Array.isArray(pa.bands) || pa.bands.length === 0) {
    return "PersonalAllowance must have at least one band.";
  }
  const bandError = validatePersonalAllowanceBandsServer(pa.bands);
  if (bandError) return bandError;

  return null;
}

function validatePersonalAllowanceBandsServer(bands: any[]): string | null {
  const sorted = [...bands].sort((a, b) => (a.minPctInclusive ?? 0) - (b.minPctInclusive ?? 0));
  for (let i = 0; i < sorted.length; i++) {
    const b = sorted[i];
    if (typeof b.minPctInclusive !== "number" || b.minPctInclusive < 0) {
      return "Band minPctInclusive must be >= 0.";
    }
    if (typeof b.earnedKm !== "number" || b.earnedKm < 0) {
      return "Band earnedKm must be >= 0.";
    }
    if (b.maxPctExclusive !== null && typeof b.maxPctExclusive !== "number") {
      return "Band maxPctExclusive must be null or number.";
    }
    if (b.maxPctExclusive !== null && b.maxPctExclusive <= b.minPctInclusive) {
      return "Band maxPctExclusive must be greater than minPctInclusive.";
    }
    if (i > 0) {
      const prev = sorted[i - 1];
      if (prev.maxPctExclusive === null) {
        return "Only the top band may be open-ended (maxPctExclusive: null).";
      }
      if (b.minPctInclusive < prev.maxPctExclusive) {
        return "Bands must not overlap.";
      }
    }
  }
  const openCount = sorted.filter((b) => b.maxPctExclusive === null).length;
  if (openCount > 1) {
    return "Only one open-ended (top) band is allowed.";
  }
  return null;
}
