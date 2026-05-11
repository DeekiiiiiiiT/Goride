// Cascading dropdown data for motor-catalog anchors (make -> model -> year).
// Backed by GET /vehicle-catalog-facets (paginated distinct values on the server).

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../components/auth/AuthContext";
import { fetchVehicleCatalogFacets } from "../services/pendingVehicleCatalogService";

export function useVehicleCatalogAnchorFacets(make: string, model: string) {
  const { session } = useAuth();
  const token = session?.access_token;

  const makesQ = useQuery({
    queryKey: ["vehicle-catalog-facets", "make"] as const,
    queryFn: () => fetchVehicleCatalogFacets(token!, { level: "make" }),
    enabled: Boolean(token),
    staleTime: 300_000,
  });

  const modelsQ = useQuery({
    queryKey: ["vehicle-catalog-facets", "model", make.trim().toLowerCase()] as const,
    queryFn: () => fetchVehicleCatalogFacets(token!, { level: "model", make: make.trim() }),
    enabled: Boolean(token) && make.trim().length >= 2,
    staleTime: 300_000,
  });

  const yearsQ = useQuery({
    queryKey: ["vehicle-catalog-facets", "year", make.trim().toLowerCase(), model.trim().toLowerCase()] as const,
    queryFn: () =>
      fetchVehicleCatalogFacets(token!, { level: "year", make: make.trim(), model: model.trim() }),
    enabled: Boolean(token) && make.trim().length >= 2 && model.trim().length >= 2,
    staleTime: 300_000,
  });

  const years = (yearsQ.data?.years ?? []).map((y) => String(y));

  return {
    makes: makesQ.data?.makes ?? [],
    models: modelsQ.data?.models ?? [],
    years,
    loadingMakes: Boolean(token) && makesQ.isLoading,
    loadingModels: Boolean(token) && make.trim().length >= 2 && modelsQ.isLoading,
    loadingYears: Boolean(token) && make.trim().length >= 2 && model.trim().length >= 2 && yearsQ.isLoading,
  };
}
