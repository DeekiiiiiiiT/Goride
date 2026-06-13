import React, { useState } from 'react';
import type { CashSettlementResponse, RideRequestRow } from '@roam/types/rides';
import { useRideDispatchContext } from '../../contexts/RideDispatchContext';
import { DriverTripFullscreenShell } from './DriverTripFullscreenShell';
import { CashSettlementScreen } from './CashSettlementScreen';
import { CashSettlementResultSheet } from './CashSettlementResultSheet';
import { isAwaitingCashSettlement } from '../../lib/cashSettlementUi';

/** Mandatory full-screen cash settlement — blocks all other driver UI. */
export function DriverCashSettlementOverlay() {
  const { activeRide, submitCashSettlement, dismissCashSettlementResult } = useRideDispatchContext();
  const [submitting, setSubmitting] = useState(false);
  const [settlementResult, setSettlementResult] = useState<CashSettlementResponse | null>(null);

  const show =
    Boolean(settlementResult) ||
    Boolean(activeRide?.status === 'awaiting_cash_settlement') ||
    isAwaitingCashSettlement(activeRide);

  if (!show || (!activeRide && !settlementResult)) return null;

  const handleSubmit = async (cashReceivedMinor: number, idempotencyKey: string) => {
    setSubmitting(true);
    try {
      const result = await submitCashSettlement(cashReceivedMinor, idempotencyKey);
      if (result) setSettlementResult(result);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDone = () => {
    setSettlementResult(null);
    dismissCashSettlementResult();
  };

  return (
    <DriverTripFullscreenShell show={show} rideKey={activeRide?.id ?? 'settlement-result'} ariaLabel="Cash settlement">
      {settlementResult ? (
        <CashSettlementResultSheet result={settlementResult} onDone={handleDone} />
      ) : (
        <CashSettlementScreen
          ride={activeRide as RideRequestRow}
          submitting={submitting}
          onSubmit={handleSubmit}
        />
      )}
    </DriverTripFullscreenShell>
  );
}
