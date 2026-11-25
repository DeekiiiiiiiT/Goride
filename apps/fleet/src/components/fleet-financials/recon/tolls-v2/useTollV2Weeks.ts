import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../../utils/supabase/client';
import { isTollReadAccessRefusal } from './tollV2ReadAccess';
import type { TollV2WeeksOverview } from './types';

export async function fetchTollV2Weeks(): Promise<TollV2WeeksOverview> {
  const { data, error } = await supabase.rpc('toll_v2_weeks');
  if (error) throw error;
  return data as TollV2WeeksOverview;
}

export const TOLL_V2_WEEKS_KEY = ['toll-v2-weeks'] as const;

export function useTollV2Weeks(enabled = true) {
  return useQuery({
    queryKey: TOLL_V2_WEEKS_KEY,
    queryFn: fetchTollV2Weeks,
    enabled,
    staleTime: 30_000,
    // A permission refusal (P0001 / 42501) never succeeds on a retry, so don't hammer the RPC. A dropped
    // connection or a busy server is worth one more try (the app's default is a single retry).
    retry: (count, error) => !isTollReadAccessRefusal(error) && count < 1,
  });
}
