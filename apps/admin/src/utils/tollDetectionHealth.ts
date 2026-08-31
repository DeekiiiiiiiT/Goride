/**
 * Client-side toll detection health — flags the silent-zero failure mode
 * (detection on + verified plazas exist + no crossings in N days).
 */
import type { TollPlaza } from '../types/toll';
import type { TollDispatchSettings } from '../services/platform/ridesDispatchSettingsService';

export const TOLL_HEALTH_WINDOW_DAYS = 7;

export type TollDetectionHealth = {
  detectionEnabled: boolean;
  verifiedPlazaCount: number;
  totalPlazaCount: number;
  crossingsLastNDays: number;
  windowDays: number;
  /** True when charging is blocked because nothing is verified. */
  verificationGateClosed: boolean;
  /** True when detection should be producing crossings but none appear. */
  zeroCrossingAlarm: boolean;
  summary: string;
};

function parseTxDateMs(tx: { date?: string; time?: string | null }): number | null {
  const d = (tx.date || '').trim();
  if (!d) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const t = (tx.time || '12:00:00').trim();
    const ms = Date.parse(`${d}T${t.length === 5 ? `${t}:00` : t}`);
    return Number.isFinite(ms) ? ms : Date.parse(`${d}T12:00:00`);
  }
  const ms = Date.parse(d);
  return Number.isFinite(ms) ? ms : null;
}

/** Geofence / replay rows — not provider CSV tag dumps. */
function isDetectedCrossing(tx: Record<string, unknown>): boolean {
  const meta = (tx.metadata || {}) as Record<string, unknown>;
  const source = String(meta.source || meta.detectionSource || tx.sourceFile || '').toLowerCase();
  const ref = String(tx.referenceNumber || '').toLowerCase();
  const payment = String(tx.paymentMethod || '').toLowerCase();
  if (source.includes('fleet_replay') || source.includes('geofence') || source.includes('ride_bridge')) {
    return true;
  }
  if (ref.startsWith('fleet_replay:') || ref.startsWith('ride_toll:')) return true;
  if (payment === 'fleet_account' && (meta.plazaId || tx.plazaId)) return true;
  return false;
}

export function assessTollDetectionHealth(input: {
  settings: Pick<TollDispatchSettings, 'toll_detection_enabled'> | null | undefined;
  plazas: TollPlaza[];
  tollLogRows?: Array<Record<string, unknown>>;
  windowDays?: number;
  nowMs?: number;
}): TollDetectionHealth {
  const windowDays = input.windowDays ?? TOLL_HEALTH_WINDOW_DAYS;
  const now = input.nowMs ?? Date.now();
  const cutoff = now - windowDays * 86_400_000;
  const detectionEnabled = input.settings?.toll_detection_enabled === true;
  const verifiedPlazaCount = (input.plazas || []).filter((p) => p.status === 'verified').length;
  const totalPlazaCount = (input.plazas || []).length;

  let crossingsLastNDays = 0;
  for (const tx of input.tollLogRows || []) {
    if (!isDetectedCrossing(tx)) continue;
    const ms = parseTxDateMs(tx as { date?: string; time?: string | null });
    if (ms != null && ms >= cutoff) crossingsLastNDays++;
  }

  const verificationGateClosed = totalPlazaCount > 0 && verifiedPlazaCount === 0;
  const zeroCrossingAlarm =
    detectionEnabled && verifiedPlazaCount > 0 && crossingsLastNDays === 0;

  let summary: string;
  if (verificationGateClosed) {
    summary =
      'Toll charging is off: no plazas are verified. Promote plazas in Toll Database or detection will stay at zero.';
  } else if (zeroCrossingAlarm) {
    summary = `No geofence/replay toll crossings in the last ${windowDays} days while detection is on and ${verifiedPlazaCount} plaza(s) are verified.`;
  } else if (!detectionEnabled) {
    summary = 'Toll detection is disabled in settings.';
  } else if (verifiedPlazaCount === 0) {
    summary = 'No toll plazas on file yet.';
  } else {
    summary = `${crossingsLastNDays} detected crossing(s) in the last ${windowDays} days · ${verifiedPlazaCount} verified plaza(s).`;
  }

  return {
    detectionEnabled,
    verifiedPlazaCount,
    totalPlazaCount,
    crossingsLastNDays,
    windowDays,
    verificationGateClosed,
    zeroCrossingAlarm,
    summary,
  };
}
