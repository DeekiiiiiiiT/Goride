/**
 * "Not finished saving" cards on Service history — Stitch service-items-fleet screens 5 and 6.
 * A log that saved but didn't finish has no service record yet, so history doesn't list it; these
 * cards come from the in-progress work orders the server marks notFinished (plan section 3).
 */
import React, { useCallback, useEffect, useState } from "react";
import { api } from "../../../services/api";
import { finishFailureText } from "../../../services/maintenanceSaveError";
import type { MaintenanceLogLine, MaintenanceWorkOrder } from "../../../types/maintenance";
import { formatMaintenanceServiceDateLabel } from "../../../utils/maintenanceDisplayFormat";
import { sumMaintenanceLogLines } from "../../../types/maintenance";
import { money } from "./log-service/itemsUsed";
import {
  CompletedPill,
  FinishSavingButton,
  NotFinishedNote,
  NotFinishedPill,
  type FinishState,
} from "./ServiceSaveStates";
import { itemsUsedText } from "./serviceHistoryItems";

type Card = { wo: MaintenanceWorkOrder; state: FinishState };

function activeLines(wo: MaintenanceWorkOrder): MaintenanceLogLine[] {
  return (wo.lines ?? []).filter((l) => !l.recommended && !l.voidedAt);
}

export function NotFinishedServices({
  vehicleId,
  vehicleName,
  onFinished,
  onView,
}: {
  /** null = all cars. */
  vehicleId: string | null;
  vehicleName: (vehicleId: string) => string;
  onFinished: () => void;
  onView: (workOrderId: string, label: string) => void;
}) {
  const [cards, setCards] = useState<Card[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await api.listMaintenanceWorkOrders({ vehicleId: vehicleId ?? undefined, status: "in_progress" });
      const stuck = res.items.filter((w) => w.notFinished === true);
      const full = await Promise.all(
        stuck.map((w) => api.getWorkOrder(w.id).then((x) => ((x as { item?: MaintenanceWorkOrder }).item ?? x)).catch(() => w)),
      );
      setCards(full.map((wo) => ({ wo, state: { kind: "idle" } })));
    } catch {
      // History still works without these cards; nothing to show.
      setCards([]);
    }
  }, [vehicleId]);

  useEffect(() => {
    void load();
  }, [load]);

  const setState = (id: string, state: FinishState) =>
    setCards((prev) => prev.map((c) => (c.wo.id === id ? { ...c, state } : c)));

  const finish = async (wo: MaintenanceWorkOrder) => {
    setState(wo.id, { kind: "busy" });
    try {
      await api.completeWorkOrder(wo.id);
      setState(wo.id, { kind: "done" });
      onFinished();
    } catch (err) {
      const e = err as { isStillFinishing?: boolean };
      setState(wo.id, e?.isStillFinishing ? { kind: "still" } : { kind: "failed", why: finishFailureText(err) });
    }
  };

  if (!cards.length) return null;

  return (
    <div className="flex flex-col gap-3 p-4 pt-0" data-testid="not-finished-services">
      {cards.map(({ wo, state }) => {
        const lines = activeLines(wo);
        const lineTotal = (l: MaintenanceLogLine) => (typeof l.lineTotal === "number" ? l.lineTotal : sumMaintenanceLogLines([l]));
        const total = Math.round(lines.reduce((s, l) => s + lineTotal(l), 0) * 100) / 100;
        const done = state.kind === "done";
        const label = [
          formatMaintenanceServiceDateLabel(String(wo.performedAtDate ?? "").slice(0, 10) || null, false),
          vehicleName(wo.vehicleId),
        ].join(" · ");
        return (
          <div
            key={wo.id}
            data-testid="not-finished-card"
            className={`relative rounded-xl bg-surface-container-lowest shadow-sm overflow-hidden ${
              done ? "" : "border-l-4"
            }`}
            style={done ? undefined : { borderLeftColor: "#fd651e", backgroundImage: "linear-gradient(90deg,#fff4ef 0%,transparent 60%)" }}
          >
            <div className="p-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <span
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={done ? { backgroundColor: "#85f8c44d", color: "#069669" } : { backgroundColor: "#ffdbce", color: "#a73a00" }}
                  >
                    <span className="material-symbols-outlined text-[20px]">{done ? "check_circle" : "pending_actions"}</span>
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-lg font-semibold text-on-surface">{wo.provider?.trim() || "Service"}</span>
                      {done ? <CompletedPill /> : <NotFinishedPill />}
                    </div>
                    <p className="text-sm text-on-surface-variant">
                      {[
                        formatMaintenanceServiceDateLabel(String(wo.performedAtDate ?? "").slice(0, 10) || null, false),
                        wo.odometer != null ? `${Number(wo.odometer).toLocaleString()} km` : null,
                        vehicleName(wo.vehicleId),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: done ? undefined : "#a73a00" }}>
                      {done ? "Service total" : "Subtotal logged"}
                    </p>
                    <p className="text-2xl font-bold text-on-surface tabular-nums">{money(wo.currency, total)}</p>
                  </div>
                  <FinishSavingButton state={state} onFinish={() => void finish(wo)} onView={() => onView(wo.id, label)} />
                </div>
              </div>
              <div className="rounded-lg bg-surface-container-low p-3 flex flex-col gap-2">
                {lines.map((l, i) => {
                  const used = itemsUsedText(l.items, wo.currency);
                  return (
                    <div key={l.id ?? i} className="flex flex-col gap-1">
                      <div className="flex justify-between gap-3 text-sm">
                        <span className="flex items-center gap-2 font-medium text-on-surface">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: done ? "#069669" : "#fd651e" }} />
                          {l.categoryName}
                        </span>
                        <span className="font-semibold tabular-nums">
                          {money(wo.currency, lineTotal(l))}
                        </span>
                      </div>
                      {used ? (
                        <p className="ml-4 text-xs text-on-surface-variant">
                          <span className="font-semibold text-on-surface">Items used:</span> {used}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
                {done ? null : <NotFinishedNote />}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
