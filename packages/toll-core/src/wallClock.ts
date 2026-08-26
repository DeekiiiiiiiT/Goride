/** yyyy-MM-dd → local calendar Date (avoids UTC-midnight shifting the day). */
export function ymdToLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return new Date(NaN);
  // Noon local — survives America/Jamaica (UTC−5) re-projection on UTC CI hosts.
  // Midnight UTC → prior calendar day in Jamaica → wrong prior Monday week key.
  return new Date(y, m - 1, d, 12, 0, 0);
}

/**
 * Normalize tag-import wall-clock times (incl. "11:47:00 AM") to HH:mm:ss.
 * Needed so `new Date('yyyy-MM-ddT…')` never gets Invalid Date from AM/PM suffixes.
 */
export function normalizeWallClockTime(raw: string): string {
  const pm = raw.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (pm) {
    let h = parseInt(pm[1], 10);
    const m = pm[2];
    const s = pm[3] || '00';
    const ampm = pm[4].toLowerCase();
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${m}:${s}`;
  }
  const parts = raw.trim().split(':');
  if (parts.length >= 2) {
    const sec = (parts[2] || '00').replace(/\D/g, '') || '00';
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:${sec.padStart(2, '0')}`;
  }
  return '00:00:00';
}
