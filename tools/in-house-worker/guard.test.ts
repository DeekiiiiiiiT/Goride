import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { assertPaymentNotRetried, assertWorkerMayRun, WorkerRefused } from './guard.ts';

Deno.test('worker stays off unless terms allow it and the helper has been stable', () => {
  assertThrows(
    () => assertWorkerMayRun({ automation_level: 'L0', tos_allows_automation: false, helper_stable_days: 0 }),
    WorkerRefused,
  );
  assertThrows(
    () => assertWorkerMayRun({ automation_level: 'L3', tos_allows_automation: true, helper_stable_days: 10 }),
    WorkerRefused,
  );
  assertWorkerMayRun({ automation_level: 'L3', tos_allows_automation: true, helper_stable_days: 30 });
});

Deno.test('a failed payment is handed back, never retried', () => {
  assertPaymentNotRetried(0);
  assertThrows(() => assertPaymentNotRetried(1), WorkerRefused);
  assertEquals(true, true);
});
