import React, { useCallback, useMemo, useState } from 'react';
import { toast } from '@/lib/toast';
import {
  MOCK_STACKED_ROUTE,
  getCompletedStopIds,
  type StackedStopId,
} from '@/lib/mockStackedRoute';
import { StackedPickupNavPage } from '@/pages/delivery/stacked/StackedPickupNavPage';
import { StackedAtPickupPage } from '@/pages/delivery/stacked/StackedAtPickupPage';
import { StackedDeliverNavPage } from '@/pages/delivery/stacked/StackedDeliverNavPage';
import { StackedLegCompletePage } from '@/pages/delivery/stacked/StackedLegCompletePage';
import { StackedDeliverySummaryPage } from '@/pages/delivery/stacked/StackedDeliverySummaryPage';

type StackedFlowPhase =
  | 'pickup-nav'
  | 'at-pickup'
  | 'deliver-nav'
  | 'leg-complete'
  | 'summary';

type StackedDeliveryFlowProps = {
  onComplete: () => void;
  onRequestUnassign: () => void;
  onReportIssue?: () => void;
};

export function StackedDeliveryFlow({
  onComplete,
  onRequestUnassign,
  onReportIssue,
}: StackedDeliveryFlowProps) {
  const [stopIndex, setStopIndex] = useState(0);
  const [phase, setPhase] = useState<StackedFlowPhase>('pickup-nav');

  const currentStop = MOCK_STACKED_ROUTE[stopIndex];
  const completedStopIds = useMemo(
    () => getCompletedStopIds(stopIndex),
    [stopIndex],
  );

  const advanceStop = useCallback(() => {
    const nextIndex = stopIndex + 1;
    if (nextIndex >= MOCK_STACKED_ROUTE.length) {
      setPhase('summary');
      return;
    }
    setStopIndex(nextIndex);
    const next = MOCK_STACKED_ROUTE[nextIndex];
    setPhase(next.type === 'pickup' ? 'pickup-nav' : 'deliver-nav');
  }, [stopIndex]);

  const handleConfirmPickup = useCallback(() => {
    toast.success('Pickup confirmed', `Order from ${currentStop.name} loaded.`);
    advanceStop();
  }, [advanceStop, currentStop.name]);

  const handleDeliveryComplete = useCallback(() => {
    if (currentStop.id === 'd1') {
      setPhase('leg-complete');
      return;
    }
    setPhase('summary');
  }, [currentStop.id]);

  const handleContinueAfterLeg = useCallback(() => {
    setStopIndex(3);
    setPhase('deliver-nav');
  }, []);

  const handleNavigate = useCallback(() => {
    toast.info('Opening navigation', currentStop.address);
  }, [currentStop.address]);

  if (phase === 'summary') {
    return <StackedDeliverySummaryPage onBackToDash={onComplete} />;
  }

  if (phase === 'leg-complete' && currentStop.id === 'd1') {
    const nextStop = MOCK_STACKED_ROUTE[3];
    return (
      <StackedLegCompletePage
        stop={currentStop}
        nextCustomerName={nextStop.customerName}
        onContinue={handleContinueAfterLeg}
      />
    );
  }

  if (currentStop.type === 'pickup') {
    if (phase === 'at-pickup') {
      return (
        <StackedAtPickupPage
          stop={currentStop}
          onBack={() => setPhase('pickup-nav')}
          onConfirmPickup={handleConfirmPickup}
        />
      );
    }

    return (
      <StackedPickupNavPage
        stop={currentStop}
        completedStopIds={completedStopIds}
        onBack={onRequestUnassign}
        onHelp={onReportIssue}
        onNavigate={handleNavigate}
        onArrived={() => setPhase('at-pickup')}
      />
    );
  }

  const deliveryIndex: 1 | 2 = currentStop.id === 'd1' ? 1 : 2;

  return (
    <StackedDeliverNavPage
      stop={currentStop}
      completedStopIds={completedStopIds}
      deliveryIndex={deliveryIndex}
      onBack={onRequestUnassign}
      onHelp={onReportIssue}
      onMessage={() => toast.info('Message', `Chat with ${currentStop.customerName}`)}
      onNavigate={handleNavigate}
      onComplete={handleDeliveryComplete}
    />
  );
}
