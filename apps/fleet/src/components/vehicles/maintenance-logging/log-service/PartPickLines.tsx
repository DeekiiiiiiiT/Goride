/** LC-21: "Part: Interstate NS60L · Added by you" + the grey "Not what Toyota lists (…)" line (review + history). */
import React from "react";
import { LS, LT } from "./logServiceStitch";
import { partPickLabel, type PartPick } from "./partPick";

export function PartPickLines({ pick, className = "" }: { pick: PartPick; className?: string }) {
  return (
    <div className={`flex flex-col gap-0.5 ${className}`} data-testid="part-pick-lines">
      <p className={`${LT.bodySm} ${LS.muted}`}>
        Part: <span className={`font-semibold ${LS.text}`} data-testid="part-pick-label">{partPickLabel(pick)}</span>
      </p>
      {pick.notListedFor ? (
        <p className={`flex items-center gap-1 ${LT.bodySm} ${LS.outline}`} data-testid="part-pick-not-listed">
          <span className="material-symbols-outlined text-[14px]" aria-hidden>
            info
          </span>
          {pick.notListedFor}
        </p>
      ) : null}
    </div>
  );
}
