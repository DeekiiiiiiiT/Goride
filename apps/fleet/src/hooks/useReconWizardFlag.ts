/**
 * Week Reconciliation guided wizard (P3). Env override; server flag optional later.
 */
export function useReconWizardEnabled(): boolean {
  const raw = import.meta.env.VITE_RECON_WIZARD;
  if (raw === '1' || raw === 'true') return true;
  if (raw === '0' || raw === 'false') return false;
  return false;
}
