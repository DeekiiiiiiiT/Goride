import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  bulkStations,
  createStation,
  getStation,
  listStations,
  patchStation,
  verifyStation,
  type StationFilters,
} from "./stationRegisterApi";

export function useStationList(filters: StationFilters) {
  return useQuery({
    queryKey: ["station-register", filters],
    queryFn: () => listStations(filters),
    placeholderData: (previous) => previous,
  });
}

export function useStationDetail(id: string | null) {
  return useQuery({
    queryKey: ["station-register", "detail", id],
    queryFn: () => getStation(id as string),
    enabled: Boolean(id),
  });
}

export function useStationMutations() {
  const client = useQueryClient();
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ["station-register"] });
  };
  return {
    patch: useMutation({
      mutationFn: ({ id, changed, reason }: { id: string; changed: Record<string, unknown>; reason: string }) =>
        patchStation(id, changed, reason),
      onSuccess: refresh,
    }),
    create: useMutation({ mutationFn: createStation, onSuccess: refresh }),
    bulk: useMutation({
      mutationFn: ({ action, ids, reason, extra }: { action: string; ids: string[]; reason: string; extra?: Record<string, unknown> }) =>
        bulkStations(action, ids, reason, extra),
      onSuccess: refresh,
    }),
    verify: useMutation({ mutationFn: verifyStation, onSuccess: refresh }),
  };
}
