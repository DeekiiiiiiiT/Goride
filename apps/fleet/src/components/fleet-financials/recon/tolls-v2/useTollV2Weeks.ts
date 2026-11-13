import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../../utils/supabase/client';
import type { TollV2WeeksOverview } from './types';

export async function fetchTollV2Weeks(): Promise<TollV2WeeksOverview> {
  const { data, error } = await supabase.rpc('toll_v2_weeks');
  if (error) throw error;
  return data as TollV2WeeksOverview;
}

export function useTollV2Weeks(enabled = true) {
  return useQuery({
    queryKey: ['toll-v2-weeks'],
    queryFn: fetchTollV2Weeks,
    enabled,
    staleTime: 30_000,
  });
}
