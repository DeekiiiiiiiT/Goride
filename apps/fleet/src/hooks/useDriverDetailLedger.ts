/**
 * Ledger driver-overview fetch for Driver Detail (Phase 14 — date-range aware).
 * Repair handlers stay in DriverDetail (need allTrips); they bump refreshKey via setLedgerRefreshKey.
 */
import * as React from 'react';
import type { LedgerDriverOverview } from '../types/data';
import { api } from '../services/api';

export type UseDriverDetailLedgerArgs = {
  driverId: string;
  startDate?: string;
  endDate?: string;
  selectedPlatforms: Set<string>;
};

export function useDriverDetailLedger({
  driverId,
  startDate,
  endDate,
  selectedPlatforms,
}: UseDriverDetailLedgerArgs) {
  const [ledgerOverview, setLedgerOverview] = React.useState<LedgerDriverOverview | null>(null);
  const [ledgerOverviewLoaded, setLedgerOverviewLoaded] = React.useState(false);
  const [ledgerRefreshKey, setLedgerRefreshKey] = React.useState(0);

  React.useEffect(() => {
    if (!startDate || !endDate) return;
    let cancelled = false;
    const fetchLedgerOverview = async () => {
      try {
        const platforms = selectedPlatforms.has('All')
          ? undefined
          : Array.from(selectedPlatforms);
        const result = await api.getLedgerDriverOverview({
          driverId,
          startDate,
          endDate,
          platforms,
        });
        if (!cancelled) {
          setLedgerOverview(result);
        }
      } catch (err) {
        console.error('[DriverDetail LEDGER] Overview fetch failed (non-blocking):', err);
      } finally {
        if (!cancelled) setLedgerOverviewLoaded(true);
      }
    };
    setLedgerOverviewLoaded(false);
    fetchLedgerOverview();
    return () => {
      cancelled = true;
    };
  }, [driverId, startDate, endDate, selectedPlatforms, ledgerRefreshKey]);

  return {
    ledgerOverview,
    ledgerOverviewLoaded,
    ledgerRefreshKey,
    setLedgerRefreshKey,
  };
}
