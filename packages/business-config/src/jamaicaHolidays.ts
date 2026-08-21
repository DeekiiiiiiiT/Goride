/**
 * Jamaica public holidays (Holidays (Public General) Act + common practice).
 * Roam maintains this list — partners do not add national holidays.
 */

export type JamaicaHolidayKey =
  | 'new_years_day'
  | 'ash_wednesday'
  | 'good_friday'
  | 'easter_monday'
  | 'labour_day'
  | 'emancipation_day'
  | 'independence_day'
  | 'national_heroes_day'
  | 'christmas_day'
  | 'boxing_day';

export type JamaicaHoliday = {
  id: string;
  key: JamaicaHolidayKey;
  name: string;
  /** Observed public-holiday date (YYYY-MM-DD, America/Jamaica calendar day). */
  date: string;
};

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function toIsoDate(year: number, monthIndex: number, day: number): string {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

function fromUtcDate(d: Date): string {
  return toIsoDate(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function addUtcDays(d: Date, days: number): Date {
  const next = new Date(d.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** Anonymous Gregorian algorithm — UTC date of Easter Sunday. */
export function easterSundayUtc(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function weekdayUtc(year: number, monthIndex: number, day: number): number {
  return new Date(Date.UTC(year, monthIndex, day)).getUTCDay();
}

/** If date falls on Sunday, observe the following Monday. */
function observeIfSunday(year: number, monthIndex: number, day: number): string {
  const dow = weekdayUtc(year, monthIndex, day);
  if (dow === 0) {
    return fromUtcDate(addUtcDays(new Date(Date.UTC(year, monthIndex, day)), 1));
  }
  return toIsoDate(year, monthIndex, day);
}

/** Labour Day (23 May): if Sat/Sun, observe the following Monday. */
function labourDayObserved(year: number): string {
  const dow = weekdayUtc(year, 4, 23);
  if (dow === 6) return toIsoDate(year, 4, 25);
  if (dow === 0) return toIsoDate(year, 4, 24);
  return toIsoDate(year, 4, 23);
}

/** Third Monday in October. */
function nationalHeroesDay(year: number): string {
  const first = new Date(Date.UTC(year, 9, 1));
  const firstDow = first.getUTCDay();
  const firstMondayOffset = (1 - firstDow + 7) % 7;
  const thirdMonday = 1 + firstMondayOffset + 14;
  return toIsoDate(year, 9, thirdMonday);
}

function boxingDayObserved(year: number): string {
  // Day after Christmas; when Christmas is Sunday, Boxing Day is Tuesday 27 Dec.
  const christmasDow = weekdayUtc(year, 11, 25);
  if (christmasDow === 0) return toIsoDate(year, 11, 27);
  return toIsoDate(year, 11, 26);
}

export function jamaicaHolidaysForYear(year: number): JamaicaHoliday[] {
  const easter = easterSundayUtc(year);
  const goodFriday = addUtcDays(easter, -2);
  const easterMonday = addUtcDays(easter, 1);
  const ashWednesday = addUtcDays(easter, -46);

  const rows: Array<{ key: JamaicaHolidayKey; name: string; date: string }> = [
    {
      key: 'new_years_day',
      name: "New Year's Day",
      date: observeIfSunday(year, 0, 1),
    },
    {
      key: 'ash_wednesday',
      name: 'Ash Wednesday',
      date: fromUtcDate(ashWednesday),
    },
    {
      key: 'good_friday',
      name: 'Good Friday',
      date: fromUtcDate(goodFriday),
    },
    {
      key: 'easter_monday',
      name: 'Easter Monday',
      date: fromUtcDate(easterMonday),
    },
    {
      key: 'labour_day',
      name: 'Labour Day',
      date: labourDayObserved(year),
    },
    {
      key: 'emancipation_day',
      name: 'Emancipation Day',
      date: observeIfSunday(year, 7, 1),
    },
    {
      key: 'independence_day',
      name: 'Independence Day',
      date: observeIfSunday(year, 7, 6),
    },
    {
      key: 'national_heroes_day',
      name: 'National Heroes Day',
      date: nationalHeroesDay(year),
    },
    {
      key: 'christmas_day',
      name: 'Christmas Day',
      date: toIsoDate(year, 11, 25),
    },
    {
      key: 'boxing_day',
      name: 'Boxing Day',
      date: boxingDayObserved(year),
    },
  ];

  return rows
    .map((row) => ({
      id: `${row.key}-${year}`,
      key: row.key,
      name: row.name,
      date: row.date,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Current calendar year + next year (Roam default holiday window). */
export function jamaicaHolidaysUpcoming(now = new Date()): JamaicaHoliday[] {
  const year = now.getFullYear();
  return [...jamaicaHolidaysForYear(year), ...jamaicaHolidaysForYear(year + 1)];
}

export function jamaicaHolidayDateSet(now = new Date()): Set<string> {
  return new Set(jamaicaHolidaysUpcoming(now).map((h) => h.date));
}

export function findJamaicaHolidayByDate(
  dateIso: string,
  now = new Date(),
): JamaicaHoliday | undefined {
  const year = Number(dateIso.slice(0, 4));
  if (!Number.isFinite(year)) return undefined;
  const years = new Set([year, now.getFullYear(), now.getFullYear() + 1]);
  for (const y of years) {
    const hit = jamaicaHolidaysForYear(y).find((h) => h.date === dateIso);
    if (hit) return hit;
  }
  return undefined;
}
