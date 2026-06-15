import React, { useState } from 'react';
import type { RideRequestRow } from '@roam/types/rides';
import { useRideDispatchContext } from '../../contexts/RideDispatchContext';
import { DriverTripFullscreenShell } from './DriverTripFullscreenShell';
import { CashSettlementScreen } from './CashSettlementScreen';
import { CashSettlementResultSheet } from './CashSettlementResultSheet';
import { isAwaitingCashSettlement } from '../../lib/cashSettlementUi';

/** Mandatory full-screen cash settlement — blocks all other driver UI. */
export function DriverCashSettlementOverlay() {
  const {
    activeRide,
    cashSettlementResult,
    submitCashSettlement,
    dismissCashSettlementResult,
  } = useRideDispatchContext();
  const [submitting, setSubmitting] = useState(false);

  const awaitingSettlement =
    Boolean(activeRide?.status === 'awaiting_cash_settlement') || isAwaitingCashSettlement(activeRide);

  const show = Boolean(cashSettlementResult) || awaitingSettlement;

  if (!show || (!activeRide && !cashSettlementResult)) return null;

  const handleSubmit = async (cashReceivedMinor: number, idempotencyKey: string) => {
    setSubmitting(true);
    try {
      await submitCashSettlement(cashReceivedMinor, idempotencyKey);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDone = () => {
    dismissCashSettlementResult();
  };

  return (
    <DriverTripFullscreenShell
      show={show}
      rideKey={activeRide?.id ?? cashSettlementResult?.ride.id ?? 'settlement-result'}
      ariaLabel="Cash settlement"
    >
      {cashSettlementResult ? (
        <CashSettlementResultSheet result={cashSettlementResult} onDone={handleDone} />
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
