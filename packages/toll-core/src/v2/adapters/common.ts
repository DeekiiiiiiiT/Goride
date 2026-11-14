import Papa from 'papaparse';

const JAMAICA_OFFSET = '-05:00';

/** Strip currency symbols and spaces; parse decimal dollars to integer cents (string math). */
export function toMinor(text: string): number | null {
  const trimmed = (text || '').trim();
  if (!trimmed) return null;

  let negative = false;
  // Currency codes first ("JMD -370.00", "USD 5.00"), then symbols and spaces ("J$", "$").
  let work = trimmed.replace(/\b(JMD|USD)\b/gi, '').replace(/[\s$€£J]/gi, '');
  if (work.startsWith('(') && work.endsWith(')')) {
    negative = true;
    work = work.slice(1, -1);
  }
  if (work.startsWith('-')) {
    negative = true;
    work = work.slice(1);
  } else if (work.startsWith('+')) {
    work = work.slice(1);
  }
  work = work.replace(/,/g, '');
  if (!/^[\d.]+$/.test(work)) return null;

  const dot = work.indexOf('.');
  if (dot !== -1 && work.indexOf('.', dot + 1) !== -1) return null;

  let whole: string;
  let frac: string;
  if (dot === -1) {
    whole = work || '0';
    frac = '';
  } else {
    whole = work.slice(0, dot) || '0';
    frac = work.slice(dot + 1);
  }
  if (frac.length > 2) {
    const trailingZerosOnly = /^0+$/.test(frac.slice(2));
    if (!trailingZerosOnly) return null;
    frac = frac.slice(0, 2);
  }
  while (frac.length < 2) frac += '0';

  const sign = negative ? -1 : 1;
  const cents = parseInt(whole, 10) * 100 + parseInt(frac || '0', 10);
  if (Number.isNaN(cents)) return null;
  return sign * cents;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Wall clock in Jamaica as ISO with fixed -05:00 offset. */
export function formatJamaicaIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second = 0,
): string {
  return `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}${JAMAICA_OFFSET}`;
}

/** Date-only Jamaica calendar string from components. */
export function formatJamaicaDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function applyTimeToParts(
  timePart: string | undefined,
  year: number,
  month: number,
  day: number,
): { y: number; m: number; d: number; h: number; min: number; s: number } | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  let h = 0;
  let min = 0;
  let s = 0;
  if (timePart) {
    const timeMatch = timePart.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i);
    if (timeMatch) {
      h = parseInt(timeMatch[1], 10);
      min = parseInt(timeMatch[2], 10);
      s = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
      const ampm = (timeMatch[4] || '').toLowerCase();
      if (ampm === 'pm' && h < 12) h += 12;
      if (ampm === 'am' && h === 12) h = 0;
    }
  }
  return { y: year, m: month, d: day, h, min, s };
}

/**
 * TransJam / tag statement dates — DD/MM/YYYY first (BulkImportTollTransactionsModal).
 */
export function parseCsvDateTimeToJamaicaIso(dateStr: string): string | null {
  // Statements can wrap the time onto a second line inside the cell ("21 Sep 2026 <newline> 08:23 AM").
  const trimmed = (dateStr || '').replace(/\s+/g, ' ').trim();
  if (!trimmed) return null;

  // "21 Sep 2026 08:23 AM" / "21 September 2026 8:23" — month as a word, spaces between.
  const spacedMon = trimmed.match(/^(\d{1,2})\s+([A-Za-z]{3,})\.?,?\s+(\d{4})\s*(.*)?$/);
  if (spacedMon) {
    const [, dayStr, monStr, yearStr, timePart] = spacedMon;
    const months: Record<string, number> = {
      jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
      jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
    };
    const month = months[monStr.slice(0, 3).toLowerCase()];
    if (month !== undefined) {
      const parts = applyTimeToParts(timePart, parseInt(yearStr, 10), month, parseInt(dayStr, 10));
      if (parts) return formatJamaicaIso(parts.y, parts.m, parts.d, parts.h, parts.min, parts.s);
    }
  }

  const monMatch = trimmed.match(/^(\d{1,2})[\-\/]([A-Za-z]{3})[\-\/](\d{2,4})\s*(.*)?$/);
  if (monMatch) {
    const [, dayStr, monStr, yearStr, timePart] = monMatch;
    const months: Record<string, number> = {
      jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
      jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
    };
    const month = months[monStr.toLowerCase()];
    if (month !== undefined) {
      let year = parseInt(yearStr, 10);
      if (year < 100) year += 2000;
      const day = parseInt(dayStr, 10);
      const parts = applyTimeToParts(timePart, year, month, day);
      if (parts) return formatJamaicaIso(parts.y, parts.m, parts.d, parts.h, parts.min, parts.s);
    }
  }

  const dmyMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s*(.*)?$/);
  if (dmyMatch) {
    const [, dayOrMonth, monthOrDay, yearStr, timePart] = dmyMatch;
    const num1 = parseInt(dayOrMonth, 10);
    const num2 = parseInt(monthOrDay, 10);
    let day: number;
    let month: number;
    if (num1 > 12) {
      day = num1;
      month = num2;
    } else if (num2 > 12) {
      day = num2;
      month = num1;
    } else {
      day = num1;
      month = num2;
    }
    const year = parseInt(yearStr, 10);
    const parts = applyTimeToParts(timePart, year, month, day);
    if (parts) return formatJamaicaIso(parts.y, parts.m, parts.d, parts.h, parts.min, parts.s);
  }

  const hasUtcOrOffset = /Z$/i.test(trimmed) || /[+-]\d{2}:?\d{2}$/.test(trimmed);
  if (hasUtcOrOffset) {
    const instant = new Date(trimmed);
    if (!Number.isNaN(instant.getTime())) {
      return instantToJamaicaIso(instant);
    }
    return null;
  }

  const iso = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?/,
  );
  if (iso) {
    return formatJamaicaIso(
      parseInt(iso[1], 10),
      parseInt(iso[2], 10),
      parseInt(iso[3], 10),
      parseInt(iso[4], 10),
      parseInt(iso[5], 10),
      iso[6] ? parseInt(iso[6], 10) : 0,
    );
  }

  return null;
}

function instantToJamaicaIso(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Jamaica',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  let hour = parseInt(get('hour'), 10);
  if (hour === 24) hour = 0;
  return formatJamaicaIso(
    parseInt(get('year'), 10),
    parseInt(get('month'), 10),
    parseInt(get('day'), 10),
    hour,
    parseInt(get('minute'), 10),
    parseInt(get('second'), 10),
  );
}

export interface ParsedWallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Uber / trip_activity style dates with optional MM/DD vs DD/MM detection. */
export function parseUberDateString(str: string, isMMDD: boolean): ParsedWallClock | null {
  if (!str) return null;
  const s = String(str).trim();

  const dateMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4}|\d{2})/);
  if (dateMatch) {
    const p1 = parseInt(dateMatch[1], 10);
    const p2 = parseInt(dateMatch[2], 10);
    let year = parseInt(dateMatch[3], 10);
    if (year < 100) year += 2000;

    let month: number;
    let day: number;
    if (isMMDD) {
      month = p1;
      day = p2;
    } else {
      day = p1;
      month = p2;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;

    let h = 0;
    let min = 0;
    let sec = 0;
    const timeMatch = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
    if (timeMatch) {
      h = parseInt(timeMatch[1], 10);
      min = parseInt(timeMatch[2], 10);
      sec = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
      const meridian = timeMatch[4] ? timeMatch[4].toUpperCase() : null;
      if (meridian === 'PM' && h < 12) h += 12;
      if (meridian === 'AM' && h === 12) h = 0;
    }
    return { year, month, day, hour: h, minute: min, second: sec };
  }

  const d = parseCsvDateTimeToJamaicaIso(s);
  if (d) {
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
    if (m) {
      return {
        year: parseInt(m[1], 10),
        month: parseInt(m[2], 10),
        day: parseInt(m[3], 10),
        hour: parseInt(m[4], 10),
        minute: parseInt(m[5], 10),
        second: parseInt(m[6], 10),
      };
    }
  }
  return null;
}

/** Detect whether sample rows use MM/DD (default true until DD/MM proven). */
export function detectIsMMDDFromRows(rows: Record<string, string>[], dateKeys: string[]): boolean {
  for (const row of rows) {
    for (const key of dateKeys) {
      const val = row[key];
      if (!val) continue;
      const dateMatch = String(val).trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4}|\d{2})/);
      if (dateMatch) {
        const p1 = parseInt(dateMatch[1], 10);
        const p2 = parseInt(dateMatch[2], 10);
        if (p1 > 12) return false;
        if (p2 > 12) return true;
      }
    }
  }
  return true;
}

export function wallClockToJamaicaIso(clock: ParsedWallClock, minutePrecision = true): string {
  const sec = minutePrecision ? 0 : clock.second;
  const min = clock.minute;
  return formatJamaicaIso(clock.year, clock.month, clock.day, clock.hour, min, sec);
}

export function wallClockToJamaicaDate(clock: ParsedWallClock): string {
  return formatJamaicaDate(clock.year, clock.month, clock.day);
}

function detectDelimiter(text: string): string | undefined {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? '';
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  if (tabs > commas && tabs > 0) return '\t';
  return undefined;
}

export function parseCsvRecords(text: string): Record<string, string>[] {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    delimiter: detectDelimiter(text),
  });
  return (parsed.data ?? []).filter((row) =>
    Object.values(row).some((v) => String(v ?? '').trim() !== ''),
  );
}

export function parseCsvRows(text: string): string[][] {
  const parsed = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: true,
    delimiter: detectDelimiter(text),
  });
  return (parsed.data ?? []) as string[][];
}

export function buildHeaderMap(headerRow: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headerRow.forEach((cell, idx) => {
    const key = (cell || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (key) map[key] = idx;
  });
  return map;
}

export function normalizeHeaderKey(name: string): string {
  return (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function getColByMap(
  row: string[],
  headerMap: Record<string, number>,
  ...names: string[]
): string {
  for (const name of names) {
    const idx = headerMap[normalizeHeaderKey(name)];
    if (idx !== undefined) return (row[idx] || '').trim();
  }
  return '';
}

export function getColFromRecord(row: Record<string, string>, ...aliases: string[]): string {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const want = normalizeHeaderKey(alias);
    const found = keys.find((k) => normalizeHeaderKey(k) === want);
    if (found) return (row[found] || '').trim();
  }
  for (const alias of aliases) {
    const want = alias.toLowerCase().replace(/\s+/g, '');
    const found = keys.find((k) => k.toLowerCase().replace(/\s+/g, '') === want);
    if (found) return (row[found] || '').trim();
  }
  return '';
}

export function normalizeCsvTagId(id: string): string {
  return (id || '').replace(/^\uFEFF/, '').replace(/\t/g, '').trim();
}

/** Tag lookup key: trim and strip leading zeros (fleet modal). */
export function normalizeTagForLookup(id: string): string {
  return normalizeCsvTagId(id).replace(/^0+/, '') || '0';
}

export function normalizePlate(plate: string): string {
  return (plate || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

/** InDrive driver name / external id lookup key. */
export function normalizeIndriveDriverLookupKey(name: string): string {
  return (name || '').trim().replace(/\s+/g, ' ').toUpperCase();
}

/** Plaza name for tag crossing refs: trim and collapse inner whitespace. */
export function normalizePlazaNameForRef(name: string): string {
  return (name || '').trim().replace(/\s+/g, ' ');
}

const PLAZA_DIRECTION_SUFFIX = /\s+(east|west|north|south|eastbound|westbound|northbound|southbound|eb|wb|nb|sb)$/i;

/**
 * Plaza id for a statement's plaza name. The tag statement names the plaza with its direction
 * ("Portmore West", "Spanish Town East"); the plaza list holds the plaza ("Portmore").
 * Exact name first, then ignoring case, then without the trailing direction word.
 */
export function resolvePlazaIdByName(
  plazaName: string,
  plazaIdByName: Record<string, string>,
): string | null {
  const name = normalizePlazaNameForRef(plazaName);
  if (!name) return null;
  if (plazaIdByName[name]) return plazaIdByName[name];
  const byLower = new Map<string, string>();
  for (const [k, id] of Object.entries(plazaIdByName)) {
    const key = normalizePlazaNameForRef(k).toLowerCase();
    if (key && !byLower.has(key)) byLower.set(key, id);
  }
  const lower = name.toLowerCase();
  if (byLower.has(lower)) return byLower.get(lower)!;
  const base = lower.replace(PLAZA_DIRECTION_SUFFIX, '').trim();
  if (base && base !== lower && byLower.has(base)) return byLower.get(base)!;
  return null;
}

export function isoToMinuteKey(iso: string): string {
  const m = iso.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
  return m ? m[1] : iso;
}
