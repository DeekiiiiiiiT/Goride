import { useCallback, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreatePassengerSavedPlaceBody,
  PassengerSavedPlaceRow,
  UpdatePassengerSavedPlaceBody,
} from '@roam/types/passengerSavedPlaces';
import {
  clearLegacySavedPlaces,
  readLegacySavedPlaces,
} from '@/lib/savedPlaces';
import {
  savedPlaceCreate,
  savedPlaceDelete,
  savedPlaceUpdate,
  savedPlacesList,
} from '@/services/savedPlacesEdge';

const QUERY_KEY = ['passenger-saved-places'] as const;

async function migrateLegacyPlacesIfNeeded(places: PassengerSavedPlaceRow[]) {
  if (places.length > 0) return places;
  const legacy = readLegacySavedPlaces();
  if (!legacy.length) return places;

  const migrated: PassengerSavedPlaceRow[] = [];
  for (const item of legacy) {
    try {
      const { place } = await savedPlaceCreate({
        name: item.name,
        address: item.address,
        lat: item.lat,
        lng: item.lng,
        icon: item.icon,
      });
      migrated.push(place);
    } catch {
      /* skip failed legacy rows */
    }
  }
  if (migrated.length) clearLegacySavedPlaces();
  return migrated;
}

export function useSavedPlaces() {
  const queryClient = useQueryClient();
  const migratedRef = useRef(false);

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await savedPlacesList();
      if (!migratedRef.current) {
        migratedRef.current = true;
        const migrated = await migrateLegacyPlacesIfNeeded(res.places);
        if (migrated.length > res.places.length) {
          await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
          return migrated;
        }
      }
      return res.places;
    },
    staleTime: 30_000,
  });

  const invalidate = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }, [queryClient]);

  const createMutation = useMutation({
    mutationFn: (body: CreatePassengerSavedPlaceBody) => savedPlaceCreate(body),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdatePassengerSavedPlaceBody }) =>
      savedPlaceUpdate(id, body),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => savedPlaceDelete(id),
    onSuccess: invalidate,
  });

  const save = useCallback(
    async (body: CreatePassengerSavedPlaceBody) => {
      const result = await createMutation.mutateAsync(body);
      return result.place;
    },
    [createMutation],
  );

  const update = useCallback(
    async (id: string, body: UpdatePassengerSavedPlaceBody) => {
      const result = await updateMutation.mutateAsync({ id, body });
      return result.place;
    },
    [updateMutation],
  );

  const remove = useCallback(
    async (id: string) => {
      await deleteMutation.mutateAsync(id);
    },
    [deleteMutation],
  );

  useEffect(() => {
    migratedRef.current = false;
  }, [query.dataUpdatedAt]);

  return {
    places: query.data ?? [],
    isLoading: query.isLoading,
    isSaving: createMutation.isPending || updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    refresh: invalidate,
    save,
    update,
    remove,
  };
}
