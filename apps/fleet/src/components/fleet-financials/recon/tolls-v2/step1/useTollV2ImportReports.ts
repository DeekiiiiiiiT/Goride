import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../../../utils/supabase/client';
import type { TollV2ImportReportsPayload } from './tollV2ImportTypes';

export async function fetchTollV2ImportReports(weekKey: string): Promise<TollV2ImportReportsPayload> {
  const { data, error } = await supabase.rpc('toll_v2_import_reports', { p_week: weekKey });
  if (error) throw error;
  return (data ?? []) as TollV2ImportReportsPayload;
}

export function useTollV2ImportReports(weekKey: string, enabled = true) {
  return useQuery({
    queryKey: ['toll-v2-import-reports', weekKey],
    queryFn: () => fetchTollV2ImportReports(weekKey),
    enabled: Boolean(weekKey) && enabled,
    staleTime: 30_000,
  });
}
