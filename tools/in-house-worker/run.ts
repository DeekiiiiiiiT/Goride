import { assertPaymentNotRetried, assertWorkerMayRun, type WorkerStore } from './guard.ts';

type CartLine = { name: string; quantity: number };

/**
 * Separate from the Supabase desk. A human still places the order when this refuses.
 * This process never types a card and never presses pay.
 */
export async function runWorker(input: {
  store: WorkerStore;
  cart: CartLine[];
  placeOrder: (cart: CartLine[]) => Promise<'needs_payment' | 'failed'>;
}): Promise<'needs_payment' | 'handed_back'> {
  assertWorkerMayRun(input.store);
  const outcome = await Promise.race([
    input.placeOrder(input.cart),
    new Promise<'failed'>((resolve) => setTimeout(() => resolve('failed'), 90_000)),
  ]);
  if (outcome !== 'needs_payment') return 'handed_back';
  assertPaymentNotRetried(0);
  return 'needs_payment';
}
