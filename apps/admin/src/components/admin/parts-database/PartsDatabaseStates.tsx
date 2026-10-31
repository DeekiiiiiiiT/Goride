// Stitch: find_parts_loading_error_switched_off · dominion-redesign state cards
import { useState } from "react";
import { PART_MATCH_TIERS } from "../../../../../../packages/types/src/partsResolution";

function Shimmer({ className }: { className: string }) {
  return <div className={`bg-gradient-to-r from-surface-container via-surface-container-high to-surface-container animate-pulse rounded ${className}`} />;
}

function SkeletonCard() {
  return (
    <div className="bg-surface-container-low p-space-md rounded-xl space-y-space-md">
      <div className="flex items-center justify-between">
        <Shimmer className="h-3 w-20" />
        <Shimmer className="h-5 w-16 rounded-full" />
      </div>
      <Shimmer className="h-5 w-3/4" />
      <div className="space-y-1.5 pt-1">
        <Shimmer className="h-3 w-full" />
        <Shimmer className="h-3 w-5/6" />
      </div>
      <div className="pt-2 flex justify-between items-center">
        <Shimmer className="h-4 w-16" />
        <Shimmer className="h-7 w-20 rounded-xl" />
      </div>
    </div>
  );
}

export function PartsLoading({ hint }: { hint?: string }) {
  return (
    <section className="parts-database-stitch bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col" aria-busy="true">
      <div className="bg-surface-container-low px-space-lg py-space-md flex flex-wrap items-center justify-between gap-space-sm">
        <div className="flex items-center gap-space-sm">
          <span className="w-2.5 h-2.5 rounded-full bg-primary-container animate-pulse" />
          <span className="font-mono-md text-mono-md font-semibold text-primary uppercase tracking-wide">Loading parts</span>
          <span className="text-secondary font-mono-sm text-mono-sm">(Querying catalog)</span>
        </div>
        <div className="flex items-center gap-space-xs text-secondary font-mono-sm text-mono-sm">
          <span className="material-symbols-outlined text-[16px] animate-spin text-primary-container">progress_activity</span>
          <span>{hint ?? "Resolving fitment for this vehicle…"}</span>
        </div>
      </div>
      <div className="p-space-lg space-y-space-lg">
        <div className="flex flex-wrap items-center gap-space-sm">
          <div className="flex items-center gap-2 px-space-md py-1.5 rounded-xl bg-surface-container text-secondary font-body-sm font-medium">
            <span className="w-4 h-4 rounded-full bg-secondary-fixed flex items-center justify-center font-mono-sm font-bold text-on-secondary-fixed">1</span>
            <span>Vehicle profile</span>
          </div>
          <span className="text-outline-variant font-mono-sm">→</span>
          <div className="flex items-center gap-2 px-space-md py-1.5 rounded-xl bg-primary-container text-on-primary font-body-sm font-medium">
            <span className="w-4 h-4 rounded-full bg-on-primary text-primary-container flex items-center justify-center font-mono-sm font-bold">2</span>
            <span>Subsystem assembly</span>
          </div>
          <span className="text-outline-variant font-mono-sm">→</span>
          <Shimmer className="h-8 w-44 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-space-sm bg-surface-container-low p-space-md rounded-xl">
          {["Target chassis", "Engine code", "Model year", "Catalog shard"].map((label) => (
            <div key={label} className="space-y-1">
              <span className="font-label-xs text-label-xs uppercase tracking-wider text-secondary">{label}</span>
              {label === "Catalog shard" ? (
                <div className="font-mono-sm text-secondary font-medium">Platform catalog [syncing]</div>
              ) : (
                <Shimmer className="h-4 w-28" />
              )}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div className="space-y-2">
          <div className="h-9 bg-surface-container-low rounded-xl px-4 flex items-center justify-between">
            <div className="h-3 w-28 bg-surface-container-highest rounded" />
            <div className="h-3 w-36 bg-surface-container-highest rounded" />
            <div className="h-3 w-20 bg-surface-container-highest rounded" />
          </div>
          <div className="h-10 bg-surface-container-lowest shadow-sm rounded-xl px-4 flex items-center justify-between">
            <Shimmer className="h-3.5 w-32" />
            <Shimmer className="h-3.5 w-48" />
            <Shimmer className="h-3.5 w-24" />
          </div>
        </div>
      </div>
    </section>
  );
}

export function PartsError({
  onRetry,
  message,
  statusLabel,
  detail,
  logLines,
}: {
  onRetry: () => void;
  message?: string;
  statusLabel?: string;
  detail?: string;
  logLines?: string[];
}) {
  const [logOpen, setLogOpen] = useState(false);
  const headline = message?.trim() || "Could not load parts. Nothing was changed.";
  const code = statusLabel?.replace(/\s+/g, "_").toUpperCase() || "ERR_CATALOG_LOAD";

  return (
    <section className="parts-database-stitch bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col">
      <div className="bg-error-container/40 px-space-lg py-space-md flex flex-wrap items-center justify-between gap-space-sm">
        <div className="flex items-center gap-space-sm">
          <span className="w-2.5 h-2.5 rounded-full bg-error" />
          <span className="font-mono-md text-mono-md font-semibold text-error uppercase tracking-wide">Could not load parts</span>
          <span className="text-on-surface-variant font-mono-sm text-mono-sm">(Network or server error)</span>
        </div>
        {statusLabel ? (
          <span className="font-mono-sm text-mono-sm bg-error-container text-on-error-container font-semibold px-2 py-0.5 rounded">{statusLabel}</span>
        ) : null}
      </div>
      <div className="p-space-xl">
        <div className="bg-error-container/20 rounded-xl p-space-xl flex flex-col md:flex-row items-start gap-space-lg shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-error-container text-error flex items-center justify-center shrink-0 shadow-sm">
            <span className="material-symbols-outlined text-[28px]">error</span>
          </div>
          <div className="flex-1 space-y-space-sm">
            <div>
              <h3 className="font-headline-lg text-headline-lg font-bold text-on-surface">{headline}</h3>
              <p className="font-body-md text-body-md text-secondary mt-1">
                The catalog request did not complete. Nothing on file was changed. You can retry or check platform ops if this keeps happening.
              </p>
            </div>
            {detail ? (
              <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm max-w-2xl">
                <p className="font-mono-sm text-mono-sm text-on-surface-variant">{detail}</p>
              </div>
            ) : null}
            <div className="pt-space-sm flex flex-wrap items-center gap-space-md">
              <button
                type="button"
                className="px-space-lg h-9 bg-primary-container hover:bg-primary text-on-primary rounded-xl font-body-sm font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
                onClick={onRetry}
              >
                <span className="material-symbols-outlined text-[18px]">replay</span>
                Retry engine query
              </button>
              {logLines?.length ? (
                <button
                  type="button"
                  className="px-space-md h-9 bg-surface-container-lowest hover:bg-surface-container text-on-surface rounded-xl font-mono-md font-medium transition-colors flex items-center gap-1.5 shadow-sm"
                  onClick={() => setLogOpen((open) => !open)}
                >
                  <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                  Inspect error log ({code})
                </button>
              ) : null}
            </div>
            {logOpen && logLines?.length ? (
              <div className="mt-space-md p-space-md bg-[#0f172a] rounded-xl text-[#94a3b8] font-mono-sm space-y-1">
                {logLines.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

export function CarNotInCatalog({
  carLabel,
  make,
  modelYearHint,
  onAddCar,
  onBrowseMake,
}: {
  carLabel: string;
  make: string;
  modelYearHint?: string;
  onAddCar: () => void;
  onBrowseMake: () => void;
}) {
  return (
    <section className="parts-database-stitch bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col">
      <div className="bg-surface-container-low px-space-lg py-space-md flex flex-wrap items-center justify-between gap-space-sm">
        <div className="flex items-center gap-space-sm">
          <span className="w-2.5 h-2.5 rounded-full bg-secondary" />
          <span className="font-mono-md text-mono-md font-semibold text-secondary uppercase tracking-wide">Car not in the catalog</span>
          <span className="text-on-surface-variant font-mono-sm text-mono-sm">(Missing vehicle)</span>
        </div>
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container text-secondary font-mono-sm">
          <span className="material-symbols-outlined text-[14px]">visibility_off</span>
          Coverage gap
        </div>
      </div>
      <div className="p-space-xl">
        <div className="bg-surface-container-low rounded-xl p-space-xl flex flex-col md:flex-row items-start gap-space-lg shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-secondary-container text-on-secondary-fixed flex items-center justify-center shrink-0 shadow-sm">
            <span className="material-symbols-outlined text-[28px]">search_off</span>
          </div>
          <div className="flex-1 space-y-space-md">
            <div className="space-y-space-xs">
              <div className="inline-flex items-center gap-1.5 px-space-sm py-0.5 rounded-full bg-surface-container-highest text-on-surface font-mono-sm font-semibold">
                <span className="material-symbols-outlined text-[14px] text-secondary">directions_car</span>
                Queried entity: &quot;{carLabel}&quot;
              </div>
              <h3 className="font-headline-lg text-headline-lg font-bold text-on-surface">
                We don&apos;t have the {carLabel} in the car list yet.
              </h3>
              <p className="font-body-md text-body-md text-secondary max-w-3xl leading-relaxed">
                {modelYearHint ?? "This year or trim may not be in the catalog yet, or the make/model spelling may not match master data."}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md py-1 max-w-3xl">
              <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm space-y-1">
                <span className="font-label-xs text-label-xs uppercase tracking-wider text-secondary font-semibold">What you can do</span>
                <p className="font-body-sm text-body-sm text-on-surface">Add the vehicle to master data, then return here to attach parts.</p>
              </div>
              <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm space-y-1">
                <span className="font-label-xs text-label-xs uppercase tracking-wider text-secondary font-semibold">Same make, different model</span>
                <p className="font-body-sm text-body-sm text-on-surface">Browse other {make || "models"} already in the catalog.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-space-md pt-1">
              <button
                type="button"
                className="px-space-lg h-9 bg-primary-container hover:bg-primary text-on-primary rounded-xl font-body-sm font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
                onClick={onAddCar}
              >
                <span className="material-symbols-outlined text-[18px]">add_circle</span>
                Add this car
              </button>
              <button
                type="button"
                className="px-space-md h-9 bg-surface-container-lowest hover:bg-surface-container text-on-surface rounded-xl font-body-sm font-medium transition-colors flex items-center gap-1.5 shadow-sm"
                onClick={onBrowseMake}
              >
                <span className="material-symbols-outlined text-[18px]">manage_search</span>
                Browse all {make || "models"}
              </button>
            </div>
            <div className="flex items-center gap-2 pt-2 text-secondary font-mono-sm">
              <span className="material-symbols-outlined text-[16px] text-primary">query_stats</span>
              <span>Search is logged for catalog coverage planning.</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function PartsMatchTypesOff({
  tierOneCount,
  offlineTiers,
}: {
  tierOneCount: number;
  offlineTiers: number[];
}) {
  const labels = offlineTiers
    .map((tier) => PART_MATCH_TIERS.find((row) => row.tier === tier))
    .filter(Boolean);

  return (
    <section className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col">
      <div className="bg-surface-container-low px-space-lg py-space-md flex flex-wrap items-center justify-between gap-space-sm">
        <div className="flex items-center gap-space-sm">
          <span className="w-2.5 h-2.5 rounded-full bg-primary" />
          <span className="font-mono-md text-mono-md font-semibold text-primary uppercase tracking-wide">Match types switched off</span>
          <span className="text-secondary font-mono-sm text-mono-sm">(Direct strict mode)</span>
        </div>
        <span className="font-mono-sm bg-primary-fixed text-on-primary-fixed font-bold px-2 py-0.5 rounded">Strict tier 1 only</span>
      </div>
      <div className="p-space-lg space-y-space-lg">
        <div className="bg-secondary-container/40 p-space-md rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-space-md shadow-sm">
          <div className="flex items-center gap-space-md">
            <div className="w-9 h-9 rounded-xl bg-primary-container text-on-primary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[20px]">tune</span>
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-space-sm flex-wrap">
                <span className="font-headline-md text-headline-md font-semibold text-on-surface">Strict chassis alignment active</span>
                <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-mono-sm font-bold">OEM direct</span>
              </div>
              <p className="font-body-sm text-body-sm text-secondary max-w-2xl">
                Match types are switched off. Showing parts listed for this car only (strict tier 1 OEM). Sister, engine, aftermarket, and universal tiers are not shown.
              </p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
          <div className="p-space-md bg-surface-container-low rounded-xl space-y-space-sm">
            <div className="flex items-center justify-between">
              <span className="font-label-xs text-label-xs uppercase tracking-wider text-secondary font-bold">Active catalog view</span>
              <span className="font-mono-sm px-2 py-0.5 bg-surface-container-lowest rounded font-semibold text-primary">
                {tierOneCount} part{tierOneCount === 1 ? "" : "s"} found
              </span>
            </div>
            <p className="font-body-sm text-secondary">Only direct OEM listings for this vehicle appear in results.</p>
          </div>
          <div className="p-space-md bg-surface-container-low rounded-xl space-y-space-sm opacity-80">
            <div className="flex items-center justify-between">
              <span className="font-label-xs text-label-xs uppercase tracking-wider text-secondary font-bold">Suppressed match types</span>
              <span className="font-mono-sm px-2 py-0.5 bg-surface-container-lowest rounded text-secondary font-medium">
                {labels.length} tier{labels.length === 1 ? "" : "s"} offline
              </span>
            </div>
            <ul className="space-y-2 font-body-sm text-on-surface">
              {labels.length ? labels.map((row) => (
                <li key={row!.tier} className="p-space-sm bg-surface-container-lowest rounded-xl flex items-center justify-between">
                  <span>{row!.plainLabel}</span>
                  <span className="font-mono-sm text-secondary bg-surface-container px-2 py-0.5 rounded">Tier {row!.tier} (offline)</span>
                </li>
              )) : (
                <li className="text-secondary">Cross-match tiers are disabled platform-wide.</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

export function PartsEmpty({ onClear }: { onClear?: () => void }) {
  return (
    <div className="parts-database-stitch rounded-xl bg-surface-container-lowest p-6 shadow-sm">
      <p className="font-mono-sm text-mono-sm font-semibold text-secondary uppercase">No matches</p>
      <h2 className="font-headline-lg text-headline-lg font-bold text-on-surface mt-2">No vehicle matches this search.</h2>
      {onClear ? (
        <button type="button" className="mt-4 h-10 px-4 rounded-xl bg-surface-container text-on-surface" onClick={onClear}>Clear search</button>
      ) : null}
    </div>
  );
}

export function PartsZeroCoverage({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-xl bg-surface-container-lowest p-6 shadow-sm">
      <p className="font-mono-sm text-mono-sm font-semibold text-primary uppercase">Nothing on file yet</p>
      <h3 className="font-headline-md text-headline-md font-semibold text-on-surface mt-2">None on file yet</h3>
      <button type="button" className="mt-3 h-10 px-4 rounded-xl bg-primary-container text-on-primary" onClick={onAdd}>Add for this vehicle</button>
    </div>
  );
}
