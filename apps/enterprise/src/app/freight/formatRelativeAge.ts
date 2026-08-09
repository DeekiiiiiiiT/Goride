/** Parse ISO-ish timestamp; null if missing/invalid. */
function parseWhen(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** Relative age buckets shared by command-center + ops timelines. */
export function formatRelativeAge(iso: string | null | undefined): string | null {
  const t = parseWhen(iso);
  if (t == null) return null;
  const hours = Math.max(0, (Date.now() - t) / 3_600_000);
  if (hours < 1) {
    const mins = Math.max(1, Math.round(hours * 60));
    return `${mins}m ago`;
  }
  if (hours < 48) {
    const h = Math.round(hours);
    return `${h}h ago`;
  }
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function formatOldestLabel(iso: string | null | undefined): string | null {
  const age = formatRelativeAge(iso);
  return age ? `oldest ${age}` : null;
}

const shortLocalFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

/** Full local string for hover titles. */
export function formatOpsWhenTitle(iso: string | null | undefined): string | undefined {
  const t = parseWhen(iso);
  if (t == null) return undefined;
  return new Date(t).toLocaleString();
}

/** Relative + short local: "2h ago · Sat 3:50 PM". */
export function formatOpsWhen(iso: string | null | undefined): string | null {
  const t = parseWhen(iso);
  if (t == null) return null;
  const age = formatRelativeAge(iso);
  const local = shortLocalFmt.format(new Date(t));
  return age ? `${age} · ${local}` : local;
}
