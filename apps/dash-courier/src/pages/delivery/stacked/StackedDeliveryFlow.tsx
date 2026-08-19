import React, { useCallback, useMemo, useState } from 'react';
import { toast } from '@/lib/toast';
import { commitDelivered, commitPickup } from '@/lib/orderMutation';
import type { StackedRouteStop, StackedStopId } from '@/lib/mockStackedRoute';
import { getCompletedStopIdsFromRoute } from '@/lib/stackedRouteBuilder';
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
  route: StackedRouteStop[];
  onComplete: () => void;
  onRequestUnassign: () => void;
  onReportIssue?: () => void;
};

export function StackedDeliveryFlow({
  route,
  onComplete,
  onRequestUnassign,
  onReportIssue,
}: StackedDeliveryFlowProps) {
  const [stopIndex, setStopIndex] = useState(0);
  const [phase, setPhase] = useState<StackedFlowPhase>('pickup-nav');
  const [submitting, setSubmitting] = useState(false);
  const [completedDeliveryStops, setCompletedDeliveryStops] = useState<StackedRouteStop[]>([]);

  const currentStop = route[stopIndex];
  const completedStopIds = useMemo(
    () => getCompletedStopIdsFromRoute(route, stopIndex),
    [route, stopIndex],
  );

  const deliveryStops = useMemo(() => route.filter((s) => s.type === 'delivery'), [route]);

  if (!currentStop || route.length === 0) return null;

  const advanceStop = useCallback(() => {
    const nextIndex = stopIndex + 1;
    if (nextIndex >= route.length) {
      setPhase('summary');
      return;
    }
    setStopIndex(nextIndex);
    const next = route[nextIndex];
    setPhase(next.type === 'pickup' ? 'pickup-nav' : 'deliver-nav');
  }, [stopIndex, route]);

  const handleConfirmPickup = useCallback(
    async (photoPath?: string) => {
      if (submitting) return;
      setSubmitting(true);
      const result = await commitPickup(currentStop.backendOrderId, photoPath);
      setSubmitting(false);
      if (!result.ok) {
        toast.error('Pickup failed', result.error);
        return;
      }
      toast.success('Pickup confirmed', `Order from ${currentStop.name} loaded.`);
      advanceStop();
    },
    [advanceStop, currentStop, submitting],
  );

  const handleDeliveryComplete = useCallback(
    async (photoPath?: string) => {
      if (submitting) return;
      setSubmitting(true);
      const result = await commitDelivered(currentStop.backendOrderId, photoPath);
      setSubmitting(false);
      if (!result.ok) {
        toast.error('Delivery failed', result.error);
        return;
      }
      setCompletedDeliveryStops((prev) => [...prev, currentStop]);
      const completedCount = completedDeliveryStops.length + 1;
      if (completedCount < deliveryStops.length) {
        const nextDelivery = deliveryStops[completedCount];
        if (nextDelivery) {
          setPhase('leg-complete');
          return;
        }
      }
      setPhase('summary');
    },
    [submitting, currentStop, completedDeliveryStops.length, deliveryStops],
  );

  const handleContinueAfterLeg = useCallback(() => {
    const nextDeliveryIndex = route.findIndex(
      (s, i) => i > stopIndex && s.type === 'delivery',
    );
    if (nextDeliveryIndex >= 0) {
      setStopIndex(nextDeliveryIndex);
      setPhase('deliver-nav');
    } else {
      setPhase('summary');
    }
  }, [route, stopIndex]);

  const handleNavigate = useCallback(() => {
    toast.info('Opening navigation', currentStop.address);
  }, [currentStop.address]);

  const totalEarnings = useMemo(
    () => completedDeliveryStops.reduce((sum, s) => sum + s.earnings, 0),
    [completedDeliveryStops],
  );

  if (phase === 'summary') {
    return (
      <StackedDeliverySummaryPage
        totalEarnings={totalEarnings}
        legs={completedDeliveryStops.map((s) => ({
          id: s.id,
          label: s.name,
          customerName: s.customerName || s.name,
          earnings: s.earnings,
        }))}
        onBackToDash={onComplete}
      />
    );
  }

  if (phase === 'leg-complete') {
    const nextDelivery = deliveryStops[completedDeliveryStops.length];
    return (
      <StackedLegCompletePage
        stop={currentStop}
        nextCustomerName={nextDelivery?.customerName}
        onContinue={handleContinueAfterLeg}
      />
    );
  }

  if (currentStop.type === 'pickup') {
    if (phase === 'at-pickup') {
      return (
        <StackedAtPickupPage
          stop={currentStop}
          submitting={submitting}
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

  const deliveryIndex = (deliveryStops.findIndex((s) => s.id === currentStop.id) + 1) as 1 | 2;

  return (
    <StackedDeliverNavPage
      stop={currentStop}
      completedStopIds={completedStopIds}
      deliveryIndex={deliveryIndex}
      submitting={submitting}
      onBack={onRequestUnassign}
      onHelp={onReportIssue}
      onMessage={() => toast.info('Message', `Chat with ${currentStop.customerName}`)}
      onNavigate={handleNavigate}
      onComplete={handleDeliveryComplete}
    />
  );
}
