import { allowMocks } from './mocksGate';

export type SavedAddressLike = {
  line1: string;
  line2?: string | null;
  instructions?: string | null;
} | null | undefined;

const DEMO_ADDRESS = '45 Constant Spring Rd, Apt 12B';
const DEMO_INSTRUCTIONS = 'Leave at door • Gate code: 1234';

/** Format a saved address line, or null when none exists. */
export function formatSavedAddressLine(saved: SavedAddressLike): string | null {
  if (!saved?.line1?.trim()) return null;
  const line2 = saved.line2?.trim();
  return line2 ? `${saved.line1.trim()}, ${line2}` : saved.line1.trim();
}

/**
 * Delivery address for display/submit.
 * Production: never invent an address — returns null when missing.
 * Dev/mocks: may fall back to the demo Kingston address.
 */
export function resolveCheckoutAddress(saved: SavedAddressLike): {
  address: string | null;
  instructions: string;
  hasRealAddress: boolean;
} {
  const formatted = formatSavedAddressLine(saved);
  if (formatted) {
    return {
      address: formatted,
      instructions: saved?.instructions?.trim() || '',
      hasRealAddress: true,
    };
  }
  if (allowMocks()) {
    return {
      address: DEMO_ADDRESS,
      instructions: saved?.instructions?.trim() || DEMO_INSTRUCTIONS,
      hasRealAddress: false,
    };
  }
  return { address: null, instructions: '', hasRealAddress: false };
}

/** Courier-facing note sent with the order. */
export function buildDeliveryInstructions(handoff: 'hand' | 'door', notes: string): string {
  const trimmed = notes.trim();
  if (handoff === 'door') return trimmed || 'Leave at door';
  return trimmed ? `Hand it to me. ${trimmed}` : 'Hand it to me';
}
