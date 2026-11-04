import {
  conflictDetailSummary,
  conflictDrawerSubtitle,
  conflictKeepImpact,
  conflictManualWinsBanner,
  conflictMergeSamePartImpact,
  conflictRemoveImpact,
  conflictTypeLabel,
} from "@roam/types/partMatchConflictCopy";
import {
  conflictInvolvedGroups,
  conflictNumbersInvolved,
  conflictResolvedFooter,
  conflictVehicleSpecLine,
} from "@roam/types/conflictDrawerExtras";
import type { MatchConflictRow } from "../../../../services/partsAutoMatchApi";

export function ConflictReviewDrawer({
  row,
  note,
  busy,
  onNote,
  onClose,
  onKeep,
  onRemove,
  onMerge,
  canMergeSamePart,
}: {
  row: MatchConflictRow;
  note: string;
  busy: boolean;
  onNote: (v: string) => void;
  onClose: () => void;
  onKeep: () => void;
  onRemove: () => void;
  onMerge?: () => void;
  canMergeSamePart?: boolean;
}) {
  const manual = conflictManualWinsBanner(row);
  const open = String(row.status || "") === "open";
  const typeLabel = conflictTypeLabel(String(row.conflict_type || ""));
  const isOeAmbiguous = String(row.conflict_type || "") === "oe_ambiguous";
  const groups = conflictInvolvedGroups(row);
  const numbers = conflictNumbersInvolved(row);
  const vehicleSpec = conflictVehicleSpecLine(row);
  const resolvedLine = conflictResolvedFooter(row);

  return (
    <div className="auto-match-conflicts-drawer rounded-xl bg-surface-container-lowest p-space-md shadow-md flex flex-col gap-space-md">
      {manual ? (
        <div className="rounded-lg bg-secondary-container p-3 flex items-start gap-2.5">
          <span className="material-symbols-outlined text-[20px] text-primary shrink-0 mt-0.5">lock</span>
          <div>
            <h2 className="font-label-md text-label-md font-bold text-on-secondary-fixed">{manual.title}</h2>
            <p className="font-body-sm text-body-sm text-on-secondary-fixed-variant mt-1 text-xs">{manual.referenceLine}</p>
          </div>
        </div>
      ) : null}
      <div className="flex items-start justify-between pb-space-sm border-b border-outline-variant">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {row.code ? (
              <span className="am-conflict-code-chip font-mono-sm text-mono-sm px-2 py-0.5 rounded bg-primary-fixed text-primary font-bold">{String(row.code)}</span>
            ) : null}
            <span className="font-label-md text-label-md font-semibold text-on-surface">{typeLabel}</span>
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">{conflictDrawerSubtitle(row)}</p>
        </div>
        <button type="button" className="w-7 h-7 rounded-lg hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant" aria-label="Close" onClick={onClose}>
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
      <section className="flex flex-col gap-space-xs">
        <span className="am-conflict-section-label font-label-xs text-label-xs uppercase tracking-wider font-semibold">Car &amp; parts involved</span>
        {row.vehicle_label ? (
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface-container-low hover:bg-surface-container transition-colors">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="material-symbols-outlined text-primary text-[20px] shrink-0">directions_car</span>
              <div className="min-w-0">
                <div className="font-mono-sm text-mono-sm font-bold text-on-surface">{String(row.vehicle_label)}</div>
                {vehicleSpec ? (
                  <div className="font-body-sm text-body-sm text-on-surface-variant text-xs mt-0.5">{vehicleSpec}</div>
                ) : null}
              </div>
            </div>
            {row.vehicle_catalog_id ? (
              <a
                className="p-1 rounded hover:bg-surface-container-high text-on-surface-variant shrink-0"
                title="Inspect vehicle specs"
                href={`/?page=motor-vehicles&vehicle=${encodeURIComponent(String(row.vehicle_catalog_id))}`}
              >
                <span className="material-symbols-outlined text-[18px]">visibility</span>
              </a>
            ) : null}
          </div>
        ) : null}
        {groups.map((g, idx) => (
          <div key={`${g.group_code}-${idx}`} className="flex items-center justify-between p-2.5 rounded-lg bg-surface-container-low hover:bg-surface-container transition-colors">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className={`material-symbols-outlined text-[20px] shrink-0 ${idx === 0 ? "text-primary" : "text-on-surface-variant"}`}>category</span>
              <div className="min-w-0">
                <div className="font-mono-sm text-mono-sm font-semibold text-on-surface">Group {g.group_code}</div>
                <div className="font-body-sm text-body-sm text-on-surface-variant text-xs mt-0.5">{g.subtitle}</div>
              </div>
            </div>
            {g.group_id ? (
              <a
                className="p-1 rounded hover:bg-surface-container-high text-on-surface-variant shrink-0"
                title={`Inspect group ${g.group_code}`}
                href={`/?page=parts-catalog&group=${encodeURIComponent(g.group_id)}`}
              >
                <span className="material-symbols-outlined text-[18px]">visibility</span>
              </a>
            ) : null}
          </div>
        ))}
        <p className="font-body-sm text-body-sm text-on-surface-variant">{conflictDetailSummary(row)}</p>
      </section>
      <section className="flex flex-col gap-1.5">
        <span className="am-conflict-section-label font-label-xs text-label-xs uppercase tracking-wider font-semibold">Numbers involved</span>
        <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg bg-surface-container-high">
          <span className="font-mono-sm text-mono-sm text-on-surface font-semibold">{numbers.label}</span>
          {numbers.source_url && numbers.source_host ? (
            <a
              className="font-mono-sm text-mono-sm text-primary hover:underline flex items-center gap-1 font-medium shrink-0"
              href={numbers.source_url}
              target="_blank"
              rel="noreferrer"
            >
              {numbers.source_host}
              <span className="material-symbols-outlined text-[14px]">north_east</span>
            </a>
          ) : null}
        </div>
      </section>
      {open ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
            <div className="p-3 rounded-lg bg-primary-fixed/40 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 font-label-md text-label-md font-semibold text-primary">
                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                What Keep does
              </div>
              <p className="font-body-sm text-body-sm text-on-surface">{conflictKeepImpact(row)}</p>
            </div>
            <div className="p-3 rounded-lg bg-surface-container-high flex flex-col gap-1">
              <div className="flex items-center gap-1.5 font-label-md text-label-md font-semibold text-on-surface-variant am-conflict-remove-impact-heading">
                <span className="material-symbols-outlined text-[16px]">cancel</span>
                What Remove does
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant">{conflictRemoveImpact(row)}</p>
            </div>
          </div>
          {isOeAmbiguous ? (
            <div className="p-3 rounded-lg bg-surface-container-low border border-outline-variant/40 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 font-label-md text-label-md font-semibold text-on-surface">
                <span className="material-symbols-outlined text-[16px]">merge</span>
                Same part — merge
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant">{conflictMergeSamePartImpact(row)}</p>
              {!canMergeSamePart ? (
                <p className="font-body-sm text-body-sm text-on-surface-variant text-xs">Owner only.</p>
              ) : null}
            </div>
          ) : null}
          <label className="flex flex-col gap-1.5">
            <span className="font-label-xs text-label-xs uppercase tracking-wider text-on-surface font-semibold flex items-center justify-between">
              <span>Note (required)</span>
              <span className="font-mono-sm text-mono-sm text-error font-normal">Mandatory for audit trail</span>
            </span>
            <textarea
              className="auto-match-conflicts-note w-full p-2.5 rounded-lg bg-surface-container-low font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant resize-none"
              rows={2}
              placeholder="Reason for decision (e.g. confirmed caliper geometry on M900A)…"
              value={note}
              onChange={(e) => onNote(e.target.value)}
            />
          </label>
          <div className="flex items-center justify-end gap-space-sm pt-space-xs border-t border-outline-variant flex-wrap">
            <button type="button" className="px-4 py-2 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label-md text-label-md transition-colors disabled:opacity-40" disabled={busy} onClick={onRemove}>
              Remove
            </button>
            {isOeAmbiguous && onMerge ? (
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-secondary-container hover:opacity-95 text-on-secondary-container font-label-md text-label-md font-semibold transition-opacity disabled:opacity-40"
                disabled={busy || !canMergeSamePart}
                title={canMergeSamePart ? undefined : "Owner only"}
                onClick={onMerge}
              >
                Same part — merge
              </button>
            ) : null}
            <button type="button" className="auto-match-conflicts-primary px-5 py-2 rounded-lg bg-primary-container hover:opacity-95 text-on-primary font-label-md text-label-md font-semibold shadow-sm transition-opacity disabled:opacity-40" disabled={busy} onClick={onKeep}>
              Keep
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-space-sm pt-space-xs border-t border-outline-variant">
          {resolvedLine ? (
            <p className="font-body-sm text-body-sm text-on-surface-variant">{resolvedLine}</p>
          ) : null}
          <div className="flex items-center justify-end">
            <button type="button" className="px-5 py-2 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label-md text-label-md font-semibold transition-colors" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
