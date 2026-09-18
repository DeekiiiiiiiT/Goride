/**
 * Driver Activity — pure correctness helpers (segments, coverage, vocabulary).
 * Keep free of Deno/Supabase imports so Deno tests and mental model stay simple.
 */

export type ActivityEventType =
  | "went_online"
  | "went_offline"
  | "offer_received"
  | "offer_accepted"
  | "offer_declined"
  | "offer_expired"
  | "offer_superseded"
  | "en_route_pickup"
  | "arrived_pickup"
  | "job_started"
  | "job_completed"
  | "driver_cancelled"
  | "rider_cancelled"
  | "system_cancelled"
  | "admin_action";

export type ActivityServiceLine = "roam_rides" | "roam_rush" | "fleet_ops";

export type ActivityEventLike = {
  event_type: string;
  occurred_at: string;
  job_ref?: string | null;
  job_seq?: number | null;
  source_event_id?: string;
  payload?: Record<string, unknown>;
  service_line?: string;
};

export type StatusSegment = {
  kind: "online" | "offline" | "on_job";
  from: string;
  to: string | null;
  seconds: number | null;
  closedBy?: "driver" | "timeout" | "admin";
  serviceLine?: string;
};

export type CoverageWindow = {
  from: string;
  to: string | null;
  recorded: boolean;
  reason?: string;
};

/** Cancel party from payload or ride_requests.cancelled_by (ingest enriches payload). */
function cancelPartyFromPayload(payload: Record<string, unknown>): ActivityEventType {
  const by = String(
    payload.cancelled_by || payload.cancelledBy || payload.source || "",
  ).toLowerCase();
  if (by.includes("driver")) return "driver_cancelled";
  if (by.includes("rider") || by.includes("passenger")) return "rider_cancelled";
  return "system_cancelled";
}

/**
 * Map rides.audit_events.event_type (+ payload) → canonical verb.
 * Admin force_* → admin_action (never job_completed — disputes must not look driver-finished).
 */
export function mapRidesAuditToCanonical(
  eventType: string,
  payload: Record<string, unknown> = {},
): ActivityEventType | null {
  const t = String(eventType || "").toLowerCase();
  if (t === "offer_accepted" || t === "offer_accepted_atomic") return "offer_accepted";
  if (t === "ride_completed") return "job_completed";
  if (t === "admin_ride_force_complete") return "admin_action";
  if (t === "admin_ride_force_cancel") return "admin_action";
  if (
    t === "ride_cancelled" ||
    t === "ride_cancelled_system" ||
    t.startsWith("ride_auto_cancelled_")
  ) {
    return cancelPartyFromPayload(payload);
  }
  if (t === "ride_cancelled_rider" || t === "ride_cancelled_passenger") {
    return "rider_cancelled";
  }
  if (t === "ride_cancelled_driver") return "driver_cancelled";
  if (t === "driver_transition" || t === "cash_settlement_pending") {
    const to = String(payload.to || "").toLowerCase();
    if (to === "driver_en_route_pickup" || to === "en_route_pickup") return "en_route_pickup";
    if (to === "driver_arrived_pickup" || to === "arrived_pickup") return "arrived_pickup";
    if (to === "on_trip" || to === "in_progress" || to === "trip_started") return "job_started";
    if (to === "completed") return "job_completed";
    if (to === "cancelled") return cancelPartyFromPayload(payload);
    return null;
  }
  // Config/fare/vehicle admin_* and fare_quoted are intentionally ignored
  return null;
}

/** Known audit verbs that must map (fixture for C5). Unknown → null is OK if listed as ignorable. */
export const RIDES_AUDIT_MAPPED_TYPES = [
  "offer_accepted",
  "offer_accepted_atomic",
  "ride_completed",
  "ride_cancelled",
  "ride_cancelled_system",
  "ride_cancelled_rider",
  "ride_cancelled_passenger",
  "ride_cancelled_driver",
  "ride_auto_cancelled_matching_timeout",
  "ride_auto_cancelled_no_drivers",
  "admin_ride_force_complete",
  "admin_ride_force_cancel",
  "driver_transition",
  "cash_settlement_pending",
] as const;

/** Map rides.driver_offers.status → canonical verb. */
export function mapOfferStatusToCanonical(status: string): ActivityEventType | null {
  switch (String(status || "").toLowerCase()) {
    case "pending":
      return "offer_received";
    case "accepted":
      return "offer_accepted";
    case "declined":
      return "offer_declined";
    case "expired":
      return "offer_expired";
    case "superseded":
      return "offer_superseded";
    default:
      return null;
  }
}

/** Map delivery.order_events.status → canonical verb. */
export function mapDeliveryStatusToCanonical(status: string): ActivityEventType | null {
  const s = String(status || "").toLowerCase();
  if (s === "accepted" || s === "assigned" || s === "courier_assigned") return "offer_accepted";
  if (s === "en_route" || s === "heading_to_merchant" || s === "en_route_pickup") return "en_route_pickup";
  if (s === "arrived" || s === "at_merchant" || s === "arrived_pickup") return "arrived_pickup";
  if (s === "picked_up" || s === "in_transit" || s === "out_for_delivery") return "job_started";
  if (s === "delivered" || s === "completed") return "job_completed";
  if (s === "cancelled" || s === "canceled") return "system_cancelled";
  if (s === "declined" || s === "rejected") return "offer_declined";
  return null;
}

export function presenceToCanonical(isOnline: boolean): ActivityEventType {
  return isOnline ? "went_online" : "went_offline";
}

/**
 * Derive online/offline/on_job segments over a window.
 * Collapses identical consecutive presence states.
 * on_job segments union concurrent jobs (utilization never > 100% when combining).
 */
export function deriveStatusSegments(
  events: ActivityEventLike[],
  windowFrom: string,
  windowTo: string,
  nowIso: string = new Date().toISOString(),
): StatusSegment[] {
  const fromMs = Date.parse(windowFrom);
  const toMs = Date.parse(windowTo);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) return [];

  const sorted = [...events].sort((a, b) => {
    const ta = Date.parse(a.occurred_at);
    const tb = Date.parse(b.occurred_at);
    if (ta !== tb) return ta - tb;
    return (a.job_seq ?? 0) - (b.job_seq ?? 0) ||
      String(a.source_event_id || "").localeCompare(String(b.source_event_id || ""));
  });

  // Collapse consecutive identical presence transitions
  const presence: ActivityEventLike[] = [];
  for (const e of sorted) {
    if (e.event_type !== "went_online" && e.event_type !== "went_offline") continue;
    const last = presence[presence.length - 1];
    if (last && last.event_type === e.event_type) continue;
    presence.push(e);
  }

  const segments: StatusSegment[] = [];
  let online = false;
  let onlineFrom: number | null = null;
  let closedBy: StatusSegment["closedBy"];

  // Seed state from last presence before window
  for (const e of presence) {
    const t = Date.parse(e.occurred_at);
    if (t < fromMs) {
      online = e.event_type === "went_online";
      onlineFrom = online ? fromMs : null;
      closedBy = undefined;
    }
  }

  const emitOfflineGap = (start: number, end: number) => {
    if (end <= start) return;
    segments.push({
      kind: "offline",
      from: new Date(start).toISOString(),
      to: new Date(end).toISOString(),
      seconds: Math.floor((end - start) / 1000),
    });
  };

  const closeOnline = (end: number, by?: StatusSegment["closedBy"]) => {
    if (!online || onlineFrom == null) return;
    const endClamped = Math.min(end, toMs);
    if (endClamped > onlineFrom) {
      segments.push({
        kind: "online",
        from: new Date(onlineFrom).toISOString(),
        to: new Date(endClamped).toISOString(),
        seconds: Math.floor((endClamped - onlineFrom) / 1000),
        closedBy: by,
      });
    }
    online = false;
    onlineFrom = null;
  };

  let cursor = fromMs;
  if (!online) {
    // stay offline until first online
  } else {
    onlineFrom = fromMs;
  }

  for (const e of presence) {
    const t = Date.parse(e.occurred_at);
    if (t < fromMs || t > toMs) continue;
    const reason = String((e.payload as any)?.reason || "");
    if (e.event_type === "went_online") {
      if (!online) {
        emitOfflineGap(cursor, t);
        online = true;
        onlineFrom = t;
        cursor = t;
      }
    } else if (e.event_type === "went_offline") {
      const by: StatusSegment["closedBy"] =
        reason === "heartbeat_timeout" || reason === "timeout"
          ? "timeout"
          : reason === "admin_force"
          ? "admin"
          : "driver";
      if (online) {
        closeOnline(t, by);
        cursor = t;
      }
    }
  }

  const nowMs = Date.parse(nowIso);
  const endBound = Math.min(nowMs, toMs);
  const windowStillCurrent = nowMs < toMs;
  if (online && onlineFrom != null) {
    if (windowStillCurrent) {
      // Open session: to=null, seconds=null (client ticks live)
      segments.push({
        kind: "online",
        from: new Date(onlineFrom).toISOString(),
        to: null,
        seconds: null,
        closedBy: undefined,
      });
    } else {
      // Historical window: close at window end with concrete seconds
      segments.push({
        kind: "online",
        from: new Date(onlineFrom).toISOString(),
        to: new Date(endBound).toISOString(),
        seconds: Math.floor((endBound - onlineFrom) / 1000),
        closedBy,
      });
    }
  } else if (cursor < toMs) {
    emitOfflineGap(cursor, Math.min(endBound, toMs));
  }

  // Per-job intervals (timeline), then merge overlaps for utilization (M1)
  const jobIntervals: Array<{ start: number; end: number; open: boolean }> = [];
  const jobEvents = sorted.filter((e) =>
    ["en_route_pickup", "arrived_pickup", "job_started", "job_completed", "driver_cancelled", "rider_cancelled", "system_cancelled"]
      .includes(e.event_type)
  );
  const byJob = new Map<string, ActivityEventLike[]>();
  for (const e of jobEvents) {
    const key = e.job_ref || `anon:${e.source_event_id || e.occurred_at}`;
    const list = byJob.get(key) || [];
    list.push(e);
    byJob.set(key, list);
  }
  for (const [, list] of byJob) {
    const start = list.find((e) =>
      e.event_type === "en_route_pickup" || e.event_type === "arrived_pickup" || e.event_type === "job_started"
    );
    const end = list.find((e) =>
      e.event_type === "job_completed" ||
      e.event_type === "driver_cancelled" ||
      e.event_type === "rider_cancelled" ||
      e.event_type === "system_cancelled"
    );
    if (!start) continue;
    const startMs = Math.max(Date.parse(start.occurred_at), fromMs);
    const endMs = end ? Math.min(Date.parse(end.occurred_at), toMs) : Math.min(nowMs, toMs);
    if (endMs <= startMs) continue;
    jobIntervals.push({ start: startMs, end: endMs, open: !end });
  }

  // Emit merged on_job segments (union) so overlapping jobs don't double-count
  const mergedJobs = mergeIntervals(jobIntervals.map((j) => ({ start: j.start, end: j.end })));
  for (const iv of mergedJobs) {
    const stillOpenJob = jobIntervals.some((j) => j.open && j.end === iv.end);
    segments.push({
      kind: "on_job",
      from: new Date(iv.start).toISOString(),
      to: stillOpenJob && windowStillCurrent ? null : new Date(iv.end).toISOString(),
      seconds: stillOpenJob && windowStillCurrent
        ? null
        : Math.floor((iv.end - iv.start) / 1000),
    });
  }

  return segments;
}

/** Merge overlapping [start,end] intervals; returns sorted non-overlapping union. */
export function mergeIntervals(
  intervals: Array<{ start: number; end: number }>,
): Array<{ start: number; end: number }> {
  if (!intervals.length) return [];
  const sorted = [...intervals]
    .filter((i) => Number.isFinite(i.start) && Number.isFinite(i.end) && i.end > i.start)
    .sort((a, b) => a.start - b.start);
  const out: Array<{ start: number; end: number }> = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (!last || iv.start > last.end) out.push({ ...iv });
    else last.end = Math.max(last.end, iv.end);
  }
  return out;
}

/** Union length of segments of a kind (on_job already unioned in deriveStatusSegments). */
export function sumSegmentSeconds(segments: StatusSegment[], kind: StatusSegment["kind"]): number {
  if (kind === "on_job") {
    const merged = mergeIntervals(
      segments
        .filter((s) => s.kind === "on_job")
        .map((s) => ({
          start: Date.parse(s.from),
          end: s.to ? Date.parse(s.to) : Date.now(),
        }))
        .filter((i) => Number.isFinite(i.start) && Number.isFinite(i.end) && i.end > i.start),
    );
    return merged.reduce((acc, i) => acc + Math.floor((i.end - i.start) / 1000), 0);
  }
  return segments
    .filter((s) => s.kind === kind && s.seconds != null)
    .reduce((acc, s) => acc + (s.seconds || 0), 0);
}

export type CoverageSourceRow = {
  covered_from: string;
  covered_to: string | null;
  note?: string | null;
  service_line?: string;
  source?: string;
};

export type CoverageBySource = Record<string, CoverageWindow[]>;

/**
 * Build coverage windows per source key (`service_line::source` or just `source`).
 * Never union across sources — presence vs trips must stay independent (C4).
 */
export function buildCoverageBySource(
  windowFrom: string,
  windowTo: string,
  coverageRows: CoverageSourceRow[],
): CoverageBySource {
  const byKey = new Map<string, CoverageSourceRow[]>();
  for (const r of coverageRows) {
    const key = r.source
      ? (r.service_line ? `${r.service_line}::${r.source}` : r.source)
      : "unknown";
    const list = byKey.get(key) || [];
    list.push(r);
    byKey.set(key, list);
  }
  const out: CoverageBySource = {};
  for (const [key, rows] of byKey) {
    out[key] = buildCoverageWindows(windowFrom, windowTo, rows);
  }
  return out;
}

/** True when every window for this source list is recorded across the range. */
export function sourceFullyRecorded(windows: CoverageWindow[]): boolean {
  return windows.length > 0 && windows.every((w) => w.recorded);
}

/** Presence source keys for honesty banners. */
export function presenceCoverageKeys(coverageBySource: CoverageBySource): string[] {
  return Object.keys(coverageBySource).filter((k) => k.includes("driver_presence_log"));
}

/** Trip/offer/order source keys (non-presence). */
export function tripCoverageKeys(coverageBySource: CoverageBySource): string[] {
  return Object.keys(coverageBySource).filter((k) => !k.includes("driver_presence_log"));
}

/**
 * Build coverage windows for a requested range given coverage registry rows.
 * Uncovered portions must render as not-recorded bands.
 * Call per-source — do not pass mixed sources (C4).
 */
export function buildCoverageWindows(
  windowFrom: string,
  windowTo: string,
  coverageRows: Array<{ covered_from: string; covered_to: string | null; note?: string | null }>,
): CoverageWindow[] {
  const fromMs = Date.parse(windowFrom);
  const toMs = Date.parse(windowTo);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
    return [{ from: windowFrom, to: windowTo, recorded: false, reason: "invalid_window" }];
  }

  if (!coverageRows.length) {
    return [{
      from: windowFrom,
      to: windowTo,
      recorded: false,
      reason: "Activity was not recorded for this window.",
    }];
  }

  // Merge covered intervals
  const intervals = coverageRows
    .map((r) => ({
      start: Date.parse(r.covered_from),
      end: r.covered_to ? Date.parse(r.covered_to) : toMs,
      note: r.note,
    }))
    .filter((i) => Number.isFinite(i.start) && Number.isFinite(i.end) && i.end > i.start)
    .sort((a, b) => a.start - b.start);

  const merged: typeof intervals = [];
  for (const iv of intervals) {
    const last = merged[merged.length - 1];
    if (!last || iv.start > last.end) merged.push({ ...iv });
    else last.end = Math.max(last.end, iv.end);
  }

  const out: CoverageWindow[] = [];
  let cursor = fromMs;
  for (const iv of merged) {
    const start = Math.max(iv.start, fromMs);
    const end = Math.min(iv.end, toMs);
    if (start > cursor) {
      out.push({
        from: new Date(cursor).toISOString(),
        to: new Date(start).toISOString(),
        recorded: false,
        reason: `Activity was not recorded before ${new Date(start).toISOString()}.`,
      });
    }
    if (end > start) {
      out.push({
        from: new Date(start).toISOString(),
        to: end >= toMs && !coverageRows.some((r) => r.covered_to) ? null : new Date(end).toISOString(),
        recorded: true,
      });
      cursor = end;
    }
  }
  if (cursor < toMs) {
    out.push({
      from: new Date(cursor).toISOString(),
      to: windowTo,
      recorded: false,
      reason: "Activity was not recorded for the remainder of this window.",
    });
  }
  return out;
}

/** Acceptance rate: null when denominator is 0 — never fabricate. */
export function computeEventAcceptanceRate(counts: {
  accepted: number;
  declined: number;
  expired: number;
}): number | null {
  const den = counts.accepted + counts.declined + counts.expired;
  if (den <= 0) return null;
  return (counts.accepted / den) * 100;
}

export function clampActivityWindow(
  fromIso: string,
  toIso: string,
  maxDays = 31,
): { from: string; to: string; clamped: boolean } {
  const fromMs = Date.parse(fromIso);
  let toMs = Date.parse(toIso);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
    const now = Date.now();
    return {
      from: new Date(now - 7 * 86400000).toISOString(),
      to: new Date(now).toISOString(),
      clamped: true,
    };
  }
  const maxMs = maxDays * 86400000;
  let clamped = false;
  if (toMs - fromMs > maxMs) {
    toMs = fromMs + maxMs;
    clamped = true;
  }
  return { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString(), clamped };
}

/** Cluster events that share a job_ref for timeline collapse. */
export function clusterEventsByJob<T extends ActivityEventLike>(
  events: T[],
): Array<{ kind: "cluster" | "single"; jobRef?: string; events: T[] }> {
  const out: Array<{ kind: "cluster" | "single"; jobRef?: string; events: T[] }> = [];
  const seen = new Set<string>();
  for (const e of events) {
    const ref = e.job_ref || null;
    if (!ref) {
      out.push({ kind: "single", events: [e] });
      continue;
    }
    if (seen.has(ref)) continue;
    seen.add(ref);
    const group = events.filter((x) => x.job_ref === ref);
    if (group.length > 1) out.push({ kind: "cluster", jobRef: ref, events: group });
    else out.push({ kind: "single", events: group });
  }
  return out;
}

export const UNSUPPORTED_ACTIVITY_PLATFORMS = new Set([
  "uber",
  "indrive",
  "in drive",
  "in_drive",
]);

export function isUnsupportedActivityPlatform(platform: string | null | undefined): boolean {
  if (!platform) return false;
  return UNSUPPORTED_ACTIVITY_PLATFORMS.has(platform.trim().toLowerCase());
}
