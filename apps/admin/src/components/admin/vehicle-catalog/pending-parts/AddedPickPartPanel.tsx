/**
 * Slice C (docs/log-service-parts-gaps-audit.md LC-09): "Added — pick the part" in the Pending parts drawer.
 * Lists the parts now on file for this car model + job + place; the picked one answers every open ask in the group
 * and each company that asked gets a "Part on file" message. Dominion colours are exact hex (dark mode renames names).
 */
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  fetchPendingPartsCandidates,
  resolvePendingPartsGroupAdded,
  type PendingPartsCandidate,
} from "../../../../services/pendingPartsCatalogService";

const FIT_TEXT: Record<PendingPartsCandidate["fitLabel"], string> = {
  made_for_car: "Made for this car",
  also_fits: "Also fits",
  fits_by_size: "Fits by size",
  check_before_buying: "Needs checking",
};
const FIT_CLS: Record<PendingPartsCandidate["fitLabel"], string> = {
  made_for_car: "bg-[#ecfdf5] text-[#047857] dark:bg-[#064e3b] dark:text-[#34d399]",
  also_fits: "bg-[#eff6ff] text-[#1d4ed8] dark:bg-[#172554] dark:text-[#93c5fd]",
  fits_by_size: "bg-[#eff6ff] text-[#1d4ed8] dark:bg-[#172554] dark:text-[#93c5fd]",
  check_before_buying: "bg-[#fffbeb] text-[#b45309] dark:bg-[#451a03] dark:text-[#fbbf24]",
};

type Load = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ok"; items: PendingPartsCandidate[] };

export function AddedPickPartPanel({
  accessToken,
  groupId,
  onDone,
  onCancel,
}: {
  accessToken: string;
  groupId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    setLoad({ kind: "loading" });
    setPicked(null);
    fetchPendingPartsCandidates(accessToken, groupId)
      .then((items) => live && setLoad({ kind: "ok", items }))
      .catch((e) => live && setLoad({ kind: "error", message: e instanceof Error ? e.message : "Could not load parts" }));
    return () => {
      live = false;
    };
  }, [accessToken, groupId, tick]);

  const confirm = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      const res = await resolvePendingPartsGroupAdded(accessToken, groupId, picked);
      toast.success(
        res.companies === 1
          ? "Added. 1 company was told the part is on file."
          : `Added. ${res.companies} companies were told the part is on file.`,
      );
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const btnSoft =
    "h-10 rounded-xl border border-[#c9c5cd] dark:border-[#47464c] bg-white dark:bg-[#15161d] text-[13px] font-semibold text-[#1a1b22] dark:text-[#e4e1ec] hover:bg-[#f4f2fd] dark:hover:bg-[#23242e]";

  return (
    <div className="space-y-3 rounded-xl bg-[#f4f2fd] dark:bg-[#1c1d26] p-3" data-testid="added-pick-part">
      <div>
        <p className="text-[14px] font-semibold text-[#1a1b22] dark:text-[#e4e1ec]">Which part did you add?</p>
        <p className="text-[12px] text-[#47464c] dark:text-[#c9c5cd]">
          Parts on file for this car and place. Add it in Add a part first if it isn&apos;t here.
        </p>
      </div>
      {load.kind === "loading" ? (
        <p className="text-[13px] text-[#47464c] dark:text-[#c9c5cd]">Loading parts…</p>
      ) : load.kind === "error" ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] text-[#ba1a1a] dark:text-[#ffb4ab]">{load.message}</p>
          <button type="button" className={`${btnSoft} px-3 h-8`} onClick={() => setTick((t) => t + 1)}>
            Try again
          </button>
        </div>
      ) : load.items.length === 0 ? (
        <div className="flex items-center justify-between gap-2" data-testid="added-pick-part-empty">
          <p className="text-[13px] text-[#47464c] dark:text-[#c9c5cd]">No part on file for this car and place yet.</p>
          <button type="button" className={`${btnSoft} px-3 h-8 shrink-0`} onClick={() => setTick((t) => t + 1)}>
            Check again
          </button>
        </div>
      ) : (
        <ul className="space-y-2" role="radiogroup" aria-label="Parts on file">
          {load.items.map((p) => {
            const on = picked === p.partId;
            return (
              <li key={p.partId}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  data-testid="added-pick-part-row"
                  data-part-id={p.partId}
                  onClick={() => setPicked(p.partId)}
                  className={`w-full text-left rounded-lg p-3 flex items-center justify-between gap-3 bg-white dark:bg-[#15161d] transition-shadow ${
                    on ? "ring-2 ring-[#1b192e] dark:ring-[#e4e1ec]" : "ring-1 ring-[#e3e1ec] dark:ring-[#32333e] hover:shadow-sm"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold text-[#1a1b22] dark:text-[#e4e1ec] truncate">{p.name}</span>
                    <span className="block text-[12px] text-[#47464c] dark:text-[#c9c5cd] truncate">
                      {[p.brand, p.number].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${FIT_CLS[p.fitLabel] ?? FIT_CLS.also_fits}`}>
                    {FIT_TEXT[p.fitLabel] ?? FIT_TEXT.also_fits}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="grid grid-cols-12 gap-2">
        <button type="button" disabled={busy} className={`col-span-4 ${btnSoft}`} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || !picked}
          data-testid="added-pick-part-confirm"
          onClick={() => void confirm()}
          className="col-span-8 h-10 rounded-xl bg-[#1b192e] text-white dark:bg-[#e4e1ec] dark:text-[#1b192e] text-[13px] font-semibold disabled:opacity-50"
        >
          {busy ? "Saving…" : "Use this part"}
        </button>
      </div>
    </div>
  );
}
