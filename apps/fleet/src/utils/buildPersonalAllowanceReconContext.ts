/**
 * Shared Personal Allowance bootstrap for live table, wizard, and bulk finalize.
 */
import { api } from '../services/api';
import { tierService } from '../services/tierService';
import { earningsPolicyService } from '../services/earningsPolicyService';
import type { PersonalAllowanceReconContext } from '../services/fuelCalculationService';
import type { PersonalAllowanceTierConfig, QuotaConfig, TierConfig } from '../types/data';
import type { EarningsPolicy } from '../types/earningsPolicy';
import { UNASSIGNED_FUEL_DRIVER_ID } from '../types/fuel';
import { mergePersonalAllowanceDefaults, personalAllowanceBonusKey } from './personalAllowance';
import {
  resolveActiveEarningsBundleForDriverWeek,
  extractEarningsPolicySnapshot,
} from './earningsPolicyResolve';
import { createDefaultTiers } from './earningsPolicyDefaults';
import { mapPool } from './fuelMapPool';

export type PersonalAllowanceBootstrap = {
  context: PersonalAllowanceReconContext;
  config: PersonalAllowanceTierConfig;
  quotaConfig: QuotaConfig | null;
  legacyTiers: TierConfig[];
  earningsPolicies: EarningsPolicy[];
  paMayBeActive: boolean;
};

function paMayBeActive(
  config: PersonalAllowanceTierConfig,
  policies: EarningsPolicy[],
): boolean {
  if (config.enabled) return true;
  return policies.some(
    (p) => p.personalAllowance?.enabled || p.versions?.some((v) => v.personalAllowance?.enabled),
  );
}

export async function buildPersonalAllowanceReconContext(opts: {
  weekStartYmd: string;
  weekEndYmd: string;
  drivers: Array<{ id?: string; driverId?: string }>;
  seedIfMissing?: boolean;
  serviceLine?: 'rideshare' | 'rush_delivery';
}): Promise<PersonalAllowanceBootstrap> {
  const [pa, quotas, tiers, policies, prefs] = await Promise.all([
    tierService.getPersonalAllowanceSettings(),
    tierService.getQuotaSettings(),
    tierService.getTiers().catch(() => createDefaultTiers()),
    earningsPolicyService.getEarningsPolicies().catch(() => [] as EarningsPolicy[]),
    api.getPreferences().catch(() => ({})),
  ]);

  let paConfig = pa;
  if (opts.seedIfMissing && !(prefs as any)?.personalAllowance) {
    paConfig = mergePersonalAllowanceDefaults(null);
    if (paConfig.enabled) {
      try {
        await tierService.savePersonalAllowanceSettings(paConfig);
      } catch (seedErr) {
        console.warn('[PersonalAllowance] seed enable failed', seedErr);
      }
    }
  }

  const earningsPolicies = Array.isArray(policies) ? policies : [];
  const legacyTiers = Array.isArray(tiers) && tiers.length ? tiers : createDefaultTiers();
  const quotaConfig = quotas;
  const bonusByDriverId = new Map<string, number>();
  const ledger = ((prefs as any)?.personalAllowanceBonuses || {}) as Record<string, number>;
  for (const d of opts.drivers) {
    const id = d.id || d.driverId;
    if (!id) continue;
    const key = personalAllowanceBonusKey(id, opts.weekStartYmd);
    const km = Number(ledger[key]) || 0;
    if (km > 0) bonusByDriverId.set(id, km);
  }

  const ledgerGrossByDriverId = new Map<string, number>();
  const active = paMayBeActive(paConfig, earningsPolicies);
  if (active) {
    const ids = [
      ...new Set(
        opts.drivers
          .map((d) => d.id || d.driverId)
          .filter((id): id is string => !!id && id !== UNASSIGNED_FUEL_DRIVER_ID),
      ),
    ];
    await mapPool(ids, 5, async (driverId) => {
      try {
        const overview = await api.getLedgerDriverOverview({
          driverId,
          startDate: opts.weekStartYmd,
          endDate: opts.weekEndYmd,
        });
        const earnings = Number(overview?.period?.earnings);
        if (Number.isFinite(earnings)) {
          ledgerGrossByDriverId.set(driverId, earnings);
        }
      } catch {
        /* PA falls back to trip gross */
      }
    });
  }

  const legacy = {
    tiers: legacyTiers,
    quotas: quotaConfig || {
      daily: { enabled: false, amount: 0 },
      weekly: { enabled: false, amount: 0 },
      monthly: { enabled: false, amount: 0 },
    },
    personalAllowance: paConfig,
  };

  const context: PersonalAllowanceReconContext = {
    config: paConfig,
    quotaConfig,
    bonusByDriverId,
    ledgerGrossByDriverId,
    resolveForDriver: (driverId: string) => {
      const bundle = resolveActiveEarningsBundleForDriverWeek({
        policies: earningsPolicies,
        driverId,
        weekStartYmd: opts.weekStartYmd,
        legacy,
        serviceLine: opts.serviceLine,
      });
      return {
        config: bundle.personalAllowance,
        quotaConfig: bundle.quotas,
        earningsPolicy: extractEarningsPolicySnapshot(bundle),
      };
    },
  };

  return {
    context,
    config: paConfig,
    quotaConfig,
    legacyTiers,
    earningsPolicies,
    paMayBeActive: active,
  };
}
