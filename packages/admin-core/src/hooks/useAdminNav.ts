import { useState, useCallback } from 'react';
import type { AdminNavState, AdminNavActions } from '../types/admin';

/**
 * Hook for managing admin portal navigation state.
 * Handles page navigation with history stack for back navigation.
 */
export function useAdminNav(initialPage = 'dashboard'): AdminNavState & AdminNavActions {
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [navHistory, setNavHistory] = useState<string[]>([]);
  const [navData, setNavData] = useState<unknown>(null);

  const navigate = useCallback((page: string, data?: unknown) => {
    setNavHistory(prev => [...prev, currentPage]);
    setNavData(data ?? null);
    setCurrentPage(page);
  }, [currentPage]);

  const back = useCallback(() => {
    const prev = navHistory[navHistory.length - 1];
    if (prev) {
      setNavHistory(h => h.slice(0, -1));
      setCurrentPage(prev);
      setNavData(null);
    }
  }, [navHistory]);

  const setPage = useCallback((page: string) => {
    setCurrentPage(page);
    setNavData(null);
  }, []);

  return {
    currentPage,
    navHistory,
    navData,
    navigate,
    back,
    setPage,
  };
}
