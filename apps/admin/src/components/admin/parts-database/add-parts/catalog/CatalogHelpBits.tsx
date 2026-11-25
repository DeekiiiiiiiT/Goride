import { useState } from "react";
import { PartsButton } from "../../PartsButton";
import { MaterialIcon } from "../../import/MaterialIcon";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../../../ui/alert-dialog";

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

/** "Where to find the part number" — the four steps from the redesign plan (§4 Step 3, F-11). */
export const PART_NUMBER_GUIDE_STEPS = [
  "Open the diagram or parts list on the catalogue page.",
  "Find the part on the picture — or in the list beside it.",
  "Copy the number exactly: letters and digits, like 89467-B1040.",
  "Front and rear are different parts. Add both, one row each.",
] as const;

export const PART_NUMBER_GUIDE_PASTE_LINE =
  "Paste the numbers here and we will ask which is which on each row.";

export function PartNumberGuideBody() {
  return (
    <div className="flex flex-col gap-3">
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {PART_NUMBER_GUIDE_STEPS.map((step, i) => (
          <li
            key={step}
            className="flex items-start gap-2 rounded-xl bg-surface-container-lowest px-3 py-2 text-[14px] text-[#30323b] dark:bg-[#111a2e] dark:text-[#e2e8f0]"
          >
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#dbe1ff] text-[12px] font-semibold text-[#0153dc]">
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <p className="text-[13px] text-[#5d5f68] dark:text-[#94a3b8]">{PART_NUMBER_GUIDE_PASTE_LINE}</p>
    </div>
  );
}

/** The guide as an in-place dialog (Step 1's "How to find the part number"). */
export function PartNumberGuideDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <AlertDialogContent className="max-w-[640px]">
        <AlertDialogHeader>
          <AlertDialogTitle>Where to find the part number</AlertDialogTitle>
          <AlertDialogDescription>
            The catalogue page shows it beside the part on the picture.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <PartNumberGuideBody />
        <AlertDialogFooter>
          <PartsButton variant="secondary" onClick={onClose}>
            Close
          </PartsButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** The guide as a panel inside the parts step (open by default the first time). */
export function PartNumberGuidePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <section
      className="rounded-xl bg-[#f3f4fb] p-4 dark:bg-[#0b1220]"
      aria-label="Where to find the part number"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[16px] font-semibold text-[#30323b] dark:text-[#e2e8f0]">
          <MaterialIcon name="menu_book" className="text-[20px] text-[#0153dc]" />
          Where to find the part number
        </p>
        <PartsButton variant="secondary" className="!h-9" onClick={onClose}>
          Close
        </PartsButton>
      </div>
      <PartNumberGuideBody />
    </section>
  );
}
