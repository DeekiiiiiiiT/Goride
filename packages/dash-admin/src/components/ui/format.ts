/** Jamaican dollars, the only money format in this console. */
export function formatMoney(value: number | string | null | undefined): string {
  const amount = Number(value ?? 0);
  const safe = Number.isFinite(amount) ? amount : 0;
  return `J$${safe.toLocaleString('en-JM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Under a day: "12 min ago". Hover the element for the full time. */
export function formatRelative(iso: string | null | undefined): { label: string; absolute: string } {
  if (!iso) return { label: '—', absolute: '' };
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { label: '—', absolute: '' };
  const absolute = date.toLocaleString();
  const delta = Date.now() - date.getTime();
  const min = Math.round(delta / 60000);
  if (min < 1) return { label: 'Just now', absolute };
  if (min < 60) return { label: `${min} min ago`, absolute };
  const hours = Math.round(min / 60);
  if (hours < 24) return { label: `${hours}h ago`, absolute };
  return { label: absolute, absolute };
}

export function titleCaseStatus(value: string | null | undefined): string {
  if (!value) return '—';
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
