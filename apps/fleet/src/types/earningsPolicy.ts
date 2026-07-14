import type { TierConfig, QuotaConfig, PersonalAllowanceTierConfig } from './data';

export interface EarningsPolicyVersion {
  id: string;
  /** Monday yyyy-MM-dd — version applies to weeks starting on/after this date. */
  effectiveFrom: string;
  /** Optional Monday yyyy-MM-dd — exclusive end. Unset = never ends. */
  effectiveUntil?: string;
  /** Frozen bundle snapshot (copied from policy template when version is created). */
  tiers: TierConfig[];
  quotas: QuotaConfig;
  personalAllowance: PersonalAllowanceTierConfig;
  /** Drivers on this version window (Schedule). Empty = no explicit assignees. */
  driverIds?: string[];
  createdAt: string;
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
  /** Period + driver windows (Schedule). */
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
