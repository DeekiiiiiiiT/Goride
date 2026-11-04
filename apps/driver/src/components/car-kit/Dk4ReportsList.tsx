import type { DriverReportRow } from '../../services/driverInventoryApi';
import { humanizeIssue } from './carKitDisplay';

function formatWhen(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-JM', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function Dk4ReportsList({
  reports,
  loading,
  hideSummary,
  onOpenReport,
}: {
  reports: DriverReportRow[];
  loading?: boolean;
  hideSummary?: boolean;
  onOpenReport?: (report: DriverReportRow) => void;
}) {
  if (loading) {
    return (
      <div className="px-margin py-space-xl text-center font-body-sm text-on-surface-variant">
        Loading your reports…
      </div>
    );
  }

  if (!reports.length) {
    return (
      <div className="px-margin py-space-xl rounded-xl bg-surface-container-lowest flex flex-col items-center text-center gap-space-sm shadow-sm">
        <span className="material-symbols-outlined text-[32px] text-primary">task_alt</span>
        <span className="font-headline-sm text-headline-sm text-on-surface">No reports yet</span>
        <span className="font-body-sm text-body-sm text-on-surface-variant max-w-[240px]">
          When you report a kit problem, it will show up here with fleet updates.
        </span>
      </div>
    );
  }

  const open = reports.filter((r) => r.status !== 'fixed').length;

  return (
    <div className="px-margin pt-space-sm pb-28 flex flex-col gap-space-md">
      {!hideSummary ? (
        <div className="font-body-sm text-[13px] text-on-surface-variant">
          {open} open · {reports.length} total
        </div>
      ) : null}
      {reports.map((r) => {
        const resolved = r.status === 'fixed';
        const title = r.displayName ?? r.itemLabel ?? 'Kit item';
        const issueLine = humanizeIssue(r.issue);
        return (
          <div
            key={r.id ?? r.reportNo}
            className="rounded-xl bg-surface-container-lowest p-space-md shadow-sm border border-outline-variant/30 flex flex-col gap-space-sm"
          >
            <div className="flex items-start justify-between gap-space-xs">
              <div className="flex flex-col min-w-0">
                <span className="font-headline-sm text-headline-sm text-on-surface font-bold truncate">
                  {title}
                </span>
                <span className="font-body-sm text-[12px] text-outline mt-0.5">
                  {issueLine} · {formatWhen(r.createdAt)} · {r.reportNo ?? 'Report'}
                </span>
              </div>
              <span
                className={
                  resolved
                    ? 'inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-600 text-white font-label-status text-[12px] shrink-0 font-bold'
                    : 'inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-label-status text-[12px] shrink-0 font-bold'
                }
              >
                {resolved ? 'Fixed' : r.status === 'seen' ? 'Seen by fleet' : 'Reported'}
              </span>
            </div>
            {r.fleetReply ? (
              <p className="font-body-sm text-[13px] text-on-surface-variant bg-surface-container-low rounded-lg p-2">
                {r.fleetReply}
              </p>
            ) : null}
            {onOpenReport ? (
              <button
                type="button"
                className="self-start font-body-sm text-body-sm font-semibold text-secondary hover:text-primary"
                onClick={() => onOpenReport(r)}
              >
                View update
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
