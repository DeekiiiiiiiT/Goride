export type DeliveryHandoff = {
  mode: 'hand' | 'door';
  notes: string;
};

/** Checkout stores "Hand it to me" vs free-text door instructions. Never invent a gate code. */
export function parseDeliveryHandoff(instructions: string | null | undefined): DeliveryHandoff {
  const raw = (instructions ?? '').trim();
  if (!raw) return { mode: 'door', notes: '' };
  if (/^hand it to me/i.test(raw)) {
    const notes = raw.replace(/^hand it to me[.!\s-]*/i, '').trim();
    return { mode: 'hand', notes };
  }
  return { mode: 'door', notes: raw };
}
