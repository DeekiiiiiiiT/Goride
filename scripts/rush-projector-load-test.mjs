#!/usr/bin/env node
/**
 * Rush order→fleet projector load smoke test.
 * Usage: node scripts/rush-projector-load-test.mjs [count=100]
 */
const count = Number(process.argv[2] || 100);

function courierGross(order) {
  return Number(order.delivery_fee ?? 0) + Number(order.tip ?? 0);
}

function deliveryOrderToFleetTrip(order) {
  const amount = courierGross(order);
  return {
    id: `rush-order:${order.id}`,
    platform: 'Roam Rush',
    amount,
    service_line: 'rush_delivery',
    organizationId: order.courier_fleet_id,
    batchId: order._syntheticBatchId,
  };
}

const orgId = 'load-test-org';
const started = performance.now();
const trips = [];
for (let i = 0; i < count; i++) {
  trips.push(
    deliveryOrderToFleetTrip({
      id: `order-${i}`,
      courier_fleet_id: orgId,
      delivery_fee: 500 + (i % 50),
      tip: i % 3 === 0 ? 100 : 0,
      _syntheticBatchId: `rush-live-sync:${orgId}:2026-09-01`,
    }),
  );
}
const elapsed = performance.now() - started;
console.log(JSON.stringify({ count, elapsedMs: Math.round(elapsed), sample: trips[0] }, null, 2));
