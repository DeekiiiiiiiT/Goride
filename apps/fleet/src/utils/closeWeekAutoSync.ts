/**
 * Close Week client sync policy — when to call POST prepare/sync vs GET preview.
 * Preview stays read-only; sync seals + rebuilds open books only when needed.
 */
import { isCloseWeekEnded } from './closeWeekPicker';

/** Blockers sync can clear (seal / rebuild). Cash desk & toll orphans stay manual. */
export const CLOSE_WEEK_SYNC_FIXABLE_CODES = new Set([
  'FUEL_STATEMENT_MISSING',
  'FUEL_STATEMENT_UNVERIFIED',
  'FUEL_DRIVER_SHARE_MISMATCH',
  'FUEL_FLEET_SHARE_MISMATCH',
  'FUEL_ENGINE_DRIFT',
  'TOLL_STATEMENT_MISSING',
  'TOLL_STATEMENT_UNVERIFIED',
  'TOLL_SPEND_MISMATCH',
  'TOLL_CHARGED_MISMATCH',
  'TOLL_STALE_ZERO_SEAL',
  'TOLL_ENGINE_DRIFT',
  'EARNINGS_STATEMENT_MISSING',
  'EARNINGS_STATEMENT_UNVERIFIED',
  'EARNINGS_ENGINE_DRIFT',
  'PERIOD_REBUILD_FAILED',
]);

/** Ended open weeks may auto-sync; in-progress / closed weeks stay preview-only. */
export function shouldAutoSyncCloseWeek(
  weekKey: string,
  opts?: { weekAlreadyClosed?: boolean },
): boolean {
  if (!weekKey || opts?.weekAlreadyClosed) return false;
  return isCloseWeekEnded(weekKey);
}

type PreviewLike = {
  weekClosed?: boolean;
  blockers?: Array<{ code?: string }>;
  weekBlockers?: Array<{ code?: string }>;
};

export type CloseWeekSyncForceHints = {
  forceFuelReseal?: boolean;
  forceTollReseal?: boolean;
  forceEarningsReseal?: boolean;
};

function previewBlockerCodes(preview: PreviewLike): string[] {
  return [...(preview.blockers || []), ...(preview.weekBlockers || [])].map((b) =>
    String(b.code || '').toUpperCase(),
  );
}

/** True when preview shows seal/rebuild work sync can fix. */
export function previewNeedsWeekSync(preview: PreviewLike): boolean {
  if (preview.weekClosed) return false;
  return previewBlockerCodes(preview).some((c) => CLOSE_WEEK_SYNC_FIXABLE_CODES.has(c));
}

/**
 * Map preview blockers → sync force flags (closed→closed reseal for engine drift).
 * Preview already paid for engine compare — avoids server re-probe on slim path.
 */
export function forceResealHintsFromPreview(preview: PreviewLike): CloseWeekSyncForceHints {
  const codes = previewBlockerCodes(preview);
  const hints: CloseWeekSyncForceHints = {};
  for (const c of codes) {
    if (
      c === 'FUEL_STATEMENT_MISSING' ||
      c === 'FUEL_STATEMENT_UNVERIFIED' ||
      c === 'FUEL_DRIVER_SHARE_MISMATCH' ||
      c === 'FUEL_FLEET_SHARE_MISMATCH' ||
      c === 'FUEL_ENGINE_DRIFT'
    ) {
      hints.forceFuelReseal = true;
    }
    if (
      c === 'TOLL_STATEMENT_MISSING' ||
      c === 'TOLL_STATEMENT_UNVERIFIED' ||
      c === 'TOLL_SPEND_MISMATCH' ||
      c === 'TOLL_CHARGED_MISMATCH' ||
      c === 'TOLL_STALE_ZERO_SEAL' ||
      c === 'TOLL_ENGINE_DRIFT'
    ) {
      hints.forceTollReseal = true;
    }
    if (
      c === 'EARNINGS_STATEMENT_MISSING' ||
      c === 'EARNINGS_STATEMENT_UNVERIFIED' ||
      c === 'EARNINGS_ENGINE_DRIFT'
    ) {
      hints.forceEarningsReseal = true;
    }
    // Rebuild-only failures: force all lanes so seal→rebuild can retry.
    if (c === 'PERIOD_REBUILD_FAILED') {
      hints.forceFuelReseal = true;
      hints.forceTollReseal = true;
      hints.forceEarningsReseal = true;
    }
  }
  return hints;
}

/**
 * Slim path: ended open week + preview says sync can help.
 * Healthy Clear weeks stay on preview only (avoids Edge OOM on Refresh).
 */
export function shouldRunCloseWeekSync(weekKey: string, preview: PreviewLike): boolean {
  if (!shouldAutoSyncCloseWeek(weekKey, { weekAlreadyClosed: !!preview.weekClosed })) {
    return false;
  }
  return previewNeedsWeekSync(preview);
}
