import { useState } from "react";
import { PartsButton } from "../../PartsButton";

export const WHERE_ON_CAR_HELP =
  "Front / Rear — which axle. Left / Right — which side, looking from the driver's seat. No.1 / No.2 — the number the catalogue gives parts that come in a set, like handbrake cables.";

export function WhereOnCarHelpPopover() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <PartsButton
        type="button"
        variant="secondary"
        className="!h-7 !w-7 !p-0 !min-w-0"
        aria-label="What does this mean?"
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </PartsButton>
      {open ? (
        <div
          role="dialog"
          className="absolute z-20 left-0 top-full mt-1 w-[min(320px,90vw)] rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-3 shadow-lg text-body-sm text-on-surface"
        >
          {WHERE_ON_CAR_HELP}
          <PartsButton variant="secondary" className="mt-2 !h-8" onClick={() => setOpen(false)}>
            Close
          </PartsButton>
        </div>
      ) : null}
    </div>
  );
}
