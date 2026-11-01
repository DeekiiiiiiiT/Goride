import { useMemo } from "react";
import { Check, HelpCircle, Link2, Loader2, XCircle } from "lucide-react";
import type { VehicleCatalogPendingRequest } from "../../../../types/vehicleCatalogPending";

type QueueFilter = "all_pending" | "needs_info";

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function formatRequested(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const MARKET_OPTIONS = [
  { id: "all", label: "All markets" },
  { id: "JM", label: "Jamaica (JM)" },
  { id: "JDM", label: "JDM" },
];

export function PendingVehiclesCatalogTab({
  items,
  visible,
  total,
  loading,
  query,
  onQueryChange,
  queueFilter,
  onQueueFilterChange,
  marketFilter,
  onMarketFilterChange,
  page,
  pageSize,
  onPageChange,
  onOpenDetail,
}: {
  items: VehicleCatalogPendingRequest[];
  visible: VehicleCatalogPendingRequest[];
  total: number;
  loading: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  queueFilter: QueueFilter;
  onQueueFilterChange: (filter: QueueFilter) => void;
  marketFilter: string;
  onMarketFilterChange: (market: string) => void;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onOpenDetail: (row: VehicleCatalogPendingRequest) => void;
}) {
  const metrics = useMemo(() => {
    const newCount = items.filter((r) => r.status !== "needs_info").length;
    const needsInfo = items.filter((r) => r.status === "needs_info").length;
    const queuePct = items.length ? ((newCount / items.length) * 100).toFixed(1) : "0.0";
    return { newCount, needsInfo, queuePct, addedWeek: 0, rejected: 0 };
  }, [items]);

  const exportCsv = () => {
    const header = ["Make", "Model", "Year", "Requested", "Status", "Source"];
    const lines = visible.map((row) =>
      [
        csvEscape(row.proposed_make),
        csvEscape(row.proposed_model),
        String(row.proposed_production_start_year),
        formatRequested(row.created_at),
        row.status === "needs_info" ? "Needs info" : "Pending",
        csvEscape(row.source),
      ].join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pending-vehicles-queue.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const filterChip = (id: QueueFilter, label: string, count: number) => {
    const active = queueFilter === id;
    return (
      <button
        key={id}
        type="button"
        className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 font-mono-sm text-mono-sm font-medium transition-colors ${
          active ? "bg-primary font-semibold text-on-primary" : "bg-surface-container text-on-surface hover:bg-surface-variant"
        }`}
        onClick={() => onQueueFilterChange(id)}
      >
        <span>{label}</span>
        <span
          className={`rounded px-1.5 py-0.5 font-mono-sm ${
            active ? "bg-white/20 text-on-primary" : "bg-surface-container-highest text-on-surface-variant"
          }`}
        >
          {count}
        </span>
      </button>
    );
  };

  return (
    <div className="flex flex-col">
      <h1 className="font-headline-xl text-headline-xl font-semibold tracking-tight text-on-surface">Pending catalog</h1>
      <p className="mb-space-md font-body-sm text-body-sm text-on-surface-variant">Cars and parts that apps have asked us to add.</p>
      <div className="mb-space-md flex flex-wrap items-center gap-space-sm">
        <span className="font-mono-sm text-label-xs rounded bg-surface-container px-2 py-1 text-on-surface-variant">
          Jurisdiction: All (JDM / Export)
        </span>
        <span className="font-mono-sm text-label-xs rounded bg-surface-container px-2 py-1 text-on-surface-variant">
          Status: Pending Verification
        </span>
      </div>
      <div className="mb-space-xl grid grid-cols-1 gap-gutter sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col justify-between rounded-xl bg-surface-container-lowest p-space-md shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-secondary" />
              <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">New</span>
            </div>
            <span className="material-symbols-outlined text-[18px] text-secondary">inbox</span>
          </div>
          <div className="flex items-baseline justify-between pb-1 pt-3">
            <span className="font-mono-lg text-[32px] font-semibold leading-none text-on-surface">{metrics.newCount}</span>
            <span className="font-mono-sm text-mono-sm text-on-surface-variant">{metrics.queuePct}% queue</span>
          </div>
          <div className="font-body-sm text-body-sm text-on-surface-variant">Awaiting review</div>
        </div>
        <div className="flex flex-col justify-between rounded-xl bg-surface-container-lowest p-space-md shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-primary-container" />
              <span className="font-label-md text-label-md font-semibold uppercase tracking-wider text-primary">Needs info</span>
            </div>
            <span className="material-symbols-outlined text-[18px] text-primary-container">contact_support</span>
          </div>
          <div className="flex items-baseline justify-between pb-1 pt-3">
            <span className="font-mono-lg text-[32px] font-semibold leading-none text-primary">{metrics.needsInfo}</span>
            <span className="font-mono-sm text-mono-sm font-medium text-primary">Follow-up</span>
          </div>
          <div className="font-body-sm text-body-sm text-on-surface-variant">Waiting on fleet</div>
        </div>
        <div className="flex flex-col justify-between rounded-xl bg-surface-container-lowest p-space-md shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#006e31]" />
              <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Added this week</span>
            </div>
            <span className="material-symbols-outlined text-[18px] text-[#006e31]">verified</span>
          </div>
          <div className="flex items-baseline justify-between pb-1 pt-3">
            <span className="font-mono-lg text-[32px] font-semibold leading-none text-on-surface">{metrics.addedWeek}</span>
            <span className="font-mono-sm text-mono-sm text-on-surface-variant">Cataloged</span>
          </div>
          <div className="font-body-sm text-body-sm text-on-surface-variant">Approved to master data</div>
        </div>
        <div className="flex flex-col justify-between rounded-xl bg-surface-container-lowest p-space-md shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-error" />
              <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Rejected</span>
            </div>
            <span className="material-symbols-outlined text-[18px] text-error">block</span>
          </div>
          <div className="flex items-baseline justify-between pb-1 pt-3">
            <span className="font-mono-lg text-[32px] font-semibold leading-none text-on-surface">{metrics.rejected}</span>
            <span className="font-mono-sm text-mono-sm text-on-surface-variant">Closed</span>
          </div>
          <div className="font-body-sm text-body-sm text-on-surface-variant">Not added to catalog</div>
        </div>
      </div>

      <div className="mb-space-md flex flex-col justify-between gap-space-md rounded-xl bg-surface-container-lowest p-space-md shadow-sm lg:flex-row lg:items-center">
        <div className="flex flex-wrap items-center gap-space-xs">
          {filterChip("all_pending", "All pending", items.length)}
          {filterChip("needs_info", "Needs info", metrics.needsInfo)}
          <span className="mx-1 h-6 w-px bg-surface-container-high" />
          {MARKET_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`rounded-lg px-3 py-1.5 font-mono-sm text-mono-sm font-medium ${
                marketFilter === opt.id
                  ? "bg-primary text-on-primary"
                  : "bg-surface-container text-on-surface hover:bg-surface-variant"
              }`}
              onClick={() => onMarketFilterChange(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex flex-1 items-center justify-end gap-space-sm lg:max-w-xl">
          <div className="relative flex w-full max-w-sm items-center">
            <span className="material-symbols-outlined absolute left-2.5 text-[18px] text-on-surface-variant">search</span>
            <input
              className="h-9 w-full rounded-xl bg-surface pl-9 pr-3 font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant focus:bg-surface-container-lowest focus:outline-none"
              placeholder="Search make or model…"
              type="text"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="flex h-9 items-center gap-1.5 whitespace-nowrap rounded-xl bg-surface-container px-3 font-label-md text-label-md text-on-surface transition-colors hover:bg-surface-variant"
            onClick={exportCsv}
          >
            <span className="material-symbols-outlined text-[16px]">download</span>
            <span>Export queue CSV</span>
          </button>
          <button
            type="button"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-container text-on-surface transition-colors hover:bg-surface-variant"
            title="Column options"
          >
            <span className="material-symbols-outlined text-[18px]">tune</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-on-surface-variant" />
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-surface font-label-xs text-label-xs uppercase text-on-surface-variant">
                  <th className="min-w-[100px] px-space-md py-2.5 font-semibold">Request ID</th>
                  <th className="min-w-[140px] px-space-md py-2.5 font-semibold">Make & Model</th>
                  <th className="min-w-[120px] px-space-md py-2.5 font-semibold">Chassis / Series</th>
                  <th className="min-w-[110px] px-space-md py-2.5 font-semibold">Asked by</th>
                  <th className="min-w-[120px] px-space-md py-2.5 font-semibold">Target Spec Match</th>
                  <th className="min-w-[100px] px-space-md py-2.5 font-semibold">Discovered</th>
                  <th className="min-w-[110px] px-space-md py-2.5 font-semibold">Status</th>
                  <th className="min-w-[120px] px-space-md py-2.5 font-semibold">Make</th>
                  <th className="min-w-[120px] px-space-md py-2.5 font-semibold">Model</th>
                  <th className="min-w-[80px] px-space-md py-2.5 font-semibold">Year</th>
                  <th className="min-w-[140px] px-space-md py-2.5 font-semibold">Requested</th>
                  <th className="min-w-[200px] px-space-md py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="font-body-sm text-body-sm text-on-surface">
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-space-md py-12 text-center text-on-surface-variant">
                      No pending vehicle requests in this queue.
                    </td>
                  </tr>
                ) : (
                  visible.map((row) => {
                    const needsInfo = row.status === "needs_info";
                    return (
                      <tr key={row.id} className="border-t border-surface-container-high transition-colors hover:bg-primary-fixed/10">
                        <td className="px-space-md py-3 font-semibold">{row.proposed_make}</td>
                        <td className="px-space-md py-3 font-medium">{row.proposed_model}</td>
                        <td className="px-space-md py-3 font-mono-sm text-mono-sm">{row.proposed_production_start_year}</td>
                        <td className="px-space-md py-3">
                          <div className="flex flex-col">
                            <span className="font-mono-sm text-mono-sm">{formatRequested(row.created_at)}</span>
                            <span className="font-mono-sm text-mono-sm text-on-surface-variant">from {row.source}</span>
                          </div>
                        </td>
                        <td className="px-space-md py-3">
                          {needsInfo ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-2.5 py-0.5 font-label-md text-label-md text-on-surface">
                              <span className="h-1.5 w-1.5 rounded-full bg-primary-container" />
                              Needs info
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-2.5 py-0.5 font-label-md text-label-md text-on-surface">
                              <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="px-space-md py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded-lg bg-[#006e31] px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-800"
                              onClick={() => onOpenDetail(row)}
                            >
                              <Check className="h-3.5 w-3.5" aria-hidden />
                              Approve
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-1 text-xs font-medium text-on-surface hover:bg-surface-container"
                              onClick={() => onOpenDetail(row)}
                            >
                              <Link2 className="h-3.5 w-3.5" aria-hidden />
                              Link
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded-lg border border-error/30 bg-surface-container-lowest px-2.5 py-1 text-xs font-medium text-error hover:bg-error/10"
                              onClick={() => onOpenDetail(row)}
                            >
                              <XCircle className="h-3.5 w-3.5" aria-hidden />
                              Reject
                            </button>
                            <button
                              type="button"
                              title="Ask for info"
                              className="rounded-lg p-1 text-on-surface-variant hover:bg-surface-container"
                              onClick={() => onOpenDetail(row)}
                            >
                              <HelpCircle className="h-4 w-4" aria-hidden />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-col items-center justify-between gap-space-sm bg-surface px-space-md py-3 sm:flex-row">
          <div className="font-mono-sm text-mono-sm text-on-surface-variant">
            Showing <span className="font-semibold text-on-surface">{visible.length}</span> queued vehicle
            {visible.length === 1 ? "" : "s"}
            {total > visible.length ? ` (${total} total in filter)` : ""}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-md border border-outline-variant bg-surface-container-lowest px-2 py-1 font-mono-sm text-mono-sm disabled:opacity-40"
              disabled={loading || page === 0}
              onClick={() => onPageChange(Math.max(0, page - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className="rounded-md border border-outline-variant bg-surface-container-lowest px-2 py-1 font-mono-sm text-mono-sm disabled:opacity-40"
              disabled={loading || (page + 1) * pageSize >= total}
              onClick={() => onPageChange(page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
