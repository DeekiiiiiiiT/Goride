/**
 * Dual-read resolver: earnings policies → legacy prefs fallback.
 * Ensures runtime consumers get bundle config even when policies empty.
 */

import type { TierConfig, QuotaConfig, PersonalAllowanceTierConfig } from '../types/data';
import type { EarningsPolicy, ResolvedEarningsBundle } from '../types/earningsPolicy';
import {
  resolveDriverVersionForWeek,
  resolveVersionForWeek,
  normalizePolicyVersions,
  templateAsVersion,
} from './earningsPolicyVersion';

export interface LegacyEarningsConfig {
  tiers: TierConfig[];
  quotas: QuotaConfig;
  personalAllowance: PersonalAllowanceTierConfig;
}

/**
 * IMPORTANT dual-read facade:
 * Order: covering version membership → Default policy template/version for week → legacy prefs
 */
export function resolveActiveEarningsBundleForDriverWeek(params: {
  policies: EarningsPolicy[];
  driverId?: string | null;
  weekStartYmd: string;
  legacy: LegacyEarningsConfig;
}): ResolvedEarningsBundle {
  const { policies, driverId, weekStartYmd, legacy } = params;

  // Empty policies → legacy
  if (!policies || policies.length === 0) {
    return {
      tiers: legacy.tiers,
      quotas: legacy.quotas,
      personalAllowance: legacy.personalAllowance,
      source: 'legacy',
    };
  }

  // Try driver version membership
  const hit = resolveDriverVersionForWeek(policies, driverId, weekStartYmd);
  if (hit) {
    const isDriverMember = !!hit.assignment;
    return {
      tiers: hit.version.tiers,
      quotas: hit.version.quotas,
      personalAllowance: hit.version.personalAllowance,
      source: isDriverMember ? 'version' : 'default',
      policyId: hit.policy.id,
      versionId: hit.version.id,
      policyName: hit.policy.name,
    };
  }

  // Try Default policy template (for drivers not on any version)
  const defaultPolicy = policies.find((p) => p.isDefault);
  if (defaultPolicy) {
    const normalized = normalizePolicyVersions(defaultPolicy);
    const version = resolveVersionForWeek(normalized, weekStartYmd) || templateAsVersion(normalized);
    if (version) {
      return {
        tiers: version.tiers,
        quotas: version.quotas,
        personalAllowance: version.personalAllowance,
        source: 'default',
        policyId: defaultPolicy.id,
        versionId: version.id,
        policyName: defaultPolicy.name,
      };
    }

    // Use template directly
    return {
      tiers: normalized.tiers,
      quotas: normalized.quotas,
      personalAllowance: normalized.personalAllowance,
      source: 'default',
      policyId: defaultPolicy.id,
      policyName: defaultPolicy.name,
    };
  }

  // Fallback to legacy prefs
  return {
    tiers: legacy.tiers,
    quotas: legacy.quotas,
    personalAllowance: legacy.personalAllowance,
    source: 'legacy',
  };
}

/**
 * Extract snapshot metadata for auditing/recon.
 */
export function extractEarningsPolicySnapshot(
  bundle: ResolvedEarningsBundle,
): { policyId?: string; versionId?: string; source: string; policyName?: string } {
  return {
    policyId: bundle.policyId,
    versionId: bundle.versionId,
    source: bundle.source,
    policyName: bundle.policyName,
  };
}
