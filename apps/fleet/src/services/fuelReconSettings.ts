/**
 * Cached fuel reconciliation settings — load once on Fuel shell mount,
 * apply Fuel Brain kill switch, and supply org default JMD/L to recon.
 */
import { api } from './api';
import { applyFuelBrainServerSettings } from '../utils/fuelBrainFlags';

export type FuelReconSettingsClient = {
  fuelBrainEnabled: boolean;
  fuelBrainShadowCompare: boolean;
  defaultPricePerLiterJmd: number | null;
};

let cached: FuelReconSettingsClient | null = null;
let loadPromise: Promise<FuelReconSettingsClient> | null = null;

function normalize(raw: any): FuelReconSettingsClient {
  const price = Number(raw?.defaultPricePerLiterJmd);
  return {
    fuelBrainEnabled: raw?.fuelBrainEnabled !== false,
    fuelBrainShadowCompare: raw?.fuelBrainShadowCompare === true,
    defaultPricePerLiterJmd: Number.isFinite(price) && price > 0 ? price : null,
  };
}

export function getCachedFuelReconSettings(): FuelReconSettingsClient | null {
  return cached;
}

export function getCachedDefaultPricePerLiterJmd(): number | null {
  return cached?.defaultPricePerLiterJmd ?? null;
}

export async function loadFuelReconciliationSettings(
  force = false,
): Promise<FuelReconSettingsClient> {
  if (!force && cached) return cached;
  if (!force && loadPromise) return loadPromise;
  loadPromise = (async () => {
    const raw = await api.getFuelReconciliationSettings();
    const next = normalize(raw);
    cached = next;
    applyFuelBrainServerSettings({
      fuelBrainEnabled: next.fuelBrainEnabled,
      fuelBrainShadowCompare: next.fuelBrainShadowCompare,
    });
    return next;
  })();
  try {
    return await loadPromise;
  } finally {
    loadPromise = null;
  }
}

export function setCachedFuelReconSettings(patch: Partial<FuelReconSettingsClient>): FuelReconSettingsClient {
  const base = cached ?? {
    fuelBrainEnabled: true,
    fuelBrainShadowCompare: false,
    defaultPricePerLiterJmd: null,
  };
  cached = {
    fuelBrainEnabled:
      typeof patch.fuelBrainEnabled === 'boolean' ? patch.fuelBrainEnabled : base.fuelBrainEnabled,
    fuelBrainShadowCompare:
      typeof patch.fuelBrainShadowCompare === 'boolean'
        ? patch.fuelBrainShadowCompare
        : base.fuelBrainShadowCompare,
    defaultPricePerLiterJmd:
      patch.defaultPricePerLiterJmd !== undefined
        ? patch.defaultPricePerLiterJmd
        : base.defaultPricePerLiterJmd,
  };
  applyFuelBrainServerSettings({
    fuelBrainEnabled: cached.fuelBrainEnabled,
    fuelBrainShadowCompare: cached.fuelBrainShadowCompare,
  });
  return cached;
}
