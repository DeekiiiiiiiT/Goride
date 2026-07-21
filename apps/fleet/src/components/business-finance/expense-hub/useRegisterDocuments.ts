/**
 * Register-only paged documents query.
 * The /documents API already supports limit/offset and returns total;
 * the shared useExpenseHubDocuments hook doesn't expose paging, so this wraps
 * the same service + query keys with keepPreviousData for smooth page flips.
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { expenseHubKeys } from '../../../hooks/useExpenseHub';
import { expenseHubService } from '../../../services/expenseHubService';

export const REGISTER_PAGE_SIZE = 25;

export function useRegisterDocuments(filters: {
  status?: string;
  vehicleId?: string;
  q?: string;
  offset: number;
  limit?: number;
}) {
  const params = { limit: REGISTER_PAGE_SIZE, ...filters };
  return useQuery({
    queryKey: expenseHubKeys.documents(params),
    queryFn: () => expenseHubService.listDocuments(params),
    placeholderData: keepPreviousData,
  });
}
