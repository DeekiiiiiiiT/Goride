import { Check, HelpCircle } from "lucide-react";
import { LS, LT } from "./logServiceStitch";
import { LOG_SERVICE_COPY } from "./logServiceCopy";

/**
 * "Where on the car" chips (Stitch F1 / F2 / F4 / F5 / F10). Pills sized to their text: picked = near-black
 * fill, white text and a check; not picked = white with a visible border. Wraps on a phone.
 */
export function WhereOnCarChips({
  options,
  picked,
  onToggle,
  showHelper,
  testId = "where-on-car",
}: {
  options: { code: string; label: string }[];
  picked: string[];
  onToggle: (code: string) => void;
  /** The helper line shows until a chip is picked. */
  showHelper: boolean;
  testId?: string;
}) {
  return (
    <div className="flex flex-col" data-testid={testId}>
      <span className={`${LT.bodySm} font-medium mb-1.5 ${LS.text}`}>{LOG_SERVICE_COPY.whereOnCar}</span>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={LOG_SERVICE_COPY.whereOnCar}>
        {options.map((o) => {
          const on = picked.includes(o.code);
          return (
            <button
              key={o.code}
              type="button"
              aria-pressed={on}
              data-position={o.code}
              onClick={() => onToggle(o.code)}
              className={`h-9 px-4 rounded-full inline-flex items-center gap-1.5 ${LT.bodySm} font-medium transition-colors ${
                on
                  ? `${LS.btnPrimary} shadow-sm`
                  : `${LS.lowest} ${o.code === "unknown" ? LS.outline : LS.text} border border-[#cbd5e1] dark:border-[#47464c] ${LS.hoverLow}`
              }`}
            >
              {on ? <Check className="h-4 w-4" aria-hidden /> : null}
              {o.label}
            </button>
          );
        })}
      </div>
      {showHelper ? (
        <p className={`flex items-center gap-1.5 mt-2 ${LT.bodySm} ${LS.outline}`}>
          <HelpCircle className="h-4 w-4 shrink-0" aria-hidden />
          <span>{LOG_SERVICE_COPY.whereOnCarHelper}</span>
        </p>
      ) : null}
    </div>
  );
}

/** Save line with the "Pick where on the car first" hint beside it while it waits (Stitch F1). */
export function SaveLineHint({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className={`${LT.bodySm} ${LS.outline}`} data-testid="pick-where-first">
      {LOG_SERVICE_COPY.pickWhereFirst}
    </span>
  );
}
