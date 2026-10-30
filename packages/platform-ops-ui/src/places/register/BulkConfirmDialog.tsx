// Stitch: dominion-redesign/f7e577c72a6746ca8de0ef18cbc7c527
import { useState } from "react";
import type { Taxonomy } from "../placesApi";

const TITLES: Record<string, string> = {
  set_brand: "Set brand",
  pin_confirmed: "Confirm pins",
  "add-facility": "Add facility",
  "remove-facility": "Remove facility",
  type: "Set type",
  verify: "Verify",
  duplicate_of: "Mark duplicate",
};

export function BulkConfirmDialog({
  action,
  count,
  taxonomy,
  onClose,
  onApply,
}: {
  action: string;
  count: number;
  taxonomy: Taxonomy | null;
  onClose: () => void;
  onApply: (reason: string, extra: Record<string, string>) => void;
}) {
  const [reason, setReason] = useState("");
  const [extra, setExtra] = useState("");
  const title = `${TITLES[action] || "Update"} on ${count} places`;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-surface-container-lowest p-5 shadow-xl" role="dialog" aria-labelledby="bulk-title">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id="bulk-title" className="text-lg font-headline font-bold text-on-surface">{title}</h2>
          <button type="button" className="text-on-surface-variant" onClick={onClose} aria-label="Close">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        {action === "set_brand" ? (
          <label className="mb-3 block text-xs text-on-surface-variant">
            Select brand *
            <select className="mt-1 w-full rounded-lg bg-surface-container-low px-3 py-2 text-xs text-on-surface" value={extra} onChange={(event) => setExtra(event.target.value)}>
              <option value="">Choose a brand</option>
              {(taxonomy?.brands || []).map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
            </select>
          </label>
        ) : null}
        {action === "duplicate_of" ? (
          <label className="mb-3 block text-xs text-on-surface-variant">
            Keep this place id
            <input className="mt-1 w-full rounded-lg bg-surface-container-low px-3 py-2 text-xs text-on-surface" value={extra} onChange={(event) => setExtra(event.target.value)} />
          </label>
        ) : null}
        {action === "type" || action === "add-facility" || action === "remove-facility" ? (
          <label className="mb-3 block text-xs text-on-surface-variant">
            {action === "type" ? "Type" : "Facility"}
            <select className="mt-1 w-full rounded-lg bg-surface-container-low px-3 py-2 text-xs text-on-surface" value={extra} onChange={(event) => setExtra(event.target.value)}>
              <option value="">Choose</option>
              {(action === "type" ? taxonomy?.placeTypes || [] : taxonomy?.facilityTypes || []).map((row) => (
                <option key={row.slug} value={row.slug}>{"label" in row ? row.label : row.slug}</option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="block text-xs text-on-surface-variant">
          Audit reason *
          <textarea className="mt-1 w-full rounded-xl bg-surface-container-low p-3 text-xs text-on-surface outline-none" rows={2} value={reason} placeholder="State reason for batch reassignment (e.g., Parish audit verification, dealer contract renewed)..." onChange={(event) => setReason(event.target.value)} />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="rounded-lg px-3 py-2 text-xs text-on-surface-variant" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="rounded-lg bg-secondary px-3 py-2 text-xs font-semibold text-on-secondary disabled:opacity-40"
            disabled={!reason.trim() || ((action === "set_brand" || action === "type" || action === "add-facility" || action === "remove-facility" || action === "duplicate_of") && !extra)}
            onClick={() => onApply(reason.trim(), action === "set_brand" ? { brandId: extra } : action === "type" ? { placeType: extra } : action === "duplicate_of" ? { duplicateOf: extra } : { facility: extra })}
          >
            Apply to {count} places
          </button>
        </div>
      </div>
    </div>
  );
}
