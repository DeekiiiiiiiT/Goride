/**
 * LC-15 "Done": the car's other pending jobs, so work done on the same visit is one service (one date, mileage and
 * bill). Ticking one adds its job card; each job closes its own Not done yet line when the service is saved.
 */
import React from "react";
import type { FoundWorkItem } from "../../../../types/maintenance";
import { LS, LT } from "./logServiceStitch";

export const ALSO_DONE_COPY = {
  title: "Also done on this visit?",
  helper: "Tick other waiting jobs the garage did at the same time. They're saved as one service.",
  sameJob: "Already in this service",
  quote: (amount: number) => `Quote J$ ${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`,
} as const;

export function AlsoDoneOnVisit({
  items,
  tickedLineIds,
  blockedJobIds,
  placesText,
  onToggle,
}: {
  items: FoundWorkItem[];
  tickedLineIds: Set<string>;
  /** Jobs already in this service another way: can't be ticked twice. */
  blockedJobIds: Set<string>;
  placesText: (item: FoundWorkItem) => string;
  onToggle: (item: FoundWorkItem) => void;
}) {
  if (!items.length) return null;
  return (
    <section className={`rounded-xl p-4 flex flex-col gap-2.5 ${LS.low}`} data-testid="also-done-on-visit">
      <div>
        <h4 className={`${LT.titleSm} font-bold ${LS.text}`}>{ALSO_DONE_COPY.title}</h4>
        <p className={`${LT.bodySm} ${LS.muted}`}>{ALSO_DONE_COPY.helper}</p>
      </div>
      <ul className="flex flex-col gap-1.5">
        {items.map((item) => {
          const on = tickedLineIds.has(item.lineId);
          const blocked = !on && blockedJobIds.has(item.jobId);
          const places = placesText(item);
          return (
            <li key={item.lineId}>
              <label
                className={`flex items-center gap-3 rounded-lg px-3 py-2 ${LS.lowest} ${blocked ? "opacity-60" : "cursor-pointer"}`}
                data-testid="also-done-row"
              >
                <input
                  type="checkbox"
                  checked={on}
                  disabled={blocked}
                  onChange={() => onToggle(item)}
                  className="h-4 w-4 accent-black"
                  aria-label={item.jobName}
                />
                <span className="flex flex-col min-w-0 flex-1">
                  <span className={`${LT.titleSm} ${LS.text}`}>{[item.jobName, places].filter(Boolean).join(" · ")}</span>
                  <span className={`${LT.bodySm} ${LS.muted}`}>
                    {blocked
                      ? ALSO_DONE_COPY.sameJob
                      : [item.quoteAmount ? ALSO_DONE_COPY.quote(item.quoteAmount) : null, item.note].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
