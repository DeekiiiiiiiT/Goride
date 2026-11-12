import { useQuery } from '@tanstack/react-query';
import { fetchReconV2Switch } from '../services/reconApi';

/**
 * Week Reconciliation switch-over (audit §9). Off by default: the old close path
 * (Driver Settlements → Close Week, Fuel and Toll pages) is used. On: every week is
 * done inside Week Reconciliation. VITE_RECON_V2=1 / 0 forces it for a private copy.
 */
/** undefined while the switch is still loading, so pages never jump before it is known. */
export function useReconV2(enabled = true): boolean | undefined {
  const raw = import.meta.env.VITE_RECON_V2;
  const forced = raw === '1' || raw === 'true' ? true : raw === '0' || raw === 'false' ? false : undefined;
  const query = useQuery({
    queryKey: ['recon-v2-switch'],
    queryFn: fetchReconV2Switch,
    enabled: enabled && forced === undefined,
    staleTime: 5 * 60_000,
    retry: false,
  });
  if (forced !== undefined) return forced;
  if (!enabled) return undefined;
  return query.data;
}
