import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../services/api";
import type { PartsActivity } from "./PartsActivityPanel";

export function usePartsMyVehicles(enabled = true) {
  return useQuery({
    queryKey: ["parts-my-vehicles"],
    queryFn: () => api.partsMyVehicles(),
    enabled,
    staleTime: 60_000,
  });
}

export function usePartsVehicleOptions(make?: string, model?: string, enabled = true) {
  return useQuery({
    queryKey: ["parts-vehicle-options", make || "", model || ""],
    queryFn: () => api.partsVehicleOptions({ make, model }),
    enabled,
    staleTime: 120_000,
  });
}

export function usePartsTerm(term: string, enabled = true) {
  return useQuery({
    queryKey: ["parts-term", term],
    queryFn: () => api.partsTerm(term),
    enabled: enabled && term.trim().length >= 2,
    staleTime: 30_000,
  });
}

export function usePartsSymptoms(enabled = true) {
  return useQuery({
    queryKey: ["parts-symptoms"],
    queryFn: () => api.partsSymptoms(),
    enabled,
    staleTime: 120_000,
  });
}

export function usePartsBrowse(enabled = true) {
  return useQuery({
    queryKey: ["parts-browse"],
    queryFn: () => api.partsBrowse(),
    enabled,
    staleTime: 120_000,
  });
}

export function usePartsVehicleContext(vehicleId: string, componentId?: string, enabled = true) {
  return useQuery({
    queryKey: ["parts-vehicle-context", vehicleId, componentId || ""],
    queryFn: () => api.partsVehicleContext(vehicleId, componentId),
    enabled: enabled && Boolean(vehicleId),
    staleTime: 60_000,
  });
}

export function useWrongFitCount(enabled = true) {
  return useQuery({
    queryKey: ["parts-wrong-fit-count"],
    queryFn: () => api.wrongFitCount(),
    enabled,
    staleTime: 120_000,
  });
}

export function usePartsRunnerOnline(enabled = true) {
  return useQuery({
    queryKey: ["parts-runner-online"],
    queryFn: () => api.partsRunnerOnline(),
    enabled,
    staleTime: 30_000,
  });
}

export function usePartsList(enabled = true) {
  return useQuery({
    queryKey: ["parts-list"],
    queryFn: () => api.partsList(),
    enabled,
    staleTime: 30_000,
  });
}

export function usePartsSavedSearches(enabled = true) {
  return useQuery({
    queryKey: ["parts-saved-searches"],
    queryFn: () => api.partsSavedSearches(),
    enabled,
    staleTime: 60_000,
  });
}

export function usePartsSupplierSync(enabled = true) {
  return useQuery({
    queryKey: ["parts-supplier-sync"],
    queryFn: () => api.partsSupplierSync(),
    enabled,
    staleTime: 30_000,
  });
}

export function usePartsActivity(enabled = true) {
  return useQuery({
    queryKey: ["parts-activity"],
    queryFn: () => api.partsActivity() as Promise<PartsActivity>,
    enabled,
    staleTime: 60_000,
  });
}

export function useForcePartsSupplierSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.forcePartsSupplierSync(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["parts-supplier-sync"] });
      void qc.invalidateQueries({ queryKey: ["parts-activity"] });
    },
  });
}
