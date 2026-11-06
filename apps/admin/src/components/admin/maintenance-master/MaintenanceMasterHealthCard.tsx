import type { MaintenanceHealthResponse } from "./maintenanceMasterApi";

type Props = {
  health: MaintenanceHealthResponse | null;
  loading?: boolean;
  onNavigate?: (page: string) => void;
};

export function MaintenanceMasterHealthCard({ health, loading, onNavigate }: Props) {
  if (loading) {
    return (
      <section className="rounded-2xl border border-outline-variant/30 bg-white p-6 text-sm text-on-surface-variant">
        <h2 className="font-headline text-headline-sm text-on-surface">Service schedules</h2>
        <p className="mt-3">Loading service schedules…</p>
      </section>
    );
  }
  if (!health) {
    return (
      <section className="rounded-2xl border border-outline-variant/30 bg-white p-6 text-sm">
        <h2 className="font-headline text-headline-sm text-on-surface">Service schedules</h2>
        <p className="mt-3 text-on-surface-variant">Could not load schedule health.</p>
      </section>
    );
  }

  const checked = new Date(health.lastCheckedAt);
  const checkedLabel = Number.isFinite(checked.getTime())
    ? checked.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : "—";

  return (
    <section className="mm-light-card rounded-2xl border border-outline-variant/30 bg-white p-6">
      <h2 className="font-headline text-headline-sm text-on-surface">Service schedules</h2>
      <ul className="mt-4 space-y-3 text-sm">
        {health.rows.map((row) => (
          <li key={row.key} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-outline-variant/20 pb-2">
            <span className="text-on-surface">{row.label}</span>
            <span className="flex items-center gap-2">
              <span className="font-code text-on-surface">{row.count}</span>
              {row.page && onNavigate ? (
                <button
                  type="button"
                  className="text-xs font-medium text-secondary"
                  onClick={() => onNavigate(row.page!)}
                >
                  Open
                </button>
              ) : null}
            </span>
            {row.detail ? <p className="w-full text-xs text-on-surface-variant">{row.detail}</p> : null}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-on-surface-variant">Last checked {checkedLabel} today</p>
    </section>
  );
}
