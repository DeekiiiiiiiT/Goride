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

export function useInventoryPhase4Enabled(): boolean {
  return useInventoryPhaseFlag('fleet_inventory_phase4_assets');
}

export function useInventoryPhase6Enabled(): boolean {
  return useInventoryPhaseFlag('fleet_inventory_phase6_purchasing');
}

export function useInventoryPhase7Enabled(): boolean {
  return useInventoryPhaseFlag('fleet_inventory_phase7_counts');
}

export function useInventoryPhase8Enabled(): boolean {
  return useInventoryPhaseFlag('fleet_inventory_phase8_telematics');
}

export function useInventoryPhaseFlags() {
  return {
    phase4Assets: useInventoryPhase4Enabled(),
    phase6Purchasing: useInventoryPhase6Enabled(),
    phase7Counts: useInventoryPhase7Enabled(),
    phase8Telematics: useInventoryPhase8Enabled(),
  };
}
