import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../services/api";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "../../ui/responsive-dialog";
import type { MaintenanceLogLine, MaintenanceWorkOrder } from "../../../types/maintenance";
import { formatMaintenanceServiceDateLabel } from "../../../utils/maintenanceDisplayFormat";

type ApiLine = MaintenanceLogLine & { lineTotal?: number; voidedAt?: string | null };

export function formatServiceMoney(currency: string | null | undefined, amount: unknown): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  const cur = currency?.trim() || "JMD";
  return `${cur === "JMD" ? "J$" : cur} ${n.toLocaleString()}`;
}

/** Loads one saved service (all its jobs). The API returns { item }. */
function useWorkOrder(workOrderId: string | null) {
  const [wo, setWo] = useState<MaintenanceWorkOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!workOrderId) {
      setWo(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getWorkOrder(workOrderId)
      .then((res) => {
        if (cancelled) return;
        const item = (res as unknown as { item?: MaintenanceWorkOrder }).item ?? res;
        setWo(item);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load this service");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workOrderId]);
  return { wo, loading, error };
}

/** Read-only view of the service a row belongs to (date, mileage, provider, every job still on it). */
export function ServiceHistoryViewDialog({
  workOrderId,
  vehicleLabel,
  onClose,
}: {
  workOrderId: string | null;
  vehicleLabel: string;
  onClose: () => void;
}) {
  const { wo, loading, error } = useWorkOrder(workOrderId);
  const lines = ((wo?.lines || []) as ApiLine[]).filter((l) => !l.recommended && !l.voidedAt);
  const total = lines.reduce((s, l) => s + (Number(l.lineTotal) || 0), 0);

  return (
    <ResponsiveDialog open={Boolean(workOrderId)} onOpenChange={(o) => !o && onClose()}>
      <ResponsiveDialogContent className="sm:max-w-lg">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Service details</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>{vehicleLabel}</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-stitch-secondary" />
          </div>
        ) : error ? (
          <p className="text-sm text-error py-4">{error}</p>
        ) : wo ? (
          <div className="space-y-4 text-sm">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-stitch-secondary font-semibold">Date</dt>
                <dd className="font-medium">
                  {formatMaintenanceServiceDateLabel(String(wo.performedAtDate ?? "").slice(0, 10) || null, false)}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-stitch-secondary font-semibold">Odometer</dt>
                <dd className="font-mono">{wo.odometer != null ? `${Number(wo.odometer).toLocaleString()} km` : "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-stitch-secondary font-semibold">Provider</dt>
                <dd>{wo.provider || "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-stitch-secondary font-semibold">Log number</dt>
                <dd className="font-mono">{(wo as { logNumber?: string }).logNumber || "—"}</dd>
              </div>
            </dl>

            <div>
              <p className="text-[11px] uppercase tracking-wider text-stitch-secondary font-semibold mb-2">
                Jobs done on this visit ({lines.length})
              </p>
              <ul className="divide-y divide-surface-container rounded-lg border border-outline-variant/40">
                {lines.map((l, i) => (
                  <li key={l.id ?? i} className="flex items-start justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="font-medium">{l.categoryName || "—"}</p>
                      <p className="text-xs text-stitch-secondary">
                        {[l.systemName, l.positions?.length ? l.positions.join(" ") : null, l.brand, l.partNumber]
                          .filter(Boolean)
                          .join(" · ") || " "}
                      </p>
                    </div>
                    <span className="font-mono font-semibold whitespace-nowrap">
                      {l.complimentary ? "Free" : formatServiceMoney(wo.currency, l.lineTotal)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex justify-between items-center rounded-lg bg-surface-container-low px-3 py-2">
              <span className="text-stitch-secondary">Total</span>
              <span className="font-mono font-semibold">{formatServiceMoney(wo.currency, total)}</span>
            </div>

            {wo.notes ? (
              <div>
                <p className="text-[11px] uppercase tracking-wider text-stitch-secondary font-semibold mb-1">Notes</p>
                <p className="whitespace-pre-wrap">{wo.notes}</p>
              </div>
            ) : null}

            {wo.invoiceUrl ? (
              <Button asChild variant="outline" size="sm">
                <a href={wo.invoiceUrl} target="_blank" rel="noreferrer">
                  Open invoice
                </a>
              </Button>
            ) : null}
          </div>
        ) : null}

        <ResponsiveDialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

const DELETE_REASONS = ["Duplicate entry", "Entered by mistake", "Other"] as const;

export type DeleteJobTarget = {
  lineId: string;
  jobName: string;
  /** e.g. "J$ 3,000" */
  costLabel: string;
  /** e.g. "22 Aug 2026 · Toyota Roomy 5179KZ" */
  summary: string;
};

/** Deletes ONLY the job (row) the user clicked. Other jobs on the same visit stay. */
export function ServiceHistoryDeleteDialog({
  target,
  onClose,
  onDeleted,
}: {
  target: DeleteJobTarget | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [reason, setReason] = useState<(typeof DELETE_REASONS)[number]>("Duplicate entry");
  const [otherText, setOtherText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (target) {
      setReason("Duplicate entry");
      setOtherText("");
    }
  }, [target]);

  const finalReason = reason === "Other" ? otherText.trim() : reason;

  const doDelete = async () => {
    if (!target || !finalReason) return;
    setBusy(true);
    try {
      const res = await api.voidWorkOrderLine(target.lineId, finalReason);
      if (res.ledgerWarning) toast.warning(res.ledgerWarning);
      else toast.success(`${target.jobName} deleted`);
      onDeleted();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to delete job");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ResponsiveDialog open={Boolean(target)} onOpenChange={(o) => !o && !busy && onClose()}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Delete {target?.jobName ?? "this job"}?</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>{target?.summary}</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="space-y-4 text-sm">
          <p>
            Only <strong>{target?.jobName}</strong> ({target?.costLabel}) is deleted. Anything else done on the same
            visit stays. Its cost is taken out of your books and due dates are worked out again. A record of the
            deletion is kept.
          </p>

          <div className="space-y-2">
            <Label>Why?</Label>
            <div className="flex flex-wrap gap-2">
              {DELETE_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={reason === r}
                  onClick={() => setReason(r)}
                  className={`px-3 py-1.5 rounded-lg border-2 text-sm font-semibold transition-colors ${
                    reason === r
                      ? "border-primary bg-primary text-on-primary"
                      : "border-outline-variant/40 bg-surface-container-lowest text-on-surface hover:border-primary/40"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            {reason === "Other" ? (
              <Input
                autoFocus
                placeholder="Type the reason"
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
              />
            ) : null}
          </div>
        </div>

        <ResponsiveDialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Keep it
          </Button>
          <Button
            type="button"
            className="bg-error text-on-error hover:bg-error/90"
            disabled={busy || !finalReason}
            onClick={() => void doDelete()}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Delete {target?.jobName ?? "job"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
