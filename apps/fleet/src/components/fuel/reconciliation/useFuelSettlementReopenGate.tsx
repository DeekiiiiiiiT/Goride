/**
 * Promise-based settlement reopen confirm for fuel finalize paths.
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  assessFuelFinalizeSettlementImpact,
  type FuelFinalizeReportLike,
  type FuelSettlementReopenImpact,
} from '../../../utils/fuelFinalizeSettlementImpact';
import { FuelSettlementReopenDialog } from './FuelSettlementReopenDialog';

export function useFuelSettlementReopenGate() {
  const [impacts, setImpacts] = useState<FuelSettlementReopenImpact[] | null>(null);
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);

  const resolve = useCallback((ok: boolean) => {
    resolverRef.current?.(ok);
    resolverRef.current = null;
    setImpacts(null);
  }, []);

  const confirmIfNeeded = useCallback(async (reports: FuelFinalizeReportLike[]) => {
    const list = await assessFuelFinalizeSettlementImpact(reports);
    if (!list.length) return true;
    return new Promise<boolean>((res) => {
      resolverRef.current = res;
      setImpacts(list);
    });
  }, []);

  const dialog = (
    <FuelSettlementReopenDialog
      open={!!impacts?.length}
      impacts={impacts || []}
      onConfirm={() => resolve(true)}
      onCancel={() => resolve(false)}
    />
  );

  return { confirmIfNeeded, dialog };
}
