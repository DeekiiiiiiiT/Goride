import React, { useMemo, useRef, useState } from "react";
import { Loader2, Download, RefreshCw, CalendarRange, ChevronDown, ArrowRight, Link2 } from "lucide-react";
import { Button } from "../../ui/button";
import { Badge } from "../../ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../ui/collapsible";
import { cn } from "../../ui/utils";
import { useTollUnifiedEvents } from "../../../hooks/useTollUnifiedEvents";
import { api } from "../../../services/api";
import { toast } from "sonner@2.0.3";
import { groupByWeek } from "../../../utils/tollWeekPeriod";
import { useFleetTimezone } from "../../../utils/timezoneDisplay";
import type { TollEventWorkflowState, TollFinancialEvent } from "../../../types/tollFinancialEvent";

function formatMoney(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  return `${sign}$${abs.toFixed(2)}`;
}

const WORKFLOW_STATE_META: Record<TollEventWorkflowState, { label: string; className: string }> = {
  matched: { label: "Reconciled", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  approved: { label: "Approved", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  unmatched: { label: "Needs Review", className: "bg-amber-100 text-amber-700 border-amber-200" },
  rejected: { label: "Rejected", className: "bg-rose-100 text-rose-700 border-rose-200" },
  unlinked_refund: { label: "Unlinked Refund", className: "bg-blue-100 text-blue-700 border-blue-200" },
  refund_cash_wash: { label: "Cash Wash (resolved)", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  refund_phantom: { label: "Phantom (dismissed)", className: "bg-slate-100 text-slate-600 border-slate-200" },
  dispute_matched: { label: "Dispute Matched", className: "bg-teal-100 text-teal-700 border-teal-200" },
  dispute_unmatched: { label: "Dispute Unmatched", className: "bg-amber-100 text-amber-700 border-amber-200" },
};

export function UnifiedTollActivityTable({ driverId }: { driverId?: string }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const fleetTz = useFleetTimezone();
  // Opt-in set: a week is expanded only once its key is added here, so every
  // week starts collapsed by default (an empty set means "nothing expanded").
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());
  const [highlightedEventId, setHighlightedEventId] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  const opts = useMemo(
    () => ({
      from: from.trim() || undefined,
      to: to.trim() || undefined,
      limit: 200,
    }),
    [from, to],
  );

  const { data, meta, loading, error, refresh } = useTollUnifiedEvents(driverId, opts);

  // Every toll event is included here regardless of outcome — perfectly
  // reimbursed tolls that never needed a human to look at them show up with
  // the same "Reconciled" badge as anything else. This is deliberately the
  // "show me everything" view, not a filtered problem list.
  const weekGroups = useMemo(
    () => groupByWeek(data.map((row) => ({ ...row, date: row.occurredAt })), fleetTz),
    [data, fleetTz],
  );

  // Cross-reference lookups so a dispute adjustment can show exactly which
  // toll it was applied to (and a toll can show which dispute(s) point back
  // at it) — both built from the SAME already-loaded page, no extra fetch.
  const eventsById = useMemo(() => {
    const map = new Map<string, TollFinancialEvent>();
    for (const e of data) map.set(e.eventId, e);
    return map;
  }, [data]);

  const disputesByTollId = useMemo(() => {
    const map = new Map<string, TollFinancialEvent[]>();
    for (const e of data) {
      if (!e.matchedTollId) continue;
      const key = `toll:${e.matchedTollId}`;
      const list = map.get(key);
      if (list) list.push(e);
      else map.set(key, [e]);
    }
    return map;
  }, [data]);

  const weekKeyByEventId = useMemo(() => {
    const map = new Map<string, string>();
    for (const week of weekGroups) {
      for (const item of week.items) map.set(item.eventId, week.key);
    }
    return map;
  }, [weekGroups]);

  const toggleWeek = (key: string) => {
    setExpandedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const jumpToEvent = (eventId: string) => {
    const weekKey = weekKeyByEventId.get(eventId);
    if (weekKey) {
      setExpandedWeeks((prev) => {
        if (prev.has(weekKey)) return prev;
        const next = new Set(prev);
        next.add(weekKey);
        return next;
      });
    }
    setHighlightedEventId(eventId);
    // Wait a tick for the (possibly just-expanded) week section to render
    // before scrolling to it.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        rowRefs.current[eventId]?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
    setTimeout(() => setHighlightedEventId((cur) => (cur === eventId ? null : cur)), 2200);
  };

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
        <div className="space-y-3">
          {weekGroups.map((week) => {
            const isOpen = expandedWeeks.has(week.key);
            const weekTotal = week.items.reduce((sum, r) => sum + r.amount, 0);
            return (
              <Collapsible
                key={week.key}
                open={isOpen}
                onOpenChange={() => toggleWeek(week.key)}
                className="rounded-xl border border-slate-200 overflow-hidden"
              >
                <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left bg-slate-50/80 hover:bg-slate-100/80 transition-colors">
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <CalendarRange className="h-4 w-4 text-slate-500 shrink-0" />
                    <span className="font-semibold text-slate-800">{week.label}</span>
                    <span className="text-[10px] uppercase tracking-wide text-slate-500">Mon–Sun</span>
                    <Badge variant="secondary" className="text-[11px]">
                      {week.items.length} event{week.items.length !== 1 ? "s" : ""}
                    </Badge>
                    <span className="text-xs font-medium text-slate-600">{formatMoney(weekTotal)} net</span>
                  </div>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-slate-500 shrink-0 transition-transform duration-200",
                      isOpen ? "rotate-0" : "-rotate-90",
                    )}
                  />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[820px] text-left text-sm">
                      <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-600">
                        <tr>
                          <th className="px-3 py-2">Date</th>
                          <th className="px-3 py-2">Kind</th>
                          <th className="px-3 py-2">Source</th>
                          <th className="px-3 py-2 text-right">Amount</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2">Linked to</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {week.items.map((row) => {
                          const stateMeta = WORKFLOW_STATE_META[row.workflowState] ?? {
                            label: row.workflowState,
                            className: "bg-slate-100 text-slate-600 border-slate-200",
                          };
                          const linkedToll = row.matchedTollId
                            ? eventsById.get(`toll:${row.matchedTollId}`)
                            : undefined;
                          const linkedDisputes = disputesByTollId.get(row.eventId) || [];

                          return (
                            <tr
                              key={row.eventId}
                              ref={(el) => {
                                rowRefs.current[row.eventId] = el;
                              }}
                              className={cn(
                                "transition-colors duration-500",
                                highlightedEventId === row.eventId
                                  ? "bg-indigo-100/70"
                                  : "hover:bg-slate-50/80",
                              )}
                            >
                              <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                                {row.occurredAt.slice(0, 16).replace("T", " ")}
                              </td>
                              <td className="px-3 py-2 text-slate-800">{row.kindLabel}</td>
                              <td className="whitespace-nowrap px-3 py-2 text-slate-600">{row.sourceSystem}</td>
                              <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums text-slate-900">
                                {formatMoney(row.amount)}
                              </td>
                              <td className="px-3 py-2">
                                <span
                                  className={cn(
                                    "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
                                    stateMeta.className,
                                  )}
                                >
                                  {stateMeta.label}
                                </span>
                              </td>
                              <td className="max-w-[280px] px-3 py-2 text-xs">
                                <div className="flex flex-col gap-1">
                                  {/* Dispute → the toll it was applied to */}
                                  {row.matchedTollId && (
                                    linkedToll ? (
                                      <button
                                        type="button"
                                        onClick={() => jumpToEvent(linkedToll.eventId)}
                                        className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 hover:underline text-left"
                                        title="Jump to the toll transaction this was applied to"
                                      >
                                        <ArrowRight className="h-3 w-3 shrink-0" />
                                        <span>
                                          Toll: {linkedToll.occurredAt.slice(0, 10)} · {formatMoney(linkedToll.amount)} ·{" "}
                                          {(WORKFLOW_STATE_META[linkedToll.workflowState] ?? { label: linkedToll.workflowState }).label}
                                        </span>
                                      </button>
                                    ) : (
                                      <span className="text-slate-400">
                                        toll:{row.matchedTollId.slice(0, 8)}… (outside current page)
                                      </span>
                                    )
                                  )}

                                  {/* Toll → any dispute adjustments applied to it */}
                                  {linkedDisputes.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {linkedDisputes.map((d) => (
                                        <button
                                          key={d.eventId}
                                          type="button"
                                          onClick={() => jumpToEvent(d.eventId)}
                                          className="inline-flex items-center gap-1 rounded-md border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-teal-700 hover:bg-teal-100"
                                          title="Jump to this dispute adjustment"
                                        >
                                          <Link2 className="h-3 w-3 shrink-0" />
                                          {formatMoney(d.amount)} adj · {d.occurredAt.slice(0, 10)}
                                        </button>
                                      ))}
                                    </div>
                                  )}

                                  {row.tripId && <span className="text-slate-400">trip:{row.tripId.slice(0, 8)}…</span>}
                                  <span className="text-slate-400">
                                    {row.rawRef.store}:{row.rawRef.id.slice(0, 8)}…
                                  </span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      )}
    </div>
  );
}
