import type { Order } from '../types/order';
import { computeCancellationRatePercent } from './order-utils';

export const ACCEPTANCE_RATE_TARGET = 85;
export const CANCELLATION_RATE_TARGET = 5;
export const MIN_ORDERS_FOR_PERFORMANCE_WARNING = 5;

export interface PerformanceMetrics {
  acceptanceRate: number;
  cancellationRate: number;
  sampleSize: number;
}

export function computeAcceptanceRatePercent(orders: Order[]) {
  const accepted = orders.filter((order) =>
    ['accepted', 'preparing', 'ready', 'delivered'].includes(order.status),
  );
  const rejected = orders.filter(
    (order) => order.status === 'cancelled' && order.cancelled_by === 'merchant',
  );
  const pending = orders.filter((order) => order.status === 'placed');

  const sample = accepted.length + rejected.length + pending.length;
  if (sample === 0) return 100;

  return Math.round((accepted.length / sample) * 100);
}

export function computePerformanceMetrics(
  completedOrders: Order[],
  cancelledOrders: Order[],
  activeOrders: Order[],
): PerformanceMetrics {
  const acceptanceRate = computeAcceptanceRatePercent(activeOrders);
  const cancellationRate = computeCancellationRatePercent(
    completedOrders.length,
    cancelledOrders.length,
  );

  return {
    acceptanceRate,
    cancellationRate,
    sampleSize: completedOrders.length + cancelledOrders.length,
  };
}

export function isPoorPerformance(metrics: PerformanceMetrics) {
  if (metrics.sampleSize < MIN_ORDERS_FOR_PERFORMANCE_WARNING) return false;
  return (
    metrics.acceptanceRate < ACCEPTANCE_RATE_TARGET ||
    metrics.cancellationRate >= CANCELLATION_RATE_TARGET
  );
}

export function performanceWarningKey(merchantId: string) {
  return `roam_performance_warning_ack_${merchantId}`;
}

export function acknowledgePerformanceWarning(merchantId: string) {
  localStorage.setItem(performanceWarningKey(merchantId), new Date().toISOString());
}

export function shouldShowPerformanceWarning(merchantId: string, metrics: PerformanceMetrics) {
  if (!isPoorPerformance(metrics)) return false;

  const acknowledgedAt = localStorage.getItem(performanceWarningKey(merchantId));
  if (!acknowledgedAt) return true;

  const daysSince =
    (Date.now() - new Date(acknowledgedAt).getTime()) / (1000 * 60 * 60 * 24);
  return daysSince >= 7;
}
