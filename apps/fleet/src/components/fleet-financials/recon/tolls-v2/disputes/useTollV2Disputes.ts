import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../../../utils/supabase/client';
import type { TollV2DisputeRow } from '../types';

export type TollV2DisputesByDriver = {
  driverId: string;
  driverName?: string | null;
  toSend: number;
  sent: number;
  late: number;
  leftMinor: number;
};

export type TollV2DisputesTab = {
  active: Array<TollV2DisputeRow & { chargeWeekKey?: string }>;
  byDriver: TollV2DisputesByDriver[];
};

/** Driver Settlements → Disputes (UI2): public.toll_v2_disputes(p_driver). Always read for every driver, so the
 *  tiles and chips count everyone; the driver chip filters on screen. Empty lists while the switch is off. */
export async function fetchTollV2Disputes(): Promise<TollV2DisputesTab> {
  const { data, error } = await supabase.rpc('toll_v2_disputes', { p_driver: null });
  if (error) throw error;
  const d = (data ?? {}) as Partial<TollV2DisputesTab>;
  return { active: d.active ?? [], byDriver: d.byDriver ?? [] };
}

export const TOLL_V2_DISPUTES_KEY = ['toll-v2-disputes'] as const;

export function useTollV2Disputes(enabled = true) {
  return useQuery({ queryKey: TOLL_V2_DISPUTES_KEY, queryFn: fetchTollV2Disputes, enabled, staleTime: 15_000 });
}

/** The three tiles, summed from the server's rows (same rules as the week desk's tiles: Late overlaps the others). */
export function disputeTiles(active: TollV2DisputeRow[]) {
  const sum = (rows: TollV2DisputeRow[]) => rows.reduce((n, r) => n + (r.leftMinor ?? 0), 0);
  const toSend = active.filter((r) => r.state === 'to_send');
  const sent = active.filter((r) => r.state === 'sent');
  const late = active.filter((r) => r.late);
  return {
    toSend: { count: toSend.length, amountMinor: sum(toSend) },
    sent: { count: sent.length, amountMinor: sum(sent) },
    late: { count: late.length, amountMinor: sum(late) },
  };
}
