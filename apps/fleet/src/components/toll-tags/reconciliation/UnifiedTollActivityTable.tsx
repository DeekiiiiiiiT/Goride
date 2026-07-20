import React, { useMemo, useRef, useState } from "react";
import { Loader2, ArrowRight, Link2 } from "lucide-react";
import { cn } from "../../ui/utils";
import { useTollUnifiedEvents } from "../../../hooks/useTollUnifiedEvents";
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

export function UnifiedTollActivityTable({
  driverId,
  initialFrom,
  initialTo,
}: {
  driverId?: string;
  /** Seeds the date-range pickers on first mount (e.g. to the selected
   *  reconciliation period) — the user can still broaden/narrow from here,
   *  this only sets the default. */
  initialFrom?: string;
  initialTo?: string;
}) {
  const [from, setFrom] = useState(initialFrom || "");
  const [to, setTo] = useState(initialTo || "");
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

  const { data, meta, loading, error } = useTollUnifiedEvents(driverId, opts);

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

  const jumpToEvent = (eventId: string) => {
    setHighlightedEventId(eventId);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        rowRefs.current[eventId]?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
    setTimeout(() => setHighlightedEventId((cur) => (cur === eventId ? null : cur)), 2200);
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
        <div className="overflow-x-auto rounded-xl border border-slate-200">
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
              {data.map((row) => {
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
      )}
    </div>
  );
}
