import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../../utils/supabase/client';
import type { TollV2Desk } from './types';

export async function fetchTollV2Desk(weekKey: string): Promise<TollV2Desk> {
  const { data, error } = await supabase.rpc('toll_v2_week_desk', { p_week: weekKey });
  if (error) throw error;
  return data as TollV2Desk;
}

export function useTollV2Desk(weekKey: string, enabled = true) {
  const query = useQuery({
    queryKey: ['toll-v2-desk', weekKey],
    queryFn: () => fetchTollV2Desk(weekKey),
    enabled: Boolean(weekKey) && enabled,
    staleTime: 0,
    refetchInterval: (q) => (q.state.data?.matcherBusy ? 5000 : false),
  });
  return query;
}

export function useTollV2Enabled() {
  return useQuery({
    queryKey: ['toll-v2-enabled'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('toll_v2_enabled');
      if (error) throw error;
      return data === true;
    },
    staleTime: 60_000,
    retry: false,
  });
}
