import { useFeatureFlags } from '../components/auth/FeatureFlagContext';

function readEnvFlag(name: string): boolean | undefined {
  const raw = import.meta.env[name];
  if (raw === '1' || raw === 'true') return true;
  if (raw === '0' || raw === 'false') return false;
  return undefined;
}

export function useInventoryPhaseFlag(flagName: string): boolean {
  const envKey = `VITE_${flagName.toUpperCase()}`;
  const envOverride = readEnvFlag(envKey);
  const { enabledModules } = useFeatureFlags();
  if (envOverride !== undefined) return envOverride;
  return enabledModules[flagName] === true;
}

/**
 * Phase 2 stock UI + API — gated by platform flag `fleet_inventory_phase2_stock`.
 * Set VITE_FLEET_INVENTORY_PHASE2=1 locally to force the desk on.
 */
export function useInventoryPhase2Enabled(): boolean {
  const raw = import.meta.env.VITE_FLEET_INVENTORY_PHASE2;
  if (raw === '1' || raw === 'true') return true;
  if (raw === '0' || raw === 'false') return false;
  return useInventoryPhaseFlag('fleet_inventory_phase2_stock');
}

export function useInventoryPhase3Enabled(): boolean {
  return useInventoryPhaseFlag('fleet_inventory_phase3_kits');
}
