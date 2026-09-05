/**
 * Shared display helpers for Fuel Logs (transactions + Full Tanks).
 * Keep raw enums out of user-visible badges.
 */

/** Humanize reset / close-mode labels for UI. */
export function humanizeResetType(raw?: string | null): string {
  const v = String(raw || '').trim();
  if (!v) return '—';
  const key = v.toUpperCase().replace(/\s+/g, '_');
  if (key === 'AUTO_SOFT' || key === 'CAPACITY_FULL' || key === 'CAPACITYFULL') return 'Full Tank';
  if (key === 'AUTO_ANOMALY') return 'Anomaly';
  if (key === 'MANUAL') return 'Manual';
  return v.replace(/_/g, ' ');
}

/** Humanize fuel entry / payment type enums for table badges. */
export function humanizeEntryType(raw?: string | null): string {
  const v = String(raw || '').trim();
  if (!v) return 'Fuel';
  const map: Record<string, string> = {
    Auto_Soft: 'Full Tank',
    CAPACITY_FULL: 'Full Tank',
    'CAPACITY FULL': 'Full Tank',
    Card_Transaction: 'Card Transaction',
    Fuel_Manual_Entry: 'Manual Entry',
    Manual_Entry: 'Manual Entry',
    Reimbursement: 'Reimbursement',
    Gas_Card: 'Gas Card',
    RideShare_Cash: 'RideShare Cash',
    Petty_Cash: 'Petty Cash',
  };
  if (map[v]) return map[v];
  return v.replace(/_/g, ' ');
}

/** Sort/display timestamp: live ISO `date` or admin `date` + `time`. */
export function fuelEntrySortMs(e: { date?: string; time?: string | null }): number {
  const dateRaw = String(e.date || '');
  const timeRaw = String(e.time || '').trim();
  if (dateRaw.includes('T')) {
    const m = dateRaw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (m) {
      return new Date(
        Number(m[1]),
        Number(m[2]) - 1,
        Number(m[3]),
        Number(m[4]),
        Number(m[5]),
        Number(m[6] || 0),
      ).getTime();
    }
    const t = new Date(dateRaw).getTime();
    return Number.isNaN(t) ? 0 : t;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
    const [y, mo, d] = dateRaw.split('-').map(Number);
    const tm = timeRaw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    const hh = tm ? Number(tm[1]) : 0;
    const mm = tm ? Number(tm[2]) : 0;
    const ss = tm ? Number(tm[3] || 0) : 0;
    return new Date(y, mo - 1, d, hh, mm, ss).getTime();
  }
  if (!dateRaw) return 0;
  const t = new Date(dateRaw).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export function formatFuelLogDate(dateString: string): string {
  if (!dateString) return '-';
  if (dateString.includes('-') && dateString.length === 10) {
    const [y, m, d] = dateString.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString();
  }
  if (dateString.includes('T')) {
    const day = dateString.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      const [y, m, d] = day.split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString();
    }
  }
  return new Date(dateString).toLocaleDateString();
}

/**
 * Time for any fuel log:
 * - Admin anchors: separate `time` (HH:mm:ss)
 * - Live/portal reimbursements: embedded in `date` as ISO
 */
export function formatFuelEntryTime(entry: { date?: string; time?: string | null }): string | null {
  const fromTimeField = (timeRaw?: string | null) => {
    if (!timeRaw) return null;
    const m = String(timeRaw).trim().match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (Number.isNaN(h) || h > 23 || Number.isNaN(min)) return null;
    const d = new Date();
    d.setHours(h, min, 0, 0);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const viaField = fromTimeField(entry.time);
  if (viaField) return viaField;

  const dateRaw = String(entry.date || '');
  const iso = dateRaw.match(/T(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (iso) return fromTimeField(`${iso[1]}:${iso[2]}`);
  return null;
}

export function entrySourceLabel(src: string): { label: string; color: string } {
  switch (src) {
    case 'admin-manual':
      return { label: 'Admin Entry', color: 'bg-amber-50 text-amber-700 border-amber-200' };
    case 'admin-edit':
      return { label: 'Admin Edit', color: 'bg-violet-50 text-violet-700 border-violet-200' };
    case 'bulk-import':
      return { label: 'Imported', color: 'bg-slate-100 text-slate-600 border-slate-200' };
    case 'fuel-card':
      return { label: 'Fuel Card', color: 'bg-blue-50 text-blue-600 border-blue-200' };
    case 'driver-portal':
      return { label: 'Portal', color: 'bg-emerald-50 text-emerald-600 border-emerald-200' };
    default:
      return { label: humanizeEntryType(src), color: 'bg-slate-50 text-slate-500 border-slate-200' };
  }
}
