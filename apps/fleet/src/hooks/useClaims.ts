import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';
import { Claim } from '../types/data';

export function useClaims(driverId?: string) {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  // Only blank the UI on first load — action refreshes stay silent
  const isInitialLoad = useRef(true);

  const fetchClaims = useCallback(async () => {
    const blockUi = isInitialLoad.current;
    if (blockUi) setLoading(true);
    try {
      const data = await api.getClaims(driverId);
      // Sort by updatedAt desc
      data.sort((a: Claim, b: Claim) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      setClaims(data);
    } catch (error) {
      console.error("Failed to fetch claims", error);
    } finally {
      isInitialLoad.current = false;
      if (blockUi) setLoading(false);
    }
  }, [driverId]);

  useEffect(() => {
    isInitialLoad.current = true;
    setLoading(true);
    fetchClaims();
  }, [fetchClaims]);

  const createClaim = async (claimData: Partial<Claim>) => {
    try {
      const result = await api.saveClaim(claimData);
      setClaims(prev => [result.data, ...prev]);
      return result.data;
    } catch (error) {
      console.error("Failed to create claim", error);
      throw error;
    }
  };

  const updateClaim = async (claim: Claim) => {
      try {
          const result = await api.saveClaim(claim);
          setClaims(prev => prev.map(c => c.id === claim.id ? result.data : c));
          return result.data;
      } catch (error) {
          console.error("Failed to update claim", error);
          throw error;
      }
  }

  const deleteClaim = async (id: string) => {
      try {
          await api.deleteClaim(id);
          setClaims(prev => prev.filter(c => c.id !== id));
      } catch (error) {
          console.error("Failed to delete claim", error);
          throw error;
      }
  }

  return {
    claims,
    loading,
    createClaim,
    updateClaim,
    deleteClaim,
    refresh: fetchClaims
  };
}
