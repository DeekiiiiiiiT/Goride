/**
 * Week Reconciliation guided wizard — production default ON.
 * Set VITE_RECON_WIZARD=0 only to force classic Fuel/Tolls hub.
 */
export function useReconWizardEnabled(): boolean {
  const raw = import.meta.env.VITE_RECON_WIZARD;
  if (raw === '0' || raw === 'false') return false;
  if (raw === '1' || raw === 'true') return true;
  return true;
}
