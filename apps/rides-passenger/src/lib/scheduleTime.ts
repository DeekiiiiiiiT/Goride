export type TimePeriod = 'AM' | 'PM';

export function parseTime24(time24: string): { hour12: number; minute: number; period: TimePeriod } {
  const [hh, mm] = time24.split(':').map(Number);
  const safeHour = Number.isFinite(hh) ? hh : 8;
  const safeMinute = Number.isFinite(mm) ? mm : 30;
  return {
    hour12: safeHour % 12 || 12,
    minute: safeMinute,
    period: safeHour >= 12 ? 'PM' : 'AM',
  };
}

export function toTime24(hour12: number, minute: number, period: TimePeriod): string {
  let hh = hour12;
  if (period === 'AM') {
    if (hour12 === 12) hh = 0;
  } else if (hour12 !== 12) {
    hh = hour12 + 12;
  }
  return `${String(hh).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function formatTimeLabel(time24: string): string {
  const { hour12, minute, period } = parseTime24(time24);
  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
}

export const HOUR12_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);

export const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, i) => i * 5);
