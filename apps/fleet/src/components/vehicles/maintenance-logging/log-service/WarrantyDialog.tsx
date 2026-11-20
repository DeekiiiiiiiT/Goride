/** LC-22: "How long is the warranty?" — opens when Warranty is ticked (in-app overlay, never a browser pop-up). */
import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../../../ui/dialog";
import { LS, LT } from "./logServiceStitch";
import { shortUntil, WARRANTY_CHOICES, warrantyLength, warrantyUntil, type Warranty } from "./warrantyPeriod";

export const WARRANTY_COPY = {
  title: "Warranty",
  body: (part: string) => `How long is the warranty on the ${part}?`,
  other: "Other",
  months: "Months",
  years: "Years",
  until: (date: string) => `Covered until ${date}`,
  cancel: "Cancel",
  save: "Save",
} as const;

const C = WARRANTY_COPY;

function Sym({ name, size, className = "" }: { name: string; size: number; className?: string }) {
  return (
    <span className={`material-symbols-outlined ${className}`} style={{ fontSize: size }} aria-hidden>
      {name}
    </span>
  );
}

export function WarrantyDialog({
  open,
  partName,
  serviceDate,
  initial,
  onCancel,
  onSave,
}: {
  open: boolean;
  /** "battery" */
  partName: string;
  /** The service date (YYYY-MM-DD): the warranty runs from it. */
  serviceDate: string | null;
  initial: Warranty | null;
  onCancel: () => void;
  onSave: (w: Warranty) => void;
}) {
  const [months, setMonths] = useState<number | null>(null);
  const [other, setOther] = useState(false);
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<"months" | "years">("months");

  useEffect(() => {
    if (!open) return;
    const m = initial?.months ?? null;
    const isChoice = m != null && (WARRANTY_CHOICES as readonly number[]).includes(m);
    setMonths(isChoice ? m : null);
    setOther(m != null && !isChoice);
    setAmount(m != null && !isChoice ? String(m) : "");
    setUnit("months");
  }, [open, initial]);

  const otherMonths = (() => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return null;
    const total = unit === "years" ? n * 12 : n;
    return total >= 1 && total <= 240 && Number.isInteger(total) ? total : null;
  })();
  const chosen = other ? otherMonths : months;
  const until = chosen ? warrantyUntil(serviceDate, chosen) : null;

  const chip = (active: boolean) =>
    `h-10 px-3.5 rounded-lg ${LT.labelMd} font-semibold border transition-colors ${
      active
        ? "bg-black text-white border-black dark:bg-white dark:text-black dark:border-white"
        : `${LS.lowest} ${LS.text} border-[#e2e8f0] dark:border-[#32333e] ${LS.hoverLow}`
    }`;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent hideCloseButton className="sm:max-w-[440px] rounded-xl p-6 gap-4" data-testid="warranty-dialog">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#e2dfff] dark:bg-[#3323cc]/40 flex items-center justify-center text-[#4b41e1] dark:text-[#c3c0ff]">
              <Sym name="verified_user" size={18} />
            </div>
            <DialogTitle className={`${LT.headlineMd} ${LS.text}`}>{C.title}</DialogTitle>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onCancel}
            className={`w-8 h-8 -mr-1 -mt-1 rounded-full flex items-center justify-center ${LS.muted} ${LS.hoverMid}`}
          >
            <Sym name="close" size={20} />
          </button>
        </div>
        <DialogDescription className={`${LT.bodyMd} ${LS.muted}`}>{C.body(partName)}</DialogDescription>

        <div className="flex flex-wrap gap-2" role="radiogroup">
          {WARRANTY_CHOICES.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={!other && months === m}
              data-testid={`warranty-choice-${m}`}
              onClick={() => {
                setOther(false);
                setMonths(m);
              }}
              className={chip(!other && months === m)}
            >
              {warrantyLength(m)}
            </button>
          ))}
          <button
            type="button"
            role="radio"
            aria-checked={other}
            data-testid="warranty-choice-other"
            onClick={() => setOther(true)}
            className={chip(other)}
          >
            {C.other}
          </button>
        </div>

        {other ? (
          <div className="flex items-center gap-2">
            <input
              inputMode="numeric"
              aria-label="Warranty length"
              data-testid="warranty-other-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
              className={`w-24 h-10 px-3 rounded-lg border border-[#e2e8f0] dark:border-[#32333e] ${LS.lowest} ${LS.text} ${LT.bodyMd} focus:outline-none focus:ring-2 focus:ring-[#4b41e1]`}
              autoFocus
            />
            <div className={`inline-flex rounded-lg p-0.5 ${LS.high}`}>
              {(["months", "years"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={`h-9 px-3 rounded-md ${LT.labelMd} font-semibold ${unit === u ? `${LS.lowest} ${LS.text} shadow-sm` : LS.muted}`}
                >
                  {u === "months" ? C.months : C.years}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {until ? (
          <p className={`flex items-center gap-1.5 ${LT.bodyMd} ${LS.text}`} data-testid="warranty-until">
            <Sym name="event_available" size={18} className="text-[#059669] dark:text-[#34d399]" />
            {C.until(shortUntil(until))}
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className={`h-10 px-4 rounded-lg ${LT.labelMd} border border-[#e2e8f0] dark:border-[#32333e] ${LS.lowest} ${LS.text} ${LS.hoverLow} shadow-sm`}
          >
            {C.cancel}
          </button>
          <button
            type="button"
            disabled={!chosen}
            data-testid="warranty-save"
            onClick={() => chosen && onSave({ months: chosen, until })}
            className={`h-10 px-5 rounded-lg ${LT.labelMd} font-semibold bg-black text-white dark:bg-white dark:text-black disabled:opacity-40`}
          >
            {C.save}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
