import { useQuery, keepPreviousData } from '@tanstack/react-query';

export type LedgerFilterBody = {
  startDate?: string;
  endDate?: string;
  search?: string;
  platform?: string;
  status?: string;
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
  cursor?: string;
  limit?: number;
  offset?: number;
  serviceLine?: 'rideshare' | 'rush_delivery' | 'all';
  organizationId?: string;
};

export function useLedgerQuery<TData>(opts: {
  domain: string;
  filters: LedgerFilterBody;
  queryFn: (filters: LedgerFilterBody) => Promise<TData>;
  enabled?: boolean;
  staleTime?: number;
}) {
  const { domain, filters, queryFn, enabled = true, staleTime = 30_000 } = opts;
  return useQuery({
    queryKey: ['ledger', domain, filters],
    queryFn: () => queryFn(filters),
    enabled,
    staleTime,
    placeholderData: keepPreviousData,
  });
}
