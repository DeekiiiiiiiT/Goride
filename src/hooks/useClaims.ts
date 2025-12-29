import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { Claim } from '../types/data';

export function useClaims(driverId?: string) {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchClaims = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getClaims(driverId);
      // Sort by updatedAt desc
      data.sort((a: Claim, b: Claim) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      setClaims(data);
    } catch (error) {
      console.error("Failed to fetch claims", error);
    } finally {
      setLoading(false);
    }
  }, [driverId]);

  useEffect(() => {
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

  return {
    claims,
    loading,
    createClaim,
    updateClaim,
    refresh: fetchClaims
  };
}
