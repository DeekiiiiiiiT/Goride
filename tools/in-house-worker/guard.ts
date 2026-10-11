export type WorkerStore = {
  automation_level?: string | null;
  tos_allows_automation?: boolean | null;
  helper_stable_days?: number | null;
};

export class WorkerRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkerRefused';
  }
}

/** The worker lives outside Supabase. It stops at the payment page and never retries a charge. */
export function assertWorkerMayRun(store: WorkerStore): void {
  if (store.automation_level !== 'L3' || store.tos_allows_automation !== true) {
    throw new WorkerRefused('This store stays on the human checklist');
  }
  if ((store.helper_stable_days ?? 0) < 30) {
    throw new WorkerRefused('The cart helper needs 30 stable days first');
  }
}

export function assertPaymentNotRetried(attempt: number): void {
  if (attempt > 0) throw new WorkerRefused('Payment is never retried. Hand the order back to the buyer.');
}
