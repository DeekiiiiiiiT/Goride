import {
  submitCourierProof,
  updateCourierOrderStatus,
  submitCourierNotes,
  unassignFromOrder,
} from '@/lib/courierApi';

export type MutationResult = { ok: true } | { ok: false; error: string };

const RETRY_DELAY_MS = 500;
const MAX_RETRIES = 3;

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function withRetry<T>(
  fn: () => Promise<{ ok: boolean; error?: string }>,
): Promise<MutationResult> {
  let lastError = 'Request failed';
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const result = await fn();
    if (result.ok) return { ok: true };
    lastError = result.error || lastError;
    if (attempt < MAX_RETRIES - 1) await sleep(RETRY_DELAY_MS * (attempt + 1));
  }
  return { ok: false, error: lastError };
}

export async function commitOrderStatus(
  orderId: string,
  status: string,
  notes?: string,
): Promise<MutationResult> {
  if (!orderId) return { ok: false, error: 'Missing order id' };
  return withRetry(() => updateCourierOrderStatus(orderId, status, notes));
}

export async function commitPickup(
  orderId: string,
  photoPath?: string,
): Promise<MutationResult> {
  if (!orderId) return { ok: false, error: 'Missing order id' };

  if (photoPath) {
    const proofOk = await withRetry(async () => {
      const res = await submitCourierProof(orderId, 'pickup', photoPath);
      return res.ok ? { ok: true } : { ok: false, error: res.error || 'Failed to upload pickup photo' };
    });
    if (!proofOk.ok) return proofOk;
  }

  const pickedUp = await commitOrderStatus(orderId, 'picked_up');
  if (!pickedUp.ok) return pickedUp;

  return commitOrderStatus(orderId, 'in_transit');
}

export async function commitDelivered(
  orderId: string,
  photoPath?: string,
  courierNotes?: string,
): Promise<MutationResult> {
  if (!orderId) return { ok: false, error: 'Missing order id' };

  if (photoPath) {
    const proofOk = await withRetry(async () => {
      const res = await submitCourierProof(orderId, 'delivery', photoPath);
      return res.ok ? { ok: true } : { ok: false, error: res.error || 'Failed to upload delivery photo' };
    });
    if (!proofOk.ok) return proofOk;
  }

  if (courierNotes?.trim()) {
    const notesOk = await withRetry(() =>
      submitCourierNotes(orderId, courierNotes.trim()).then((ok) =>
        ok ? { ok: true } : { ok: false, error: 'Failed to save delivery note' },
      ),
    );
    if (!notesOk.ok) return notesOk;
  }

  return commitOrderStatus(orderId, 'delivered');
}

export async function commitUnassign(orderId: string): Promise<MutationResult> {
  if (!orderId) return { ok: false, error: 'Missing order id' };
  return withRetry(() => unassignFromOrder(orderId));
}

export async function commitCancel(
  orderId: string,
  notes: string,
): Promise<MutationResult> {
  return commitOrderStatus(orderId, 'cancelled', notes);
}
