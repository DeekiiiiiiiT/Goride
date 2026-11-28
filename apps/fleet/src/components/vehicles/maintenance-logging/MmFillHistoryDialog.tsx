/**
 * Step 7 (MER-11, MER-12): Fill in service history, ported from
 * docs/stitch/maintenance-rebuild-fleet/maintenance_fill_in_service_history.
 *
 * One row per part on the car's schedule: last done km, date, and "Check at next service" for a part nobody
 * can date. A part dated by a logged service is shown read-only with "From your service at …". Saving dates
 * each part and recomputes it; a part left undated stays "History unknown".
 */
import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleHelp, Loader2, Wrench, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../services/api";
import { Button } from "../../ui/button";
import { Dialog, DialogContent, DialogTitle } from "../../ui/dialog";
import {
  initialEdit,
  isLoggedService,
  partLabel,
  rowProblem,
  rowState,
  rowsToSave,
  type HistoryEdit,
  type HistoryPartRow,
} from "./fillHistoryModel";

const LAYER = "z-[60]";

type Loaded = Awaited<ReturnType<typeof api.getMaintenanceHistory>>;

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function MmFillHistoryDialog({
  open,
  onOpenChange,
  vehicleId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleId: string;
  onSaved?: () => void;
}) {
  const [data, setData] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [edits, setEdits] = useState<Record<string, HistoryEdit>>({});
  const [saving, setSaving] = useState(false);
  const today = todayIso();

  useEffect(() => {
    if (!open || !vehicleId) return;
    let live = true;
    setLoading(true);
    setLoadError("");
    api
      .getMaintenanceHistory(vehicleId)
      .then((res) => {
        if (!live) return;
        setData(res);
        const next: Record<string, HistoryEdit> = {};
        for (const p of res.parts) next[p.schedule_id] = initialEdit(p as HistoryPartRow);
        setEdits(next);
      })
      .catch((e: unknown) => live && setLoadError(e instanceof Error ? e.message : "Could not load the history."))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [open, vehicleId]);

  const parts = (data?.parts ?? []) as HistoryPartRow[];
  const odometer = data?.vehicle.odometer ?? null;
  const toSave = useMemo(() => rowsToSave(parts, edits), [parts, edits]);
  const problems = useMemo(() => {
    const out: Record<string, string> = {};
    for (const p of parts) {
      if (isLoggedService(p)) continue;
      const e = edits[p.schedule_id];
      const problem = e ? rowProblem(e, odometer, today) : null;
      if (problem) out[p.schedule_id] = problem;
    }
    return out;
  }, [parts, edits, odometer, today]);
  const hasProblem = Object.keys(problems).length > 0;

  const setEdit = (id: string, patch: Partial<HistoryEdit>) =>
    setEdits((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { km: "", date: "", check: false }), ...patch } }));

  const save = async () => {
    if (!toSave.length || hasProblem) return;
    setSaving(true);
    try {
      const res = await api.saveMaintenanceHistory(vehicleId, toSave);
      const bits = [
        res.filled ? `${res.filled} part${res.filled === 1 ? "" : "s"} dated` : "",
        res.ticked ? `${res.ticked} to check at the next service` : "",
      ].filter(Boolean);
      toast.success(bits.length ? `Saved: ${bits.join(", ")}.` : "Saved.");
      onSaved?.();
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not save the history.");
    } finally {
      setSaving(false);
    }
  };

  const v = data?.vehicle;
  const carName = [v?.make, v?.model, v?.year].filter(Boolean).join(" ");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`${LAYER} max-w-[calc(100%-2rem)] sm:max-w-[960px] p-0 gap-0 overflow-hidden rounded-2xl`}
        overlayClassName={LAYER}
        hideCloseButton
        data-testid="mm-fill-history-dialog"
      >
        <div className="flex items-start justify-between gap-4 px-8 pt-7 pb-4">
          <div className="min-w-0">
            <DialogTitle className="text-[24px] font-semibold leading-8 text-[#0b1c30]">Fill in service history</DialogTitle>
            {v ? (
              <p className="mt-1 flex flex-wrap items-center gap-2 text-[15px] text-[#47464c]">
                <span>{carName || "This car"}</span>
                {v.licensePlate ? (
                  <span className="rounded-md bg-[#dde9ff] px-2 py-0.5 font-mono text-[13px] font-semibold text-[#0b1c30]">
                    {v.licensePlate}
                  </span>
                ) : null}
                {odometer != null ? <span>· now at {odometer.toLocaleString("en-US")} km</span> : null}
              </p>
            ) : null}
            <p className="mt-2 text-[15px] text-[#0b1c30]">
              Type the last km and date each part was done. Not sure? Tick Check at next service.
            </p>
          </div>
          <button
            type="button"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#e6eeff] text-[#0b1c30] hover:bg-[#dde9ff]"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-8 pb-4">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : loadError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{loadError}</div>
          ) : !parts.length ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-[15px] text-slate-700">
              This car has no scheduled parts yet.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {parts.map((p) => {
                const e = edits[p.schedule_id] ?? initialEdit(p);
                const logged = isLoggedService(p);
                const state = rowState(p, e);
                const problem = problems[p.schedule_id];
                return (
                  <li key={p.schedule_id} className="py-4" data-testid="mm-history-row">
                    <div className="grid grid-cols-[48px_minmax(140px,1fr)_160px_160px_auto_auto] items-center gap-3">
                      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#e6eeff] text-[#0b1c30]">
                        <Wrench className="h-5 w-5" />
                      </span>
                      <span className="text-[17px] font-medium text-[#0b1c30]">{partLabel(p)}</span>
                      <label className="flex h-11 items-center gap-2 rounded-lg bg-[#eff4ff] px-3">
                        <input
                          type="text"
                          inputMode="numeric"
                          className="w-full min-w-0 bg-transparent text-[15px] tabular-nums text-[#0b1c30] outline-none placeholder:text-[#78767d] disabled:text-[#47464c]"
                          placeholder="Last done km"
                          aria-label={`${partLabel(p)} last done km`}
                          value={e.km}
                          disabled={logged || saving}
                          onChange={(ev) => setEdit(p.schedule_id, { km: ev.target.value })}
                        />
                        <span className="text-[11px] font-semibold text-[#47464c]">KM</span>
                      </label>
                      <input
                        type="date"
                        className="h-11 rounded-lg bg-[#eff4ff] px-3 text-[15px] text-[#0b1c30] outline-none disabled:text-[#47464c]"
                        aria-label={`${partLabel(p)} last done date`}
                        max={today}
                        value={e.date}
                        disabled={logged || saving}
                        onChange={(ev) => setEdit(p.schedule_id, { date: ev.target.value })}
                      />
                      <label className={`flex min-h-[44px] items-center gap-2 text-[15px] text-[#0b1c30] ${logged ? "opacity-40" : ""}`}>
                        <input
                          type="checkbox"
                          className="h-5 w-5 accent-black"
                          checked={!logged && e.check && state !== "dated"}
                          disabled={logged || saving || state === "dated"}
                          onChange={(ev) => setEdit(p.schedule_id, { check: ev.target.checked })}
                        />
                        Check at next service
                      </label>
                      <span className="flex w-[140px] justify-end">
                        {state === "dated" ? (
                          <CheckCircle2 className="h-6 w-6 text-emerald-600" aria-label="Dated" />
                        ) : (
                          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-violet-50 px-2.5 py-1 text-[12px] font-medium text-violet-800">
                            <CircleHelp className="h-4 w-4" />
                            History unknown
                          </span>
                        )}
                      </span>
                    </div>
                    {logged ? (
                      <p className="mt-2 flex items-center gap-1.5 pl-[60px] text-[13px] text-[#47464c]">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        {p.from_service_vendor ? (
                          <>
                            From your service at <span className="font-semibold text-[#0b1c30]">{p.from_service_vendor}</span>
                          </>
                        ) : (
                          "From your service records"
                        )}
                      </p>
                    ) : null}
                    {problem ? <p className="mt-2 pl-[60px] text-[13px] text-red-700">{problem}</p> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-[#f8f9ff] px-8 py-4">
          <p className="text-[13px] text-[#47464c]">
            {data ? `${data.unknownCount} of ${parts.length} parts have no known history.` : ""}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="h-11 min-w-[96px]" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="button"
              className="h-11 min-w-[120px] bg-black text-white hover:bg-black/90"
              disabled={saving || !toSave.length || hasProblem}
              onClick={save}
              data-testid="mm-history-save"
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save history
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
