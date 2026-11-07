import { useMemo } from "react";
import { BrakesTrustChip } from "./BrakesTrustChip";
import { copyTextToClipboard } from "./findPartsActions";

type BrandNumber = { partId: string; brand: string; number: string; trust: string };
type AlsoFitRow = {
  variantId: string;
  make: string;
  model: string;
  chassis: string;
  engine: string;
  years: string;
  trust: string;
  trustReason: string | null;
  isYourCar: boolean;
};

export function BrakesPartDetailSheet({
  typeName,
  lookup,
  trustFilter,
  onTrustFilter,
  onClose,
  onBack,
  onUseInService,
  canUseInService,
  vehicleLabel,
}: {
  typeName: string;
  lookup: {
    reference?: { brand: string; number: string; name: string; trust: string; position?: string };
    brandNumbers?: BrandNumber[];
    alsoFits?: AlsoFitRow[];
    sources?: Array<{ label: string; url: string }>;
  };
  trustFilter: "all" | "confirmed" | "needs";
  onTrustFilter: (f: "all" | "confirmed" | "needs") => void;
  onClose: () => void;
  onBack: () => void;
  onUseInService?: () => void;
  canUseInService?: boolean;
  vehicleLabel: string;
}) {
  const fits = lookup.alsoFits || [];
  const nAll = fits.length;
  const nConf = fits.filter((f) => f.trust === "Confirmed").length;
  const nNeed = fits.filter((f) => f.trust === "Needs checking").length;

  const filteredFits = useMemo(() => {
    if (trustFilter === "confirmed") return fits.filter((f) => f.trust === "Confirmed");
    if (trustFilter === "needs") return fits.filter((f) => f.trust === "Needs checking");
    return fits;
  }, [fits, trustFilter]);

  const fitsByMaker = useMemo(() => {
    const map = new Map<string, AlsoFitRow[]>();
    for (const row of filteredFits) {
      const key = row.make || "Other";
      const list = map.get(key) || [];
      list.push(row);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredFits]);

  const ref = lookup.reference;
  const refLine = [ref?.brand, ref?.number].filter(Boolean).join(" ");
  const axle = ref?.position ? ref.position : "Front";
  const brandNumbers = lookup.brandNumbers || [];
  const yourCarRow = fits.find((f) => f.isYourCar);
  const showEmptyNote = nAll > 0 && filteredFits.length === 0;

  return (
    <div className="brakes-part-detail-overlay fixed inset-0 z-[60] flex justify-end bg-inverse-surface/30">
      <aside
        className="brakes-part-detail-sheet flex h-full w-full max-w-[520px] flex-col bg-surface-container-lowest shadow-2xl overflow-y-auto"
        role="dialog"
        aria-modal="true"
      >
        <header className="px-space-lg py-space-md border-b border-outline-variant/20 flex items-center justify-between gap-space-md sticky top-0 bg-surface-container-lowest z-10">
          <div className="flex items-center gap-space-sm min-w-0">
            <button
              type="button"
              aria-label="Back"
              className="w-8 h-8 rounded-lg flex items-center justify-center bg-surface-container-low hover:bg-surface-container"
              onClick={onBack}
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            </button>
            <div className="flex items-center gap-1 font-caption text-caption text-secondary truncate min-w-0">
              <span>Brakes</span>
              <span className="material-symbols-outlined text-[12px]">chevron_right</span>
              <span className="truncate">{typeName}</span>
              <span className="material-symbols-outlined text-[12px]">chevron_right</span>
              <span className="font-label-code text-on-surface font-semibold truncate">{refLine}</span>
            </div>
          </div>
          <button type="button" aria-label="Close" className="w-8 h-8 rounded-lg hover:bg-surface-container flex items-center justify-center" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>

        <div className="p-space-lg md:p-space-xl flex flex-col gap-space-xl">
          <div className="flex flex-col gap-space-sm">
            <div className="flex flex-wrap items-center gap-2">
              {ref?.trust ? <BrakesTrustChip trust={ref.trust} /> : null}
              <span className="px-2.5 py-0.5 rounded-full bg-surface-container font-caption text-caption text-on-surface-variant capitalize">
                {axle} axle
              </span>
            </div>
            <h2 className="font-headline-lg text-headline-lg font-bold text-on-surface">{ref?.name || typeName}</h2>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-label-plate text-headline-sm text-on-surface tracking-wider">{refLine}</span>
              <button
                type="button"
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-outline-variant bg-surface-container-low hover:bg-surface-container font-label-code text-caption"
                onClick={() => { void copyTextToClipboard(ref?.number || refLine); }}
              >
                <span className="material-symbols-outlined text-[14px]">content_copy</span>
                Copy
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-space-xs">
            <span className="font-caption text-caption font-semibold text-secondary uppercase tracking-wider">Current selected vehicle</span>
            <div className="rounded-lg bg-surface-container-low p-space-md flex items-center justify-between gap-2">
              <span className="font-body-md text-[15px] font-semibold text-on-surface">{vehicleLabel}</span>
              {yourCarRow ? (
                <span className="font-caption text-caption px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">Your car</span>
              ) : null}
            </div>
          </div>

          {brandNumbers.length > 0 ? (
            <div className="flex flex-col gap-space-sm">
              <h3 className="font-headline-sm font-semibold text-on-surface">Same part, other brands</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
                {brandNumbers.map((cell) => (
                  <div key={cell.partId} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-surface-container-low">
                    <div className="min-w-0">
                      <span className="font-caption text-on-surface-variant block">{cell.brand}</span>
                      <span className="font-label-code text-body-md text-on-surface">{cell.number}</span>
                    </div>
                    <button
                      type="button"
                      className="w-8 h-8 rounded hover:bg-surface-container-high flex items-center justify-center"
                      aria-label="Copy number"
                      onClick={() => { void copyTextToClipboard(cell.number); }}
                    >
                      <span className="material-symbols-outlined text-[16px]">content_copy</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-space-md">
            <h3 className="font-headline-sm font-semibold text-on-surface">Also fits</h3>
            <p className="font-body-sm text-body-md text-on-surface-variant">
              Other cars this exact part is listed for, grouped by maker.
            </p>
            <div className="flex flex-wrap gap-2">
              {([
                ["all", "All", nAll],
                ["confirmed", "Confirmed", nConf],
                ["needs", "Needs checking", nNeed],
              ] as const).map(([key, label, count]) => (
                <button
                  key={key}
                  type="button"
                  className={`rounded-full px-3 py-1 font-caption font-semibold ${trustFilter === key ? "bg-primary text-on-primary" : "bg-surface-container text-on-surface-variant border border-outline-variant/30"}`}
                  onClick={() => onTrustFilter(key)}
                >
                  {label} ({count})
                </button>
              ))}
            </div>
            {fitsByMaker.map(([maker, rows]) => (
              <div key={maker} className="flex flex-col gap-space-xs">
                <div className="flex items-center gap-2">
                  <h4 className="font-body-md text-[15px] font-semibold text-on-surface">{maker}</h4>
                  <span className="font-label-code text-caption px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant">{rows.length}</span>
                </div>
                {rows.map((row) => (
                  <div key={`${row.variantId}-${row.model}`} className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-outline-variant/20">
                    <div className="min-w-0">
                      <span className="font-body-md text-[15px] font-semibold text-on-surface block">{row.model}</span>
                      <p className="font-label-code text-body-md text-on-surface-variant">
                        {[row.chassis, row.years, row.engine].filter(Boolean).join(" · ")}
                      </p>
                      {row.trust === "Needs checking" && row.trustReason ? (
                        <p className="font-label-code text-caption text-amber-800 dark:text-amber-200 mt-0.5">{row.trustReason}</p>
                      ) : null}
                    </div>
                    <BrakesTrustChip trust={row.trust} />
                  </div>
                ))}
              </div>
            ))}
            {nAll === 0 || showEmptyNote ? (
              <div className="flex items-center gap-space-sm p-space-md bg-surface-container-low rounded-lg text-on-surface-variant">
                <span className="w-2 h-2 rounded-full bg-outline shrink-0" />
                <p className="font-body-sm m-0">No other cars found yet.</p>
              </div>
            ) : null}
          </div>

          {lookup.sources?.length ? (
            <div className="flex flex-col gap-space-sm">
              <h3 className="font-headline-sm font-semibold text-on-surface">Where this comes from</h3>
              {lookup.sources.map((s) => (
                <div key={s.url} className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-body-md text-body-md text-on-surface">{s.label || "Catalogue"}</span>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-3 h-9 rounded-lg border border-outline-variant bg-transparent text-on-surface font-body-sm font-medium hover:bg-surface-container-high"
                  >
                    Open source
                    <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                  </a>
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-space-sm pt-space-md border-t border-outline-variant/20">
            <button type="button" className="rounded-lg border border-outline-variant px-space-md py-2 font-body-sm font-semibold" onClick={onBack}>
              Back to Brakes
            </button>
            <button
              type="button"
              className="rounded-lg border border-outline-variant px-space-md py-2 font-body-sm font-semibold disabled:opacity-40"
              disabled={!canUseInService}
              onClick={() => onUseInService?.()}
            >
              Use in a service log
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
