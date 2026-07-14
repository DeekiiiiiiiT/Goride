/**
 * Default templates for new earnings policies.
 * Bronze → Diamond tier ladder defaults for new earnings policies.
 */

import type { TierConfig, QuotaConfig, PersonalAllowanceTierConfig } from '../types/data';
import type { EarningsPolicy } from '../types/earningsPolicy';
import { mergePersonalAllowanceDefaults } from './personalAllowance';

export const DEFAULT_TIERS: TierConfig[] = [
  {
    id: crypto.randomUUID(),
    name: 'Bronze',
    minEarnings: 0,
    maxEarnings: 50000,
    sharePercentage: 20,
    color: '#CD7F32',
  },
  {
    id: crypto.randomUUID(),
    name: 'Silver',
    minEarnings: 50000,
    maxEarnings: 100000,
    sharePercentage: 25,
    color: '#C0C0C0',
  },
  {
    id: crypto.randomUUID(),
    name: 'Gold',
    minEarnings: 100000,
    maxEarnings: 150000,
    sharePercentage: 30,
    color: '#FFD700',
  },
  {
    id: crypto.randomUUID(),
    name: 'Diamond',
    minEarnings: 150000,
    maxEarnings: null,
    sharePercentage: 35,
    color: '#B9F2FF',
  },
];

export const DEFAULT_QUOTAS: QuotaConfig = {
  daily: { enabled: false, amount: 0, workingDays: [0, 1, 2, 3, 4, 5, 6] },
  weekly: { enabled: false, amount: 0, workingDays: [0, 1, 2, 3, 4, 5, 6] },
  monthly: { enabled: false, amount: 0, workingDays: [0, 1, 2, 3, 4, 5, 6] },
};

export function createEmptyQuotas(): QuotaConfig {
  return {
    daily: { enabled: false, amount: 0, workingDays: [0, 1, 2, 3, 4, 5, 6] },
    weekly: { enabled: false, amount: 0, workingDays: [0, 1, 2, 3, 4, 5, 6] },
    monthly: { enabled: false, amount: 0, workingDays: [0, 1, 2, 3, 4, 5, 6] },
  };
}

export function createDefaultTiers(): TierConfig[] {
  return DEFAULT_TIERS.map((t) => ({ ...t, id: crypto.randomUUID() }));
}

export function createDefaultPersonalAllowance(): PersonalAllowanceTierConfig {
  return mergePersonalAllowanceDefaults(null);
}

export function createEmptyPolicy(): EarningsPolicy {
  return {
    id: crypto.randomUUID(),
    name: '',
    description: '',
    tiers: createDefaultTiers(),
    quotas: createEmptyQuotas(),
    personalAllowance: createDefaultPersonalAllowance(),
    isDefault: false,
    versions: [],
  };
}

export function createDefaultPolicy(): EarningsPolicy {
  return {
    id: crypto.randomUUID(),
    name: 'Default',
    description: 'Default earnings policy for all drivers.',
    tiers: createDefaultTiers(),
    quotas: createEmptyQuotas(),
    personalAllowance: createDefaultPersonalAllowance(),
    isDefault: true,
    versions: [],
  };
}
