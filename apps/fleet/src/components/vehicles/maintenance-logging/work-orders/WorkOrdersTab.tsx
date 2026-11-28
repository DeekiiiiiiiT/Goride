/**
 * Maintenance step 11 (MER-15): the Work orders tab and the one-work-order panel, ported from
 * docs/stitch/maintenance-rebuild-fleet/maintenance_work_orders and maintenance_work_order_panel with the Round 2
 * drops (no "vehicles off operational duty", intake slots, month ranges, "Dispatch triage", estimates or file
 * sizes). Tiles: AT THE GARAGE / WAITING TO GO IN / DONE THIS MONTH (a count of work orders, not money).
 *
 * Not in this step: "New work order", "+ Add a job" and the panel's Do-not-drive switch (step 12).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../../services/api";
import type { WorkOrderBoardCard } from "../../../../types/maintenance";
import { Button } from "../../../ui/button";
import { Sheet, SheetContent } from "../../../ui/sheet";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../../../ui/dialog";
import {
  boardActions,
  boardSections,
  carName,
  money,
  reasonProblem,
  whenLine,
  type Board,
  type BoardFilter,
} from "./workOrderBoardModel";

const STAGE_CHIP: Record<WorkOrderBoardCard["stage"], string> = {
  decision: "bg-violet-50 text-violet-800",
  waiting: "bg-[#eff6ff] text-[#1d4ed8]",
  garage: "bg-amber-50 text-amber-900",
  saving: "bg-slate-100 text-slate-700",
  done: "bg-emerald-50 text-emerald-800",
  cancelled: "bg-slate-100 text-slate-600",
};

function StageChip({ w }: { w: WorkOrderBoardCard }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${STAGE_CHIP[w.stage]}`}>
      {w.stageLabel}
    </span>
  );
}

function Plate({ plate }: { plate: string | null }) {
  return <span className="rounded-md bg-[#e6eeff] px-2 py-0.5 font-mono text-[13px] font-semibold text-[#0b1c30]">{plate ?? "—"}</span>;
}

type ReasonAsk = { card: WorkOrderBoardCard; kind: "cancel" | "decline" } | null;

export function WorkOrdersTab({
  onMarkDone,
  onViewService,
  openWorkOrderId,
  onOpenedWorkOrder,
  canEdit = true,
}: {
  /** Opens Log service on the work order's driver request; saving it finishes the work order. */
  onMarkDone: (card: WorkOrderBoardCard) => void;
  onViewService: (card: WorkOrderBoardCard) => void;
  /** A request card's "Open work order": the tab opens that work order's panel. */
  openWorkOrderId?: string | null;
  onOpenedWorkOrder?: () => void;
  canEdit?: boolean;
}) {
  const [board, setBoard] = useState<Board & { tiles?: { atGarage: number; waiting: number; doneThisMonth: number; needsDecision: number } } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<BoardFilter>("open");
  const [q, setQ] = useState("");
  const [panelId, setPanelId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [ask, setAsk] = useState<ReasonAsk>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setBoard(await api.getWorkOrderBoard());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load work orders.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!openWorkOrderId) return;
    setPanelId(openWorkOrderId);
    onOpenedWorkOrder?.();
  }, [openWorkOrderId, onOpenedWorkOrder]);

  const all = useMemo(() => (board ? [...board.open, ...board.done, ...board.cancelled] : []), [board]);
  const panel = panelId ? all.find((w) => w.id === panelId) ?? null : null;
  const sections = board ? boardSections(board, filter, q) : { open: [], done: [], cancelled: [] };

  const run = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(id);
    try {
      await fn();
      toast.success(ok);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "That didn't work. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const approve = (w: WorkOrderBoardCard) =>
    run(w.id, () => api.triageMaintenanceWorkOrder(w.id, { action: "approve" }), "Approved — waiting to go in");
  const takeIn = (w: WorkOrderBoardCard) =>
    run(w.id, () => api.moveWorkOrder(w.id, { status: "in_shop" }), "Marked as at the garage");
  const submitReason = async () => {
    if (!ask || reasonProblem(reason)) return;
    const { card, kind } = ask;
    await run(
      card.id,
      () =>
        kind === "decline"
          ? api.triageMaintenanceWorkOrder(card.id, { action: "decline", reason: reason.trim() })
          : api.moveWorkOrder(card.id, { status: "cancelled", cancelReason: reason.trim() }),
      kind === "decline" ? "Request declined" : "Work order cancelled",
    );
    setAsk(null);
    setReason("");
    setPanelId(null);
  };

  const actionButtons = (w: WorkOrderBoardCard, inPanel = false) => {
    const a = boardActions(w);
    if (!canEdit) {
      return a.viewService ? (
        <Button type="button" variant="outline" className="h-11" onClick={() => onViewService(w)}>View service</Button>
      ) : null;
    }
    const isBusy = busy === w.id;
    return (
      <div className={`flex flex-wrap gap-2 ${inPanel ? "justify-end" : ""}`}>
        {!inPanel && !a.viewService ? (
          <Button type="button" variant="outline" className="h-11 bg-white" onClick={() => setPanelId(w.id)}>Open</Button>
        ) : null}
        {a.decline ? (
          <Button type="button" variant="outline" className="h-11 border-red-200 text-red-700 hover:bg-red-50" disabled={isBusy} onClick={() => setAsk({ card: w, kind: "decline" })}>
            Decline
          </Button>
        ) : null}
        {a.cancel ? (
          <Button type="button" variant="outline" className="h-11 border-red-200 text-red-700 hover:bg-red-50" disabled={isBusy} onClick={() => setAsk({ card: w, kind: "cancel" })}>
            Cancel work order
          </Button>
        ) : null}
        {a.takeIn ? (
          <Button type="button" variant="outline" className="h-11 bg-white" disabled={isBusy} onClick={() => void takeIn(w)}>
            It's at the garage
          </Button>
        ) : null}
        {a.approve ? (
          <Button type="button" className="h-11 bg-black text-white hover:bg-black/90" disabled={isBusy} onClick={() => void approve(w)}>
            {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Approve
          </Button>
        ) : null}
        {a.markDone ? (
          <Button type="button" className="h-11 bg-black text-white hover:bg-black/90" disabled={isBusy} onClick={() => { setPanelId(null); onMarkDone(w); }}>
            Mark done and log service
          </Button>
        ) : null}
        {a.viewService ? (
          <Button type="button" variant="outline" className="h-11 bg-white" onClick={() => onViewService(w)}>View service</Button>
        ) : null}
      </div>
    );
  };

  if (loading && !board) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-stitch-secondary" />
      </div>
    );
  }
  if (error && !board) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {error}{" "}
        <Button type="button" variant="outline" size="sm" className="ml-2" onClick={() => void load()}>Try again</Button>
      </div>
    );
  }

  const tiles = board?.tiles ?? { atGarage: 0, waiting: 0, doneThisMonth: 0, needsDecision: 0 };

  return (
    <div className="space-y-5" data-testid="work-orders-tab">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: "AT THE GARAGE", n: tiles.atGarage, cls: "bg-amber-50 text-amber-900" },
          { label: "WAITING TO GO IN", n: tiles.waiting, cls: "bg-[#eff6ff] text-[#1d4ed8]" },
          { label: "DONE THIS MONTH", n: tiles.doneThisMonth, cls: "bg-emerald-50 text-emerald-800" },
        ].map((t) => (
          <div key={t.label} className={`rounded-xl p-4 ${t.cls}`}>
            <p className="text-[11px] font-semibold tracking-wider">{t.label}</p>
            <p className="mt-1 font-mono text-[28px] font-bold leading-none">{t.n}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-xl bg-surface-container-lowest p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {(["open", "done", "cancelled", "all"] as BoardFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={`min-h-[40px] rounded-full px-4 text-[14px] font-medium ${
                filter === f ? "bg-black text-white" : "border border-slate-300 bg-white text-slate-800"
              }`}
            >
              {f === "open" ? `Open${board?.open.length ? ` · ${board.open.length}` : ""}` : f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <label className="flex h-11 items-center gap-2 rounded-lg bg-[#eff4ff] px-3 sm:w-[340px]">
          <Search className="h-4 w-4 text-slate-500" />
          <input
            className="w-full bg-transparent text-[14px] outline-none"
            placeholder="Search plate, garage or job…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
      </div>

      {filter === "open" || filter === "all" ? (
        <section>
          <h3 className="mb-2 text-[12px] font-semibold tracking-wider text-slate-600">OPEN · {sections.open.length}</h3>
          {sections.open.length ? (
            <ul className="space-y-3">
              {sections.open.map((w) => (
                <li key={w.id} className="rounded-xl bg-surface-container-lowest p-4 shadow-sm" data-testid="wo-card">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Plate plate={w.plate} />
                        <span className="text-[17px] font-semibold">{carName(w)}</span>
                        <StageChip w={w} />
                      </div>
                      <p className="text-[14px] text-slate-700">
                        {w.garage ? <span className="font-medium text-slate-900">{w.garage} · </span> : null}
                        <span className={w.stage === "garage" ? "text-amber-900" : ""}>{whenLine(w)}</span>
                      </p>
                      {w.jobs.length ? (
                        <div className="flex flex-wrap gap-1.5">
                          {w.jobs.map((j) => (
                            <span key={j} className="rounded-full bg-[#eff4ff] px-3 py-1 text-[13px]">{j}</span>
                          ))}
                        </div>
                      ) : null}
                      {w.request?.text ? (
                        <p className="rounded-lg bg-[#eff4ff] px-3 py-2 text-[13px] text-slate-700">
                          From the driver's request: <span className="italic">"{w.request.text}"</span>
                        </p>
                      ) : null}
                    </div>
                    <div className="shrink-0">{actionButtons(w)}</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-[14px] text-slate-600">
              No open work orders. A driver's request shows here once it's sent.
            </p>
          )}
        </section>
      ) : null}

      {(filter === "done" || filter === "all") && (
        <section>
          <h3 className="mb-2 text-[12px] font-semibold tracking-wider text-slate-600">DONE RECENTLY</h3>
          {sections.done.length ? (
            <ul className="divide-y divide-slate-100 rounded-xl bg-surface-container-lowest shadow-sm">
              {sections.done.map((w) => (
                <li key={w.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-wrap items-center gap-2 text-[14px]">
                    <Plate plate={w.plate} />
                    <span className="font-semibold">{carName(w)}</span>
                    {w.garage ? <span className="text-slate-700">{w.garage}</span> : null}
                    <span className="text-slate-600">· {whenLine(w)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {money(w.total) ? <span className="font-mono text-[15px] font-semibold">{money(w.total)}</span> : null}
                    <StageChip w={w} />
                    {actionButtons(w)}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-slate-600">Nothing done yet.</p>
          )}
        </section>
      )}

      {(filter === "cancelled" || filter === "all") && (
        <section>
          <h3 className="mb-2 text-[12px] font-semibold tracking-wider text-slate-600">CANCELLED</h3>
          {sections.cancelled.length ? (
            <ul className="divide-y divide-slate-100 rounded-xl bg-surface-container-lowest shadow-sm">
              {sections.cancelled.map((w) => (
                <li key={w.id} className="flex flex-wrap items-center gap-2 p-4 text-[14px]">
                  <Plate plate={w.plate} />
                  <span className="font-semibold">{carName(w)}</span>
                  <span className="text-slate-600">· {whenLine(w)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-slate-600">Nothing cancelled.</p>
          )}
        </section>
      )}

      <Sheet open={!!panel} onOpenChange={(o) => !o && setPanelId(null)}>
        <SheetContent side="right" hideCloseButton className="flex w-full flex-col overflow-hidden p-0 sm:max-w-[600px]" data-testid="wo-panel">
          {panel ? (
            <>
              <div className="flex items-start justify-between border-b px-6 py-5">
                <div>
                  <p className="text-[12px] font-semibold tracking-wider text-slate-600">WORK ORDER</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Plate plate={panel.plate} />
                    <span className="text-[20px] font-semibold">{carName(panel)}</span>
                    <StageChip w={panel} />
                  </div>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => setPanelId(null)} aria-label="Close">
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
                <section className="rounded-2xl bg-[#eff4ff] p-5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[17px] font-semibold">Where and when</h4>
                    {panel.priority ? (
                      <span className="rounded-full border border-amber-300 px-2.5 py-0.5 text-[12px] font-medium text-amber-900">{panel.priority}</span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-[15px] font-medium">{panel.garage ?? "Garage not chosen yet"}</p>
                  <p className="mt-1 text-[14px] text-slate-700">{whenLine(panel)}</p>
                </section>
                {panel.request ? (
                  <section className="rounded-2xl border border-slate-200 p-5">
                    <h4 className="text-[17px] font-semibold">Came from</h4>
                    <div className="mt-3 rounded-xl bg-[#eff4ff] p-4">
                      <p className="text-[13px] text-slate-600">
                        Driver request{panel.request.type ? ` · ${panel.request.type}` : ""}
                        {panel.request.priority ? ` · Priority: ${panel.request.priority}` : ""}
                      </p>
                      {panel.request.text ? <p className="mt-2 text-[15px] italic">"{panel.request.text}"</p> : null}
                      {panel.request.photoUrl ? (
                        <img src={panel.request.photoUrl} alt="Photo from the driver" className="mt-3 h-24 w-24 rounded-lg object-cover" />
                      ) : null}
                    </div>
                  </section>
                ) : null}
                <section className="rounded-2xl border border-slate-200 p-5">
                  <h4 className="text-[17px] font-semibold">Jobs</h4>
                  {panel.jobs.length ? (
                    <ul className="mt-3 space-y-2">
                      {panel.jobs.map((j) => (
                        <li key={j} className="flex items-center gap-3 rounded-xl bg-white">
                          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#e6eeff]">
                            <span className="material-symbols-outlined text-[18px]">build</span>
                          </span>
                          <span className="flex-1 text-[15px]">{j}</span>
                          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[12px] text-slate-700">
                            {panel.stage === "done" ? "Done" : "Not done yet"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-[14px] text-slate-600">
                      No jobs listed yet. They are added when the service is logged.
                    </p>
                  )}
                </section>
              </div>
              <div className="border-t bg-slate-50 px-6 py-4">{actionButtons(panel, true)}</div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={!!ask} onOpenChange={(o) => { if (!o) { setAsk(null); setReason(""); } }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{ask?.kind === "decline" ? "Decline this request?" : "Cancel this work order?"}</DialogTitle>
          </DialogHeader>
          <label className="block">
            <span className="text-[14px] font-medium">Why?</span>
            <textarea
              className="mt-1 min-h-[88px] w-full rounded-lg border border-slate-300 p-3 text-[15px]"
              placeholder={ask?.kind === "decline" ? "For example: checked it, nothing wrong" : "For example: the driver fixed it"}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {reason && reasonProblem(reason) ? <p className="text-[13px] text-red-700">{reasonProblem(reason)}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" onClick={() => { setAsk(null); setReason(""); }}>Keep it</Button>
            <Button
              type="button"
              className="h-11 bg-red-600 text-white hover:bg-red-700"
              disabled={!!reasonProblem(reason) || busy === ask?.card.id}
              onClick={() => void submitReason()}
            >
              {ask?.kind === "decline" ? "Decline" : "Cancel work order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
