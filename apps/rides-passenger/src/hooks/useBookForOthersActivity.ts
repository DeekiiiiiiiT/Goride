import { useQuery } from '@tanstack/react-query';
import { loadBookForOthersActivity } from '@/services/bookForOthersEdge';

export function useBookForOthersActivity() {
  return useQuery({
    queryKey: ['book-for-others', 'activity'],
    queryFn: loadBookForOthersActivity,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    staleTime: 5_000,
    refetchInterval: () => (document.visibilityState === 'visible' ? 8_000 : false),
  });
}