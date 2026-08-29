import type { CoverageMultiPolygon, CoverageVertex } from './geometry.ts';
import { pointInMultiPolygon, pointInRing } from './geometry.ts';

export type ZoneKind = 'include' | 'exclude';

export type ZonePolicyAction =
  | 'block'
  | 'surcharge'
  | 'courier_opt_in'
  | 'manager_approval'
  | 'cash_disabled';

export type ZonePolicy = {
  action: ZonePolicyAction;
  params?: Record<string, unknown>;
};

export type ZoneSchedule = {
  dow: number[];
  start_time: string;
  end_time: string;
  timezone?: string;
};

export type EvaluableZone = {
  id: string;
  name: string;
  market_id?: string;
  kind?: string | null;
  polygon: CoverageVertex[];
  multiPolygon?: CoverageMultiPolygon;
  priority?: number;
  is_active?: boolean;
  effective_from?: string | null;
  effective_to?: string | null;
  category?: string | null;
  reason?: string | null;
  schedules?: ZoneSchedule[];
  zone_policy?: ZonePolicy | null;
};

export type CoverageReasonCode =
  | 'market_inactive'
  | 'excluded_zone'
  | 'out_of_coverage'
  | 'too_far_from_store'
  | 'outside_parish';

export function normalizeKind(kind: string | null | undefined): ZoneKind {
  return kind === 'exclude' ? 'exclude' : 'include';
}

export function normalizePolicy(raw: unknown): ZonePolicy {
  if (!raw || typeof raw !== 'object') return { action: 'block' };
  const p = raw as Record<string, unknown>;
  const action = String(p.action ?? 'block') as ZonePolicyAction;
  const allowed: ZonePolicyAction[] = [
    'block',
    'surcharge',
    'courier_opt_in',
    'manager_approval',
    'cash_disabled',
  ];
  if (!allowed.includes(action)) return { action: 'block' };
  return {
    action,
    params: p.params && typeof p.params === 'object' ? (p.params as Record<string, unknown>) : undefined,
  };
}

export function zoneContains(lat: number, lng: number, zone: EvaluableZone): boolean {
  if (zone.multiPolygon && zone.multiPolygon.length > 0) {
    return pointInMultiPolygon(lat, lng, zone.multiPolygon);
  }
  const ring = Array.isArray(zone.polygon) ? zone.polygon : [];
  return ring.length >= 3 && pointInRing(lat, lng, ring);
}

function parseTimeToMinutes(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return h * 60 + min;
}

/** Map an absolute instant into a synthetic UTC date carrying local DOW/time for `timezone`. */
function zonedNow(timezone: string, at: Date = new Date()): Date {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      weekday: 'short',
      hour12: false,
    }).formatToParts(at);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
    const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
    const dowMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    const dow = dowMap[weekday] ?? 0;
    return new Date(Date.UTC(2000, 0, 2 + dow, hour, minute));
  } catch {
    return at;
  }
}

function isWithinSchedule(schedules: ZoneSchedule[] | undefined, at: Date = new Date()): boolean {
  if (!schedules?.length) return true;
  for (const s of schedules) {
    const tz = s.timezone?.trim() || 'America/Jamaica';
    const local = zonedNow(tz, at);
    const dow = local.getUTCDay();
    if (!s.dow.includes(dow)) continue;
    const start = parseTimeToMinutes(s.start_time);
    const end = parseTimeToMinutes(s.end_time);
    const nowMin = local.getUTCHours() * 60 + local.getUTCMinutes();
    if (start == null || end == null) continue;
    if (start <= end) {
      if (nowMin >= start && nowMin < end) return true;
    } else if (nowMin >= start || nowMin < end) {
      return true;
    }
  }
  return false;
}

/** Filter zones by operational flags (ADR-0014 / FIX-2). */
export function filterActiveZones(zones: EvaluableZone[], at: Date = new Date()): EvaluableZone[] {
  const ts = at.getTime();
  return zones.filter((z) => {
    if (z.is_active === false) return false;
    if (z.effective_from) {
      const from = Date.parse(z.effective_from);
      if (Number.isFinite(from) && ts < from) return false;
    }
    if (z.effective_to) {
      const to = Date.parse(z.effective_to);
      if (Number.isFinite(to) && ts >= to) return false;
    }
    if (!isWithinSchedule(z.schedules, at)) return false;
    return true;
  });
}

export type ZoneMatch = {
  zone: EvaluableZone;
  kind: ZoneKind;
  priority: number;
};

/** ADR-0014: highest priority wins; at equal priority exclude wins (fail-safe). Safe islands need higher include priority. */
export function pickWinningMatch(matches: ZoneMatch[]): ZoneMatch | null {
  if (!matches.length) return null;
  const sorted = [...matches].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    const kindOrder = (k: ZoneKind) => (k === 'exclude' ? 0 : 1);
    if (kindOrder(a.kind) !== kindOrder(b.kind)) return kindOrder(a.kind) - kindOrder(b.kind);
    return a.zone.id.localeCompare(b.zone.id);
  });
  return sorted[0] ?? null;
}

export function reasonCodeForCategory(category: string | null | undefined): CoverageReasonCode {
  void category;
  return 'excluded_zone';
}

export function customerCopyForReason(code: string | undefined | null, category?: string | null): string {
  if (code === 'excluded_zone') {
    if (category === 'safety') {
      return 'Delivery is paused in this area for safety reasons.';
    }
    return "We're not currently serving your address.";
  }
  if (code === 'out_of_coverage' || code === 'outside_parish') {
    return "You're outside our delivery zone.";
  }
  if (code === 'market_inactive') {
    return 'Roam Rush is not available in this area yet.';
  }
  if (code === 'too_far_from_store') {
    return "This store doesn't deliver that far.";
  }
  return "You're outside our delivery zone.";
}
