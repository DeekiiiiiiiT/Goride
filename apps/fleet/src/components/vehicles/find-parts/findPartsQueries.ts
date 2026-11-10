import { useQuery } from "@tanstack/react-query";
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

export function usePartsTerm(term: string, vehicleId: string, enabled = true) {
  return useQuery({
    queryKey: ["parts-term", term, vehicleId],
    queryFn: () => api.partsTerm(term, vehicleId),
    enabled: enabled && term.trim().length >= 2 && Boolean(vehicleId),
    staleTime: 30_000,
  });
}

export function usePartsSymptoms(variantId?: string, enabled = true) {
  return useQuery({
    queryKey: ["parts-symptoms", variantId || ""],
    queryFn: () => api.partsSymptoms(variantId),
    enabled,
    staleTime: 120_000,
  });
}

export function usePartsBrowse(variantId?: string, enabled = true) {
  return useQuery({
    queryKey: ["parts-browse", variantId || ""],
    queryFn: () => api.partsBrowse(variantId),
    enabled,
    staleTime: 120_000,
  });
}

export function usePartsComponentFitHints(variantId?: string, componentId?: string, enabled = true) {
  return useQuery({
    queryKey: ["parts-fit-hints", variantId || "", componentId || ""],
    queryFn: () => api.partsComponentFitHints(String(variantId), String(componentId)),
    enabled: enabled && Boolean(variantId && componentId),
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

export function usePartsSavedSearches(enabled = true) {
  return useQuery({
    queryKey: ["parts-saved-searches"],
    queryFn: () => api.partsSavedSearches(),
    enabled,
    staleTime: 60_000,
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
