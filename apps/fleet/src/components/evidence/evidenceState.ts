import type { EvidenceMediaState } from './types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Derive UI state from URL + metadata flags (no network). */
export function resolveEvidenceMediaState(opts: {
  imageUrl?: string | null;
  evidenceExpired?: boolean;
  evidenceDeleteAfter?: string | null;
  parentStatus?: string | null;
  expiringSoonDays?: number;
}): EvidenceMediaState {
  const {
    imageUrl,
    evidenceExpired,
    evidenceDeleteAfter,
    parentStatus,
    expiringSoonDays = 7,
  } = opts;

  if (evidenceExpired) return 'expired';
  if (!imageUrl) return 'unavailable';

  const status = (parentStatus || '').toLowerCase();
  if (status === 'pending' || status.includes('review')) {
    return 'pending_review';
  }

  if (evidenceDeleteAfter) {
    const deleteAt = new Date(evidenceDeleteAfter).getTime();
    if (!Number.isNaN(deleteAt)) {
      const daysLeft = Math.ceil((deleteAt - Date.now()) / MS_PER_DAY);
      if (daysLeft <= 0) return 'expired';
      if (daysLeft <= expiringSoonDays) return 'expiring_soon';
    }
  }

  return 'available';
}

export function daysUntilDelete(deleteAfter?: string | null): number | null {
  if (!deleteAfter) return null;
  const deleteAt = new Date(deleteAfter).getTime();
  if (Number.isNaN(deleteAt)) return null;
  return Math.max(0, Math.ceil((deleteAt - Date.now()) / MS_PER_DAY));
}
