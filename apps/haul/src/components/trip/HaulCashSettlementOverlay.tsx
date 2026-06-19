import React, { useState } from 'react';
import { useRideDispatchContext } from '@roam/driver-internals/contexts/RideDispatchContext';
import type { RideRequestRow } from '@roam/types/rides';
import { HaulTripShell } from './HaulTripShell';
import { HaulCashSettlementView } from './HaulCashSettlementView';
import { HaulCashSettlementResultView } from './HaulCashSettlementResultView';
import { isAwaitingCashSettlement } from '../../utils/haulCashSettlement';

export function HaulCashSettlementOverlay() {
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

  return (
    <HaulTripShell
      show={show}
      rideKey={activeRide?.id ?? cashSettlementResult?.ride.id ?? 'settlement'}
      ariaLabel="Cash settlement"
      zIndex={160}
    >
      {cashSettlementResult ? (
        <HaulCashSettlementResultView result={cashSettlementResult} onDone={dismissCashSettlementResult} />
      ) : (
        <HaulCashSettlementView
          ride={activeRide as RideRequestRow}
          submitting={submitting}
          onSubmit={handleSubmit}
        />
      )}
    </HaulTripShell>
  );
}
