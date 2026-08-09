/** Relative age for command-center oldest-waiting labels. */
export function formatRelativeAge(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
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
