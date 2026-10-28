/**
 * Parse Uber driver-app activity timeline (copy-paste or Excel/CSV) into
 * canonical Activity events for fleet.driver_activity_events.
 *
 * Pure — no Deno/Supabase imports. Twin lives at
 * supabase/functions/_fleet-server/uber_activity_timeline_parse.ts
 */

export const UBER_ACTIVITY_SOURCE = 'uber_app_activity' as const;
export const UBER_ACTIVITY_SERVICE_LINE = 'uber' as const;
export const DEFAULT_ACTIVITY_TZ = 'America/Jamaica';

export type UberTimelineCanonicalType =
  | 'went_online'
  | 'went_offline'
  | 'offer_received'
  | 'offer_accepted'
  | 'arrived_pickup'
  | 'job_started'
  | 'job_completed'
  | 'driver_cancelled'
  | 'rider_cancelled';

export type UberTimelineParsedEvent = {
  event_type: UberTimelineCanonicalType;
  /** ISO UTC */
  occurred_at: string;
  /** Fleet calendar day yyyy-MM-dd */
  local_date: string;
  /** Local wall HH:mm:ss */
  local_time: string;
  label: string;
  duration_seconds: number | null;
  job_ref: string | null;
  job_seq: number | null;
  source_event_id?: string;
  payload: {
    label: string;
    durationSeconds: number | null;
    raw: string;
  };
};

export type UberTimelineParseResult = {
  events: UberTimelineParsedEvent[];
  warnings: string[];
  dateRange: { from: string; to: string } | null;
  stats: {
    days: number;
    eventCount: number;
    offersAccepted: number;
    tripsCompleted: number;
    driverCancels: number;
    riderCancels: number;
    onlineEvents: number;
    offlineEvents: number;
    /** Sum of Online-row durations from the paste (not segment-derived). */
    onlineDurationSecondsFromLabels: number;
  };
};

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const LABEL_TO_TYPE: Record<string, UberTimelineCanonicalType | 'group_header'> = {
  online: 'went_online',
  offline: 'went_offline',
  'offer accepted': 'offer_accepted',
  'arrived at pick-up': 'arrived_pickup',
  'arrived at pickup': 'arrived_pickup',
  'on trip': 'job_started',
  'trip completed': 'job_completed',
  'driver cancelled': 'driver_cancelled',
  'rider cancelled': 'rider_cancelled',
};

const TIME_RE = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i;
const DATE_RE =
  /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\s+(\d{4})$/i;
const GROUP_RE = /^Accepted\s+(\d+)\s+trips?$/i;
const DURATION_RE =
  /^(?:(\d+)\s*d(?:ays?)?)?\s*(?:(\d+)\s*h(?:ours?)?)?\s*(?:(\d+)\s*m(?:in(?:utes?)?)?)?\s*(?:(\d+)\s*s(?:ec(?:onds?)?)?)?$/i;
const LT_ONE_SEC_RE = /^<\s*1\s*s$/i;

/** Offset (tz − UTC) in ms — host-independent (same as toll-core wallClock). */
function tzOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - instant.getTime();
}

export function zonedWallClockToIso(
  ymd: string,
  timeHms: string,
  timeZone: string = DEFAULT_ACTIVITY_TZ,
): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const [hh, mm, ss] = String(timeHms || '12:00:00').split(':').map(Number);
  if (!y || !m || !d) return '';
  const guess = Date.UTC(y, m - 1, d, hh || 0, mm || 0, ss || 0);
  const offset = tzOffsetMs(new Date(guess), timeZone);
  return new Date(guess - offset).toISOString();
}

export function parseUberActivityDuration(raw: string): number | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (LT_ONE_SEC_RE.test(s)) return 0;
  const m = s.match(DURATION_RE);
  if (!m) return null;
  const days = Number(m[1] || 0);
  const hours = Number(m[2] || 0);
  const mins = Number(m[3] || 0);
  const secs = Number(m[4] || 0);
  if (!m[1] && !m[2] && !m[3] && !m[4]) return null;
  return days * 86400 + hours * 3600 + mins * 60 + secs;
}

function parseDateLine(line: string): string | null {
  const m = line.match(DATE_RE);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  if (!month) return null;
  const day = Number(m[2]);
  const year = Number(m[3]);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseTimeToHms(line: string): string | null {
  const m = line.match(TIME_RE);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ampm = m[3].toLowerCase();
  if (ampm === 'pm' && h < 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${min}:00`;
}

function normalizeLabel(line: string): string {
  return line.trim().replace(/\s+/g, ' ').toLowerCase();
}

function classifyLabel(
  line: string,
): UberTimelineCanonicalType | 'group_header' | null {
  const n = normalizeLabel(line);
  if (GROUP_RE.test(line.trim())) return 'group_header';
  return LABEL_TO_TYPE[n] ?? null;
}

function isTimeLine(line: string): boolean {
  return TIME_RE.test(line.trim());
}

function isDurationLine(line: string): boolean {
  const s = line.trim();
  if (LT_ONE_SEC_RE.test(s)) return true;
  if (!DURATION_RE.test(s)) return false;
  return parseUberActivityDuration(s) != null;
}

function emptyStats(): UberTimelineParseResult['stats'] {
  return {
    days: 0,
    eventCount: 0,
    offersAccepted: 0,
    tripsCompleted: 0,
    driverCancels: 0,
    riderCancels: 0,
    onlineEvents: 0,
    offlineEvents: 0,
    onlineDurationSecondsFromLabels: 0,
  };
}

function finalizeStats(events: UberTimelineParsedEvent[]): UberTimelineParseResult['stats'] {
  const stats = emptyStats();
  const days = new Set<string>();
  for (const e of events) {
    days.add(e.local_date);
    stats.eventCount += 1;
    if (e.event_type === 'offer_accepted') stats.offersAccepted += 1;
    if (e.event_type === 'job_completed') stats.tripsCompleted += 1;
    if (e.event_type === 'driver_cancelled') stats.driverCancels += 1;
    if (e.event_type === 'rider_cancelled') stats.riderCancels += 1;
    if (e.event_type === 'went_online') {
      stats.onlineEvents += 1;
      if (e.duration_seconds != null) stats.onlineDurationSecondsFromLabels += e.duration_seconds;
    }
    if (e.event_type === 'went_offline') stats.offlineEvents += 1;
  }
  stats.days = days.size;
  return stats;
}

function dateRangeOf(events: UberTimelineParsedEvent[]): { from: string; to: string } | null {
  if (!events.length) return null;
  let min = events[0].occurred_at;
  let max = events[0].occurred_at;
  for (const e of events) {
    if (e.occurred_at < min) min = e.occurred_at;
    if (e.occurred_at > max) max = e.occurred_at;
  }
  return { from: min, to: max };
}

type RawBlock = {
  label: string;
  kind: UberTimelineCanonicalType | 'group_header';
  local_date: string;
  local_time: string | null;
  duration_seconds: number | null;
  raw: string;
};

/**
 * Tokenize paste into dated blocks (newest-first within a day, as Uber shows).
 */
function tokenizePaste(text: string, warnings: string[]): RawBlock[] {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const blocks: RawBlock[] = [];
  let currentDate: string | null = null;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const asDate = parseDateLine(line);
    if (asDate) {
      currentDate = asDate;
      i += 1;
      continue;
    }

    if (!currentDate) {
      warnings.push(`Skipped line before any date header: "${line}"`);
      i += 1;
      continue;
    }

    const kind = classifyLabel(line);
    if (!kind) {
      warnings.push(`Unrecognized line: "${line}"`);
      i += 1;
      continue;
    }

    i += 1;
    let local_time: string | null = null;
    let duration_seconds: number | null = null;

    if (i < lines.length && isTimeLine(lines[i])) {
      local_time = parseTimeToHms(lines[i]);
      i += 1;
    }

    // Group header: time only (no duration). Nested events follow.
    if (kind === 'group_header') {
      blocks.push({
        label: line,
        kind,
        local_date: currentDate,
        local_time,
        duration_seconds: null,
        raw: line,
      });
      continue;
    }

    if (
      i < lines.length &&
      isDurationLine(lines[i]) &&
      classifyLabel(lines[i]) == null &&
      !isTimeLine(lines[i]) &&
      !parseDateLine(lines[i])
    ) {
      duration_seconds = parseUberActivityDuration(lines[i]);
      i += 1;
    }

    if (!local_time) {
      warnings.push(`Event "${line}" on ${currentDate} missing time — skipped`);
      continue;
    }

    blocks.push({
      label: line,
      kind,
      local_date: currentDate,
      local_time,
      duration_seconds,
      raw: line,
    });
  }

  return blocks;
}

/**
 * Assign job_ref / job_seq.
 * Uber app paste / "Original Order" sheet: newest-first within a day → reverse.
 * "Chronological" sheet / structured Date|Time rows: already oldest→newest → keep.
 */
function blocksToEvents(
  blocks: RawBlock[],
  timeZone: string,
  driverId: string,
  warnings: string[],
  assumeChronological = false,
): UberTimelineParsedEvent[] {
  const byDay = new Map<string, RawBlock[]>();
  for (const b of blocks) {
    const list = byDay.get(b.local_date) || [];
    list.push(b);
    byDay.set(b.local_date, list);
  }

  const chronological: RawBlock[] = [];
  const days = [...byDay.keys()].sort();
  for (const day of days) {
    const dayBlocks = byDay.get(day)!;
    chronological.push(
      ...(assumeChronological ? dayBlocks : [...dayBlocks].reverse()),
    );
  }

  const events: UberTimelineParsedEvent[] = [];
  let groupIndex = 0;
  let openJobRef: string | null = null;
  let openJobSeq = 0;
  let openGroupDay: string | null = null;

  const closeGroup = () => {
    openJobRef = null;
    openJobSeq = 0;
    openGroupDay = null;
  };

  const pushEvent = (
    kind: UberTimelineCanonicalType,
    block: RawBlock,
    jobRef: string | null,
    jobSeq: number | null,
  ) => {
    const occurred_at = zonedWallClockToIso(block.local_date, block.local_time!, timeZone);
    if (!occurred_at) {
      warnings.push(`Could not resolve timestamp for ${block.label} on ${block.local_date}`);
      return;
    }
    const hhmm = block.local_time!.slice(0, 5).replace(':', '');
    const seqPart = jobSeq != null ? String(jobSeq) : '0';
    const source_event_id =
      `${UBER_ACTIVITY_SOURCE}:${driverId}:${block.local_date}:${hhmm}:${kind}:${seqPart}:${events.length}`;

    events.push({
      event_type: kind,
      occurred_at,
      local_date: block.local_date,
      local_time: block.local_time!,
      label: block.label,
      duration_seconds: block.duration_seconds,
      job_ref: jobRef,
      job_seq: jobSeq,
      source_event_id,
      payload: {
        label: block.label,
        durationSeconds: block.duration_seconds,
        raw: block.raw,
      },
    });
  };

  for (const block of chronological) {
    if (block.kind === 'group_header') {
      if (openGroupDay && openGroupDay !== block.local_date) closeGroup();
      groupIndex += 1;
      openJobRef = `uber:${driverId}:${block.local_date}:${groupIndex}`;
      openJobSeq = 0;
      openGroupDay = block.local_date;
      continue;
    }

    if (block.kind === 'went_online' || block.kind === 'went_offline') {
      closeGroup();
      pushEvent(block.kind, block, null, null);
      continue;
    }

    // Trip lifecycle events — attach to open group when present.
    // If no open group (orphan), synthesize a job_ref from date+time.
    if (!openJobRef || openGroupDay !== block.local_date) {
      groupIndex += 1;
      openJobRef = `uber:${driverId}:${block.local_date}:${groupIndex}`;
      openJobSeq = 0;
      openGroupDay = block.local_date;
    }

    openJobSeq += 1;
    const seq = openJobSeq;

    if (block.kind === 'offer_accepted') {
      // Synthesize offer_received so Offers / Acceptance summary math works.
      pushEvent('offer_received', block, openJobRef, seq);
      openJobSeq += 1;
      pushEvent('offer_accepted', block, openJobRef, openJobSeq);
    } else {
      pushEvent(block.kind, block, openJobRef, seq);
    }

    if (
      block.kind === 'job_completed' ||
      block.kind === 'driver_cancelled' ||
      block.kind === 'rider_cancelled'
    ) {
      // Keep group open — multi-trip "Accepted N" may have more legs after complete.
      // Close only on Online/Offline/next Accepted (handled above).
    }
  }

  return events;
}

/**
 * Primary entry: raw Uber-app paste text → canonical events.
 * @param driverId used only for stable job_ref / source_event_id (picker required).
 */
export function parseUberActivityTimelineText(
  text: string,
  options?: { timeZone?: string; driverId?: string; assumeChronological?: boolean },
): UberTimelineParseResult {
  const timeZone = options?.timeZone || DEFAULT_ACTIVITY_TZ;
  const driverId = (options?.driverId || 'unknown').trim() || 'unknown';
  const warnings: string[] = [];

  if (!String(text || '').trim()) {
    return { events: [], warnings: ['Empty timeline text'], dateRange: null, stats: emptyStats() };
  }

  const blocks = tokenizePaste(text, warnings);
  const events = blocksToEvents(
    blocks,
    timeZone,
    driverId,
    warnings,
    Boolean(options?.assumeChronological),
  );
  // Sort ascending for stable insert / preview
  events.sort((a, b) => {
    const t = a.occurred_at.localeCompare(b.occurred_at);
    if (t !== 0) return t;
    return (a.job_seq ?? 0) - (b.job_seq ?? 0);
  });

  return {
    events,
    warnings,
    dateRange: dateRangeOf(events),
    stats: finalizeStats(events),
  };
}

export type StructuredTimelineRow = {
  date: string;
  event: string;
  time: string;
  duration?: string;
};

function cellToYmd(raw: unknown): string {
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, '0');
    const d = String(raw.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(raw ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const asDate = parseDateLine(s);
  if (asDate) return asDate;
  // DD/MM/YYYY or DD-MM-YYYY (fleet locale; day first when first part > 12)
  // also accepts MM/DD/YYYY when first part ≤ 12 and second > 12
  const slash = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const y = Number(slash[3]);
    let day: number;
    let month: number;
    if (a > 12 && b >= 1 && b <= 12) {
      day = a;
      month = b;
    } else if (b > 12 && a >= 1 && a <= 12) {
      month = a;
      day = b;
    } else {
      // Ambiguous (both ≤ 12): prefer DD/MM (Jamaica / fleet)
      day = a;
      month = b;
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  // Excel serial date (days since 1899-12-30)
  const n = Number(s);
  if (Number.isFinite(n) && n > 20000 && n < 80000) {
    const epoch = Date.UTC(1899, 11, 30) + Math.round(n) * 86400000;
    const dt = new Date(epoch);
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
  }
  return s;
}

function cellToTimeAmPm(raw: unknown): string {
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    let h = raw.getHours();
    const min = String(raw.getMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return `${h}:${min} ${ampm}`;
  }
  const s = String(raw ?? '').trim();
  if (TIME_RE.test(s)) return s;
  // Excel fraction-of-day
  const n = Number(s);
  if (Number.isFinite(n) && n >= 0 && n < 1) {
    const totalMin = Math.round(n * 24 * 60);
    let h = Math.floor(totalMin / 60);
    const min = String(totalMin % 60).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return `${h}:${min} ${ampm}`;
  }
  return s;
}

/**
 * Structured Excel/CSV rows (Date | Time | Activity | Duration) — chronological.
 * Date may be `October 18 2026`, `yyyy-MM-dd`, Date, or Excel serial.
 */
export function parseUberActivityTimelineRows(
  rows: StructuredTimelineRow[],
  options?: { timeZone?: string; driverId?: string; assumeChronological?: boolean },
): UberTimelineParseResult {
  const timeZone = options?.timeZone || DEFAULT_ACTIVITY_TZ;
  const driverId = (options?.driverId || 'unknown').trim() || 'unknown';
  const warnings: string[] = [];
  const blocks: RawBlock[] = [];

  for (const row of rows) {
    const ymd = cellToYmd(row.date);
    const event = String(row.event || '').trim();
    const timeRaw = cellToTimeAmPm(row.time);
    const duration = String(row.duration || '').trim();
    if (!event && !timeRaw) continue;
    if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      warnings.push(`Skipped row with bad date: "${row.date}"`);
      continue;
    }
    const kind = classifyLabel(event);
    if (!kind) {
      warnings.push(`Unrecognized event: "${event}"`);
      continue;
    }
    const local_time = kind === 'group_header'
      ? (parseTimeToHms(timeRaw) || '00:00:00')
      : parseTimeToHms(timeRaw);
    if (kind !== 'group_header' && !local_time) {
      warnings.push(`Event "${event}" on ${ymd} missing time — skipped`);
      continue;
    }
    blocks.push({
      label: event,
      kind,
      local_date: ymd,
      local_time: local_time || '00:00:00',
      duration_seconds: duration ? parseUberActivityDuration(duration) : null,
      raw: event,
    });
  }

  // Structured sheets are chronological by default (Activity Log Chronological).
  const assumeChronological = options?.assumeChronological !== false;
  const events = blocksToEvents(blocks, timeZone, driverId, warnings, assumeChronological);
  events.sort((a, b) => {
    const t = a.occurred_at.localeCompare(b.occurred_at);
    if (t !== 0) return t;
    return (a.job_seq ?? 0) - (b.job_seq ?? 0);
  });

  return {
    events,
    warnings,
    dateRange: dateRangeOf(events),
    stats: finalizeStats(events),
  };
}

/** Preferred workbook sheet for Uber app activity import. */
export const UBER_ACTIVITY_PREFERRED_SHEET = 'Activity Log (Chronological)';

export function pickUberActivityTimelineSheetName(sheetNames: string[]): string | null {
  const exact = sheetNames.find((n) => n.trim().toLowerCase() === UBER_ACTIVITY_PREFERRED_SHEET.toLowerCase());
  if (exact) return exact;
  const chrono = sheetNames.find((n) => /chronological/i.test(n) && /activity/i.test(n));
  if (chrono) return chrono;
  const activity = sheetNames.find((n) => /activity\s*log/i.test(n) && !/summary/i.test(n) && !/original/i.test(n));
  return activity || null;
}

/**
 * Read a workbook matrix (header:1) for the Chronological activity log sheet.
 * Skips title rows until Date | Time | Activity headers.
 */
export function parseUberActivityTimelineMatrix(
  matrix: unknown[][],
  options?: { timeZone?: string; driverId?: string; assumeChronological?: boolean },
): UberTimelineParseResult {
  let headerRow = -1;
  let dateCol = -1;
  let timeCol = -1;
  let eventCol = -1;
  let durCol = -1;

  for (let r = 0; r < Math.min(matrix.length, 15); r++) {
    const row = (matrix[r] || []).map((c) => String(c ?? '').trim());
    const lower = row.map((c) => c.toLowerCase());
    const d = lower.findIndex((c) => c === 'date' || c === 'day');
    const t = lower.findIndex((c) => c === 'time');
    const e = lower.findIndex(
      (c) => c.includes('activity') || c.includes('event') || c === 'status',
    );
    const du = lower.findIndex((c) => c.includes('duration'));
    if (d >= 0 && t >= 0 && e >= 0) {
      headerRow = r;
      dateCol = d;
      timeCol = t;
      eventCol = e;
      durCol = du;
      break;
    }
  }

  if (headerRow < 0) {
    return {
      events: [],
      warnings: ['Could not find Date / Time / Activity header row'],
      dateRange: null,
      stats: emptyStats(),
    };
  }

  const structured: StructuredTimelineRow[] = [];
  for (let r = headerRow + 1; r < matrix.length; r++) {
    const row = matrix[r] || [];
    structured.push({
      date: cellToYmd(row[dateCol]),
      time: cellToTimeAmPm(row[timeCol]),
      event: String(row[eventCol] ?? '').trim(),
      duration: durCol >= 0 ? String(row[durCol] ?? '').trim() : '',
    });
  }

  return parseUberActivityTimelineRows(structured, {
    ...options,
    assumeChronological: options?.assumeChronological !== false,
  });
}

/** Rebuild paste-friendly text for server re-parse (chronological). */
export function structuredRowsToImportText(rows: StructuredTimelineRow[]): string {
  const lines: string[] = [];
  let lastDate: string | null = null;
  for (const row of rows) {
    const ymd = cellToYmd(row.date);
    if (!ymd || !row.event) continue;
    const [y, m, d] = ymd.split('-').map(Number);
    const monthName = Object.keys(MONTHS).find((k) => MONTHS[k] === m);
    const dateLine = monthName
      ? `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${d} ${y}`
      : ymd;
    if (dateLine !== lastDate) {
      lines.push(dateLine);
      lastDate = dateLine;
    }
    lines.push(String(row.event).trim());
    const t = cellToTimeAmPm(row.time);
    if (t) lines.push(t);
    const dur = String(row.duration || '').trim();
    if (dur) lines.push(dur);
  }
  return lines.join('\n');
}

/**
 * Heuristic: does this tabular sheet look like a weekly Uber DRIVER_ACTIVITY
 * report (Driver UUID + Time online) rather than an app timeline?
 */
export function looksLikeOfficialUberDriverActivityCsv(headers: string[]): boolean {
  const h = headers.map((x) => x.trim().toLowerCase());
  const hasUuid = h.some((x) => x.includes('driver uuid') || x === 'driver id');
  const hasOnline =
    h.some((x) => x.includes('time online') || x.includes('online hours') || x === 'online') ||
    h.some((x) => x.includes('hours online'));
  const hasOnTrip = h.some((x) => x.includes('on trip') || x.includes('time on trip'));
  return hasUuid && (hasOnline || hasOnTrip);
}

/**
 * Heuristic: free-text / sheet content looks like an Uber app activity timeline.
 */
export function looksLikeUberActivityTimeline(text: string): boolean {
  const s = String(text || '');
  if (!s.trim()) return false;
  const hasDate = DATE_RE.test(s.split(/\r?\n/).map((l) => l.trim()).find((l) => DATE_RE.test(l)) || '')
    || /October|November|December|January|February|March|April|May|June|July|August|September/i.test(s);
  const hasOnline = /\bOnline\b/i.test(s);
  const hasOffline = /\bOffline\b/i.test(s);
  const hasOffer = /Offer accepted/i.test(s);
  return hasDate && ((hasOnline && hasOffline) || hasOffer);
}

/**
 * If a sheet is a single column of paste lines, join and parse as text.
 * If headers match Date/Event/Time, parse as structured rows.
 */
export function parseUberActivityTimelineFromTable(
  headers: string[],
  rows: Record<string, string>[],
  options?: { timeZone?: string; driverId?: string; assumeChronological?: boolean },
): UberTimelineParseResult {
  const norm = headers.map((h) => h.trim().toLowerCase());
  const dateIdx = norm.findIndex((h) => h === 'date' || h === 'day' || h.includes('date'));
  const eventIdx = norm.findIndex(
    (h) =>
      h === 'event' ||
      h === 'activity' ||
      h === 'status' ||
      h.includes('event') ||
      h.includes('activity'),
  );
  const timeIdx = norm.findIndex(
    (h) => h === 'time' || (h.includes('time') && !h.includes('online') && !h.includes('trip')),
  );
  const durIdx = norm.findIndex((h) => h === 'duration' || h.includes('duration'));

  if (dateIdx >= 0 && eventIdx >= 0 && timeIdx >= 0) {
    const dateKey = headers[dateIdx];
    const eventKey = headers[eventIdx];
    const timeKey = headers[timeIdx];
    const durKey = durIdx >= 0 ? headers[durIdx] : null;
    const structured: StructuredTimelineRow[] = rows.map((r) => ({
      date: String(r[dateKey] ?? ''),
      event: String(r[eventKey] ?? ''),
      time: String(r[timeKey] ?? ''),
      duration: durKey ? String(r[durKey] ?? '') : '',
    }));
    return parseUberActivityTimelineRows(structured, {
      ...options,
      assumeChronological: options?.assumeChronological !== false,
    });
  }

  // Single-column / free-text: concatenate non-empty cells in row order
  const lines: string[] = [];
  for (const r of rows) {
    for (const h of headers) {
      const v = String(r[h] ?? '').trim();
      if (v) lines.push(v);
    }
  }
  return parseUberActivityTimelineText(lines.join('\n'), options);
}

/** True when preview is commit-ready. */
export function canCommitUberActivityTimeline(result: UberTimelineParseResult): boolean {
  return result.events.length > 0 && result.stats.days >= 1;
}

export type UberTimelineFileDriverIdentity = {
  uberUuid: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
};

/**
 * Read Driver UUID / name from a structured timeline CSV/Excel row set.
 * UUID is usually only on the first data row; later rows leave it blank.
 */
export function extractUberTimelineDriverIdentity(
  headers: string[],
  rows: Record<string, string>[],
): UberTimelineFileDriverIdentity {
  const norm = headers.map((h) => h.trim().toLowerCase());
  const uuidKey =
    headers[
      norm.findIndex(
        (h) => h === 'driver uuid' || h === 'driver id' || h === 'uber uuid' || h.includes('driver uuid'),
      )
    ] || null;
  const firstKey =
    headers[norm.findIndex((h) => h.includes('first name') || h === 'first')] || null;
  const lastKey =
    headers[norm.findIndex((h) => h.includes('last name') || h === 'last')] || null;
  const nameKey =
    headers[norm.findIndex((h) => h === 'driver name' || h === 'name')] || null;

  let uberUuid: string | null = null;
  let firstName: string | null = null;
  let lastName: string | null = null;
  let displayName: string | null = null;

  for (const row of rows) {
    if (!uberUuid && uuidKey) {
      const v = String(row[uuidKey] || '').trim();
      if (v) uberUuid = v.toLowerCase();
    }
    if (!firstName && firstKey) {
      const v = String(row[firstKey] || '').trim();
      if (v) firstName = v;
    }
    if (!lastName && lastKey) {
      const v = String(row[lastKey] || '').trim();
      if (v) lastName = v;
    }
    if (!displayName && nameKey) {
      const v = String(row[nameKey] || '').trim();
      if (v) displayName = v;
    }
    if (uberUuid && (displayName || firstName || lastName)) break;
  }

  if (!displayName && (firstName || lastName)) {
    displayName = [firstName, lastName].filter(Boolean).join(' ').trim() || null;
  }

  return { uberUuid, firstName, lastName, displayName };
}
