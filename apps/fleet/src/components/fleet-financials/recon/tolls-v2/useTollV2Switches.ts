import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../../utils/supabase/client';

export type TollV2Switches = { tollDisputes: boolean; loggedTrips: boolean; riderPaysDriver: boolean };

const OFF: TollV2Switches = { tollDisputes: false, loggedTrips: false, riderPaysDriver: false };

/** The company's toll switches (public.toll_v2_toll_settings → switches). Any failure reads as "all off", so the
 *  Tolls step keeps today's layout: with a switch off the screen must look exactly as today (audit, switches rule). */
export async function fetchTollV2Switches(): Promise<TollV2Switches> {
  const { data, error } = await supabase.rpc('toll_v2_toll_settings');
  if (error || !data) return OFF;
  const s = (data as { switches?: Partial<TollV2Switches> | null }).switches;
  return {
    tollDisputes: s?.tollDisputes === true,
    loggedTrips: s?.loggedTrips === true,
    riderPaysDriver: s?.riderPaysDriver === true,
  };
}

export function useTollV2Switches() {
  return useQuery({
    queryKey: ['toll-v2-switches'],
    queryFn: fetchTollV2Switches,
    staleTime: 60_000,
    retry: false,
  });
}
