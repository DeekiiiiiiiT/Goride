import { useInfiniteQuery } from '@tanstack/react-query';
import { activityTripsList } from '@/services/activityEdge';

const PAGE_SIZE = 20;

export function useActivityTrips() {
  return useInfiniteQuery({
    queryKey: ['activity', 'trips'],
    queryFn: ({ pageParam }) => activityTripsList({
      limit: PAGE_SIZE,
      cursor: pageParam ?? null,
    }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
