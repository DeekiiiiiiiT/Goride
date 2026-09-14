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
  cursorDate?: string;
  cursorId?: string;
  limit?: number;
  offset?: number;
  serviceLine?: 'rideshare' | 'rush_delivery' | 'all';
  organizationId?: string;
  paymentSource?: string;
  entryMode?: string;
  type?: string;
  auditStatus?: string;
  driverId?: string;
  vehicleId?: string;
  reconciliationStatus?: string;
  vehiclePlate?: string;
  driverName?: string;
  dateFrom?: string;
  dateTo?: string;
  entryType?: string;
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
