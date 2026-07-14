import type { TierConfig, QuotaConfig, PersonalAllowanceTierConfig } from './data';

/** Per-driver membership window on a frozen version (hire / move onto plan). */
export interface EarningsPolicyDriverAssignment {
  driverId: string;
  /** Monday yyyy-MM-dd — applies to weeks starting on/after this date. */
  effectiveFrom: string;
  /** Optional Monday yyyy-MM-dd — exclusive end. Unset = never ends. */
  effectiveUntil?: string;
}

export interface EarningsPolicyVersion {
  id: string;
  createdAt: string;
  /** Optional display label e.g. "Launch ladder". */
  name?: string;
  /** Frozen bundle snapshot (copied from policy template when version is created). */
  tiers: TierConfig[];
  quotas: QuotaConfig;
  personalAllowance: PersonalAllowanceTierConfig;
  /** Drivers on this version with per-driver Monday windows. */
  assignments: EarningsPolicyDriverAssignment[];
  /**
 * Legacy Schedule shape (pre per-driver periods). Migrated on normalize/read/save;
 * never written as source of truth after cleanup.
 */
  effectiveFrom?: string;
  effectiveUntil?: string;
  driverIds?: string[];
}

export interface EarningsPolicy {
  id: string;
  name: string;
  description?: string;
  /** Policy template bundle (Rules tab). New Schedule versions freeze a copy. */
  tiers: TierConfig[];
  quotas: QuotaConfig;
  personalAllowance: PersonalAllowanceTierConfig;
  isDefault?: boolean;
  /** Frozen content snapshots (Schedule). Assignment dates live on assignments[]. */
  versions?: EarningsPolicyVersion[];
}

/** Result shape from resolveActiveEarningsBundleForDriverWeek */
export interface ResolvedEarningsBundle {
  tiers: TierConfig[];
  quotas: QuotaConfig;
  personalAllowance: PersonalAllowanceTierConfig;
  source: 'version' | 'default' | 'legacy';
  policyId?: string;
  versionId?: string;
  policyName?: string;
}

/** Snapshot metadata for recon auditing */
export interface EarningsPolicySnapshot {
  policyId?: string;
  versionId?: string;
  source: 'version' | 'default' | 'legacy';
  policyName?: string;
}
