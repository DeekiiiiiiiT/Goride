import React, { useState } from 'react';
import type { RideRequestRow } from '@roam/types/rides';
import { useRideDispatchContext } from '../../contexts/RideDispatchContext';
import { DriverTripFullscreenShell } from './DriverTripFullscreenShell';
import { CashSettlementScreen } from './CashSettlementScreen';
import { CASH_SETTLEMENT_ENABLED } from '../../lib/cashSettlementFlags';

/** Mandatory full-screen cash settlement — blocks all other driver UI. */
export function DriverCashSettlementOverlay() {
  const { activeRide, submitCashSettlement } = useRideDispatchContext();
  const [submitting, setSubmitting] = useState(false);

  const show = Boolean(
    CASH_SETTLEMENT_ENABLED &&
    activeRide &&
    activeRide.status === 'awaiting_cash_settlement' &&
    activeRide.payment_method === 'cash',
  );

  if (!show || !activeRide) return null;

  const handleSubmit = async (cashReceivedMinor: number, idempotencyKey: string) => {
    setSubmitting(true);
    try {
      await submitCashSettlement(cashReceivedMinor, idempotencyKey);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DriverTripFullscreenShell show={show} rideKey={activeRide.id} ariaLabel="Cash settlement">
      <CashSettlementScreen
        ride={activeRide as RideRequestRow}
        submitting={submitting}
        onSubmit={handleSubmit}
      />
    </DriverTripFullscreenShell>
  );
}
