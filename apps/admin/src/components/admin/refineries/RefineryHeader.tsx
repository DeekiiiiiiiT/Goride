import { useEffect, useRef, useState } from "react";
import type { RefineryCard } from "./refineriesApi";
import { formatWeek } from "./refineryFormat";

export function RefineryHeader({
  refinery,
  canWrite,
  onSync,
  onEnterPrices,
}: {
  refinery: RefineryCard;
  canWrite: boolean;
  onSync: (mode: "latest" | "year" | "month" | "all", extra?: { year?: number; month?: number }) => void;
  onEnterPrices: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [confirmArchive, setConfirmArchive] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const manual = refinery.source_kind === "manual";
  const source = manual
    ? "Entered by hand"
    : `Source: petrojam.com/price · automatic, weekly on Thursdays · Next expected ${formatWeek(refinery.next_expected)}`;

  useEffect(() => {
    const close = () => setOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  return (
    <div className="bg-surface-container-lowest border border-surface-variant/80 rounded-xl px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
      <div className="flex flex-col">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-on-surface">{refinery.name}</span>
          {refinery.is_benchmark ? <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-secondary-container text-on-secondary-container">Benchmark</span> : null}
        </div>
        <p className="font-mono-code text-[11px] text-outline mt-0.5">{source}</p>
      </div>
      <div className="flex items-center gap-3">
        {refinery.freshness ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-100 text-emerald-800 font-medium text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-700" /> {refinery.freshness}
          </span>
        ) : null}
        {canWrite && manual ? (
          <button type="button" onClick={onEnterPrices} className="bg-secondary hover:bg-secondary-dim text-white px-3.5 py-1.5 rounded-lg text-xs font-medium">+ Enter week's prices</button>
        ) : null}
        {canWrite && !manual ? (
          <div className="relative inline-flex shadow-xs rounded-lg" ref={menu} onClick={(event) => event.stopPropagation()}>
            <button type="button" className="bg-secondary hover:bg-secondary-dim text-white px-3.5 py-1.5 rounded-l-lg text-xs font-medium" onClick={() => onSync("latest")}>Sync now</button>
            <button type="button" className="border-l border-white/20 bg-secondary hover:bg-secondary-dim text-white px-2 py-1.5 rounded-r-lg text-xs" aria-label="expand_more" onClick={() => setOpen((value) => !value)}>
              <span className="material-symbols-outlined text-sm leading-none">expand_more</span>
            </button>
            {open ? (
              <div className="absolute right-0 top-full mt-1.5 w-56 bg-surface-container-lowest rounded-lg shadow-lg border border-surface-variant p-1 z-20 font-mono-code text-xs">
                <div className="px-3 py-1.5 flex items-center gap-2">
                  <span>Sync a year…</span>
                  <input className="w-16 bg-surface rounded px-1" aria-label="Year" value={year} onChange={(event) => setYear(event.target.value)} />
                  <button type="button" className="text-secondary" onClick={() => { onSync("year", { year: Number(year) }); setOpen(false); }}>Go</button>
                </div>
                <div className="px-3 py-1.5 flex items-center gap-2">
                  <span>Sync a month…</span>
                  <input className="w-10 bg-surface rounded px-1" aria-label="Month" value={month} onChange={(event) => setMonth(event.target.value)} />
                  <button type="button" className="text-secondary" onClick={() => { onSync("month", { year: Number(year), month: Number(month) }); setOpen(false); }}>Go</button>
                </div>
                <div className="my-1 border-t border-surface-variant" />
                <button type="button" className="block w-full text-left px-3 py-1.5 rounded text-on-surface hover:bg-surface-container" onClick={() => setConfirmArchive(true)}>Sync full archive…</button>
                {confirmArchive ? (
                  <div className="px-3 py-2 text-[11px] text-on-surface">
                    This reads the whole Petrojam archive. Continue?
                    <div className="mt-1 flex gap-2">
                      <button type="button" className="text-secondary" onClick={() => { onSync("all"); setOpen(false); }}>Continue</button>
                      <button type="button" onClick={() => setConfirmArchive(false)}>Cancel</button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
