import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { FinancialTransaction, Trip } from '../types/data';
import { findTollMatches, MatchResult } from '../utils/tollReconciliation';

export function useTollReconciliation() {
  const [loading, setLoading] = useState(true);
  const [unreconciledTolls, setUnreconciledTolls] = useState<FinancialTransaction[]>([]);
  const [reconciledTolls, setReconciledTolls] = useState<FinancialTransaction[]>([]);
  const [unclaimedRefunds, setUnclaimedRefunds] = useState<Trip[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [suggestions, setSuggestions] = useState<Map<string, MatchResult[]>>(new Map());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [rawTx, allTrips] = await Promise.all([
        api.getTransactions(),
        api.getTrips()
      ]);

      // Deduplicate transactions to prevent key collisions
      const uniqueTxMap = new Map();
      rawTx.forEach(tx => uniqueTxMap.set(tx.id, tx));
      const allTx = Array.from(uniqueTxMap.values());

      // 1. Identify Unreconciled Tolls
      // We check for !isReconciled OR !tripId to catch legacy imports that were auto-marked as reconciled but have no link.
      // We also include 'Pending' Cash Claims.
      const tolls = allTx.filter(tx => {
        const isToll = tx.category === 'Toll Usage' || tx.category === 'Tolls';
        if (!isToll) return false;

        // Identify Source: Cash Claim vs Tag Import
        // If it has a receipt or marked as Cash, treat as Driver Claim
        const isCashClaim = tx.paymentMethod === 'Cash' || !!tx.receiptUrl;

        if (isCashClaim) {
            // For Cash Claims, we only want those explicitly waiting for approval
            // If it's Approved/Rejected, it shouldn't appear in the "To Reconcile" list
            return tx.status === 'Pending';
        }

        // For Tag Imports, we want anything that hasn't been linked/reconciled
        return !tx.isReconciled || !tx.tripId;
      });
      
      tolls.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setUnreconciledTolls(tolls);

      // 1b. Identify Reconciled Tolls (for history/undo)
      const reconciled = allTx.filter(tx => 
        (tx.category === 'Toll Usage' || tx.category === 'Tolls') && 
        (tx.isReconciled && tx.tripId)
      );
      reconciled.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setReconciledTolls(reconciled);

      // 2. Identify Linked Trips
      const linkedTripIds = new Set(
        allTx
          .filter(tx => tx.tripId)
          .map(tx => tx.tripId)
      );

      // 3. Identify Unclaimed Refunds (Trips with tollCharges > 0 but no linked transaction)
      const refunds = allTrips.filter(t => 
        (t.tollCharges && t.tollCharges > 0) &&
        !linkedTripIds.has(t.id)
      );
      setUnclaimedRefunds(refunds);

      setTrips(allTrips);

      // Generate suggestions
      const newSuggestions = new Map<string, MatchResult[]>();
      tolls.forEach(toll => {
        const matches = findTollMatches(toll, allTrips);
        if (matches.length > 0) {
          newSuggestions.set(toll.id, matches);
        }
      });
      setSuggestions(newSuggestions);

    } catch (error) {
      console.error("Failed to fetch reconciliation data", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const reconcile = async (transaction: FinancialTransaction, trip: Trip) => {
    try {
        const result = await api.reconcileTollTransaction(transaction, trip);
        
        // Update local state
        setUnreconciledTolls(prev => prev.filter(t => t.id !== transaction.id));
        setReconciledTolls(prev => {
            // Prevent duplicates
            const exists = prev.some(t => t.id === result.transaction.id);
            if (exists) {
                return prev.map(t => t.id === result.transaction.id ? result.transaction : t);
            }
            return [result.transaction, ...prev];
        });
        
        setSuggestions(prev => {
            const next = new Map(prev);
            next.delete(transaction.id);
            return next;
        });
        
        // Update trips list
        setTrips(prev => prev.map(t => t.id === trip.id ? result.trip : t));

        // Update unclaimed refunds (if this trip was one, it is now linked)
        setUnclaimedRefunds(prev => prev.filter(t => t.id !== trip.id));

        return result;
    } catch (error) {
        console.error("Reconciliation failed", error);
        throw error;
    }
  };

  const unreconcile = async (transaction: FinancialTransaction) => {
      try {
          if (!transaction.tripId) return;
          
          const trip = trips.find(t => t.id === transaction.tripId);
          if (!trip) throw new Error("Linked trip not found");

          const result = await api.unreconcileTollTransaction(transaction, trip);

          // Update local state
          setReconciledTolls(prev => prev.filter(t => t.id !== transaction.id));
          
          // Add back to unreconciled
          const newUnreconciled = result.transaction;
          setUnreconciledTolls(prev => {
              const next = [...prev, newUnreconciled];
              return next.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          });

          // Update trips
          setTrips(prev => prev.map(t => t.id === trip.id ? result.trip : t));

          // If trip still has toll charges > 0, it might be unclaimed? 
          // But actually, if we just removed the only toll, it might go back to having 0 toll charges?
          // Or if it had $50 and we removed $25, it still has $25.
          // Wait, if we removed the toll, the tollCharges on the trip decreases.
          // If it decreases to > 0 (meaning other tolls are linked), it is NOT an unclaimed refund (it is linked).
          // If it decreases to 0 (or was unlinked entirely), it depends.
          // "Unclaimed Refund" definition: t.tollCharges > 0 && !linkedTripIds.has(t.id).
          // If we remove the link, does it go back to unclaimed?
          // If the trip has tollCharges > 0 coming from the IMPORT (Uber says "Toll Surcharge: $5"), 
          // then yes, it becomes Unclaimed Refund again because we haven't matched an expense to it.
          
          // Re-evaluate matches for this toll
          const matches = findTollMatches(newUnreconciled, trips); // Note: trips here is stale, but might be okay for initial
          // Ideally use updated trips.
          // Let's just trigger a full suggestion regen or specific one.
          setSuggestions(prev => {
              const next = new Map(prev);
              if (matches.length > 0) next.set(newUnreconciled.id, matches);
              return next;
          });
          
          // To be safe and correct about "Unclaimed Refunds", we might want to just call fetchData or
          // logic is complex to do purely client-side without full re-eval.
          // For now, let's just refresh data after unmatching to be safe.
          // Or, better, optimistic update + fetch.
          
          fetchData(); // Simplest way to ensure consistency

      } catch (error) {
          console.error("Unreconcile failed", error);
          throw error;
      }
  };

  const approve = async (transaction: FinancialTransaction, notes?: string) => {
      try {
          const result = await api.approveExpense(transaction.id, notes);
          const updatedTx = result.data;

          // Update local state
          setUnreconciledTolls(prev => prev.filter(t => t.id !== transaction.id));
          setReconciledTolls(prev => {
              const exists = prev.some(t => t.id === updatedTx.id);
              if (exists) return prev.map(t => t.id === updatedTx.id ? updatedTx : t);
              return [updatedTx, ...prev];
          });
          
          setSuggestions(prev => {
              const next = new Map(prev);
              next.delete(transaction.id);
              return next;
          });
          
          return updatedTx;
      } catch (error) {
          console.error("Approve failed", error);
          throw error;
      }
  };

  const reject = async (transaction: FinancialTransaction, reason?: string) => {
      try {
          const result = await api.rejectExpense(transaction.id, reason);
          const updatedTx = result.data;

          // Update local state
          setUnreconciledTolls(prev => prev.filter(t => t.id !== transaction.id));
          // We add to reconciled list so it appears in history (marked as Rejected)
          setReconciledTolls(prev => {
              const exists = prev.some(t => t.id === updatedTx.id);
              if (exists) return prev.map(t => t.id === updatedTx.id ? updatedTx : t);
              return [updatedTx, ...prev];
          });
          
          setSuggestions(prev => {
              const next = new Map(prev);
              next.delete(transaction.id);
              return next;
          });

          return updatedTx;
      } catch (error) {
          console.error("Reject failed", error);
          throw error;
      }
  };

  const autoMatchAll = async () => {
    // Filter for high confidence matches
    const highConfidenceMatches: { tx: FinancialTransaction, trip: Trip }[] = [];
    
    unreconciledTolls.forEach(tx => {
        const matches = suggestions.get(tx.id);
        if (matches && matches.length > 0) {
            const best = matches[0];
            if (best.confidence === 'high') {
                highConfidenceMatches.push({ tx, trip: best.trip });
            }
        }
    });

    if (highConfidenceMatches.length === 0) return;

    try {
        setLoading(true);
        // Process sequentially to ensure data integrity
        // In a real optimized scenario, we'd have a bulk endpoint
        let updatedTrips = [...trips];
        
        for (const { tx, trip } of highConfidenceMatches) {
            await api.reconcileTollTransaction(tx, trip);
            
            // Update local snapshot for next iteration if needed (though mostly independent)
            // But we need to update the master list for the final state
            updatedTrips = updatedTrips.map(t => {
                if (t.id === trip.id) {
                    return { ...t, tollCharges: (t.tollCharges || 0) + Math.abs(tx.amount) };
                }
                return t;
            });
        }

        // Refresh all data
        await fetchData();
    } catch (e) {
        console.error("Auto-match failed", e);
    } finally {
        setLoading(false);
    }
  };

  return {
    loading,
    unreconciledTolls,
    reconciledTolls,
    unclaimedRefunds,
    trips,
    suggestions,
    reconcile,
    unreconcile,
    approve,
    reject,
    autoMatchAll,
    refresh: fetchData
  };
}
