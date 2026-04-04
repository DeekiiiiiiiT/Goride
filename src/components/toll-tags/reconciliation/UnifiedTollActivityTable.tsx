import React, { useMemo, useState } from "react";
import { Loader2, Download, RefreshCw } from "lucide-react";
import { Button } from "../../ui/button";
import { useTollUnifiedEvents } from "../../../hooks/useTollUnifiedEvents";
import { api } from "../../../services/api";
import { toast } from "sonner@2.0.3";

function formatMoney(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  return `${sign}$${abs.toFixed(2)}`;
}

export function UnifiedTollActivityTable({ driverId }: { driverId?: string }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const opts = useMemo(
    () => ({
      from: from.trim() || undefined,
      to: to.trim() || undefined,
      limit: 200,
    }),
    [from, to],
  );

  const { data, meta, loading, error, refresh } = useTollUnifiedEvents(driverId, opts);

  const downloadCsv = async () => {
    try {
      const csv = await api.getTollUnifiedEventsExportCsv({
        driverId,
        from: opts.from,
        to: opts.to,
        limit: 500,
        offset: 0,
      });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `toll_unified_events_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Download started");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            From (YYYY-MM-DD)
            <input
              type="date"
              className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            To (YYYY-MM-DD)
            <input
              type="date"
              className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void refresh()}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button type="button" size="sm" onClick={() => void downloadCsv()}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            CSV
          </Button>
        </div>
      </div>

      {meta && (
        <p className="text-xs text-slate-500">
          Showing {data.length} of {meta.total} in range
          {meta.durationMs != null ? ` · ${meta.durationMs}ms` : ""}
        </p>
      )}

      {loading ? (
        <div className="flex h-40 items-center justify-center text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading unified activity…
        </div>
      ) : data.length === 0 ? (
        <p className="text-sm text-slate-500">No events for this filter.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Kind</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Links</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((row) => (
                <tr key={row.eventId} className="hover:bg-slate-50/80">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                    {row.occurredAt.slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="px-3 py-2 text-slate-800">{row.kindLabel}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">{row.sourceSystem}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums text-slate-900">
                    {formatMoney(row.amount)}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{row.workflowState}</td>
                  <td className="max-w-[220px] truncate px-3 py-2 text-xs text-slate-500">
                    {row.tripId && <span className="mr-2">trip:{row.tripId.slice(0, 8)}…</span>}
                    {row.matchedTollId && (
                      <span className="mr-2">toll:{row.matchedTollId.slice(0, 8)}…</span>
                    )}
                    {row.rawRef.store}:{row.rawRef.id.slice(0, 8)}…
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
