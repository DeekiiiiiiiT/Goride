// Cascading dropdown data for catalog anchors (make -> model -> year).

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../components/auth/AuthContext";
import { fetchVehicleCatalogFacets } from "../services/pendingVehicleCatalogService";
import type { VehicleClass } from "../types/vehicleCatalog";

export function useVehicleCatalogAnchorFacets(
  make: string,
  model: string,
  vehicleClass?: VehicleClass | null,
) {
  const { session } = useAuth();
  const token = session?.access_token;
  const classKey = vehicleClass === "motorcycle" || vehicleClass === "car" ? vehicleClass : "";

  const makesQ = useQuery({
    queryKey: ["vehicle-catalog-facets", "make", classKey] as const,
    queryFn: () =>
      fetchVehicleCatalogFacets(token!, {
        level: "make",
        ...(classKey ? { vehicle_class: classKey } : {}),
      }),
    enabled: Boolean(token),
    staleTime: 300_000,
  });

  const modelsQ = useQuery({
    queryKey: ["vehicle-catalog-facets", "model", make.trim().toLowerCase(), classKey] as const,
    queryFn: () =>
      fetchVehicleCatalogFacets(token!, {
        level: "model",
        make: make.trim(),
        ...(classKey ? { vehicle_class: classKey } : {}),
      }),
    enabled: Boolean(token) && make.trim().length >= 2,
    staleTime: 300_000,
  });

  const yearsQ = useQuery({
    queryKey: [
      "vehicle-catalog-facets",
      "year",
      make.trim().toLowerCase(),
      model.trim().toLowerCase(),
      classKey,
    ] as const,
    queryFn: () =>
      fetchVehicleCatalogFacets(token!, {
        level: "year",
        make: make.trim(),
        model: model.trim(),
        ...(classKey ? { vehicle_class: classKey } : {}),
      }),
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
