import { useQuery } from '@tanstack/react-query';
import { activityUpcomingList } from '@/services/activityEdge';

export function useActivityUpcoming() {
  return useQuery({
    queryKey: ['activity', 'upcoming'],
    queryFn: activityUpcomingList,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
