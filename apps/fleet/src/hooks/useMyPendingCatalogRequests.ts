// Single source of truth for the org's open vehicle-catalog pending requests.
//
// Replaces two ad-hoc useQuery copies in VehiclesPage and VehicleDetail and
// the 30s setInterval in VehicleDetail. Keeps the same query key
// (`vehicle-catalog-pending-my`) so existing `queryClient.invalidateQueries`
// calls keep working untouched.
//
// Refresh strategy:
//   - refetchOnWindowFocus: 'always' makes approvals show up the moment the
//     operator returns to the tab.
//   - refetchInterval is 12s only while there are open items. Once the queue
//     is empty we stop polling, so a clean org pays nothing.
//   - staleTime 60s keeps rapid focus toggles cheap.

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../components/auth/AuthContext";
import { listMyPendingCatalogRequests } from "../services/pendingVehicleCatalogService";
import type { VehicleCatalogPendingRequest } from "../types/vehicleCatalogPending";

export const MY_PENDING_CATALOG_QUERY_KEY = ["vehicle-catalog-pending-my"] as const;

export type MyPendingCatalogResult = {
  items: VehicleCatalogPendingRequest[];
};

const OPEN_STATUSES = new Set<VehicleCatalogPendingRequest["status"]>([
  "pending",
  "needs_info",
]);

export function useMyPendingCatalogRequests() {
  const { session } = useAuth();
  const token = session?.access_token;

  return useQuery<MyPendingCatalogResult>({
    queryKey: MY_PENDING_CATALOG_QUERY_KEY,
    queryFn: () => listMyPendingCatalogRequests(token!),
    enabled: Boolean(token),
    staleTime: 60_000,
    refetchOnWindowFocus: "always",
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      const hasOpen = items.some((r) => OPEN_STATUSES.has(r.status));
      return hasOpen ? 12_000 : false;
    },
  });
}
