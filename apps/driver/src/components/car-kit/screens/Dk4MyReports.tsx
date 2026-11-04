/** Ported from Stitch — do not simplify layout (audit §0.4). */
import { useMemo, useState } from 'react';
import type { DriverReportRow } from '../../../services/driverInventoryApi';
import { Dk4ReportsList } from '../Dk4ReportsList';

function reportCounts(reports: DriverReportRow[]) {
  const total = reports.length;
  const open = reports.filter((r) => r.status !== 'fixed').length;
  const resolved = total - open;
  return { total, open, resolved };
}

export function Dk4MyReports({
  reports = [],
  reportsLoading,
  onOpenReport,
}: {
  reports?: DriverReportRow[];
  reportsLoading?: boolean;
  onOpenReport?: (report: DriverReportRow) => void;
}) {
  const [reportFilter, setReportFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const { total, open, resolved } = reportCounts(reports);

  const visibleReports = useMemo(() => {
    if (reportFilter === 'open') {
      return reports.filter((r) => r.status !== 'fixed');
    }
    if (reportFilter === 'resolved') {
      return reports.filter((r) => r.status === 'fixed');
    }
    return reports;
  }, [reports, reportFilter]);

  const tabClass = (key: typeof reportFilter) => {
    const active = reportFilter === key;
    return active
      ? 'filter-tab py-2.5 px-space-xs rounded-lg font-label-button text-[14px] text-center transition-all bg-surface-container-lowest text-on-surface shadow-sm font-semibold'
      : 'filter-tab py-2.5 px-space-xs rounded-lg font-label-button text-[14px] text-center text-on-surface-variant transition-all hover:text-on-surface font-semibold';
  };

  return (
    <div className="driver-car-kit-stitch inventory-stitch-root">
      <div className="inventory-stitch-main">
        <div className="flex flex-col w-full">
          <div className="px-margin pt-space-md pb-space-xs bg-surface flex flex-col gap-0.5">
            <div className="flex items-baseline justify-between">
              <h1 className="font-headline-md text-headline-md text-on-surface tracking-tight">My reports</h1>
              <span className="font-body-sm text-[13px] text-on-surface-variant font-medium">
                ({open} open · {total} total)
              </span>
            </div>
            <p className="font-body-sm text-[13px] text-on-surface-variant">
              Track status and fleet repairs for vehicle equipment
            </p>
          </div>

          <div className="px-margin py-space-xs sticky top-16 z-20 bg-surface/95 backdrop-blur-md">
            <div
              className="grid grid-cols-3 p-1 rounded-xl bg-surface-container gap-1 shadow-sm"
              role="tablist"
              aria-label="Filter reports"
            >
              <button
                type="button"
                onClick={() => setReportFilter('all')}
                aria-selected={reportFilter === 'all'}
                className={tabClass('all')}
                role="tab"
              >
                All{' '}
                <span className="text-[12px] opacity-75 font-normal ml-0.5">({total})</span>
              </button>
              <button
                type="button"
                onClick={() => setReportFilter('open')}
                aria-selected={reportFilter === 'open'}
                className={tabClass('open')}
                role="tab"
              >
                Open <span className="text-[12px] opacity-75 font-normal ml-0.5">({open})</span>
              </button>
              <button
                type="button"
                onClick={() => setReportFilter('resolved')}
                aria-selected={reportFilter === 'resolved'}
                className={tabClass('resolved')}
                role="tab"
              >
                Resolved{' '}
                <span className="text-[12px] opacity-75 font-normal ml-0.5">({resolved})</span>
              </button>
            </div>
          </div>

          <Dk4ReportsList reports={visibleReports} loading={reportsLoading} hideSummary onOpenReport={onOpenReport} />
        </div>
      </div>
    </div>
  );
}
