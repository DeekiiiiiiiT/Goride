import type { ReactNode } from "react";
import type { Fp6ViewModel } from "../findPartsViewModels";

export type Fp6Actions = {
  onClose: () => void;
  onReportNoFit: () => void;
  onUseInService: () => void;
  onCopyCrossRef: (partNumber: string) => void;
  children?: ReactNode;
};

export function Fp6Screen({ actions, data }: { actions: Fp6Actions; data: Fp6ViewModel }) {
  const vehicleTitle = [data.plate, data.vehicleLabel].filter(Boolean).join(" · ") || data.plate || "Your vehicle";

  return (
    <div className="find-parts-screen-root">
      <div className="fp-screen-root">
        <button
          type="button"
          aria-label="Close drawer backdrop"
          className="fixed inset-0 z-40 bg-primary/45 backdrop-blur-[1px] transition-opacity duration-300"
          onClick={actions.onClose}
        />

        <aside
          aria-labelledby="drawer-part-title"
          aria-modal="true"
          className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-[520px] bg-surface-container-lowest shadow-2xl flex flex-col justify-between overflow-hidden"
          id="part-detail-drawer"
          role="dialog"
        >
          <header className="p-space-xl bg-surface-container-lowest shrink-0 shadow-sm z-10 flex flex-col gap-space-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-space-xs font-label-code text-caption uppercase tracking-wider text-secondary">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                <span>Find parts / {data.partName}</span>
              </div>
              <button
                type="button"
                aria-label="Close drawer"
                className="w-8 h-8 rounded-lg bg-surface-container-low hover:bg-surface-container flex items-center justify-center text-on-surface transition-colors"
                onClick={actions.onClose}
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="flex flex-col gap-0.5">
              <h2 className="font-label-code !text-[24px] !leading-[32px] !font-bold text-on-surface tracking-tight" id="drawer-part-title">
                {data.brandLabel} {data.partNumber}
              </h2>
              <p className="font-body-sm text-body-sm text-secondary">{data.descriptionLine}</p>
            </div>

            <div className="flex flex-wrap items-center gap-space-xs pt-1">
              <span className="inline-flex items-center gap-1 px-space-sm py-1 rounded bg-secondary-fixed text-on-secondary-fixed font-caption text-caption font-semibold">
                <span className="material-symbols-outlined text-[13px]">directions_car</span>
                <span>Made for your car</span>
              </span>
              {data.specMatchLabel !== "—" ? (
                <span className="inline-flex items-center gap-1.5 px-space-sm py-1 rounded bg-surface-container text-on-surface font-caption text-caption font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container" />
                  <span>{data.specMatchLabel}</span>
                </span>
              ) : null}
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-space-xl flex flex-col gap-space-xl bg-surface-container-lowest">
            {data.specRows.length > 0 && data.specRows[0]?.label !== "None yet" ? (
              <div className="w-full rounded-xl bg-surface-container-low p-space-md flex flex-col gap-space-sm">
                {data.specRows.map((row, index) => (
                  <div key={`${row.label}-${index}`} className="flex justify-between gap-space-md font-body-sm text-body-sm">
                    <span className="text-secondary">{row.label}</span>
                    <span className="text-on-surface font-medium text-right">{row.value}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="w-full rounded-xl bg-surface-container-low p-space-md flex items-center gap-space-md">
                <div className="w-20 h-20 rounded-lg overflow-hidden shrink-0 bg-surface-container flex items-center justify-center">
                  {data.partPhotoUrl ? (
                    <img className="w-full h-full object-cover" alt="" src={data.partPhotoUrl} />
                  ) : (
                    <span className="material-symbols-outlined text-[32px] text-secondary">inventory_2</span>
                  )}
                </div>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="font-body-sm text-body-sm font-semibold text-on-surface">{data.partName}</div>
                  <div className="font-caption text-caption text-secondary">{vehicleTitle}</div>
                </div>
              </div>
            )}

            <section className="flex flex-col gap-space-sm">
              <div className="flex items-center justify-between">
                <h3 className="font-caption text-caption font-bold uppercase tracking-wider text-secondary">
                  Why it fits this chassis
                </h3>
                {data.specMatchLabel !== "—" ? (
                  <span className="font-label-code text-caption text-on-tertiary-container font-semibold">{data.specMatchLabel}</span>
                ) : null}
              </div>
              <div className="p-space-md rounded-lg bg-surface-container-low flex items-start gap-space-sm">
                <span className="material-symbols-outlined text-[18px] text-on-surface shrink-0 mt-0.5">check_circle</span>
                <div className="flex flex-col gap-space-xs">
                  <span className="font-body-sm text-body-sm font-medium text-on-surface">{data.fitReasonLine}</span>
                  <span className="font-caption text-caption text-secondary">
                    {data.vinLabel}
                  </span>
                </div>
              </div>
            </section>

            <section className="flex flex-col gap-space-sm">
              <h3 className="font-caption text-caption font-bold uppercase tracking-wider text-secondary">Fits these engine variants</h3>
              <div className="flex flex-wrap items-center gap-space-xs">
                {data.variantChips.map((chip, index) => (
                  <div
                    key={`${chip.label}-${index}`}
                    className={`px-space-md py-1.5 rounded-lg flex items-center gap-space-xs ${
                      chip.excluded
                        ? "bg-surface-container-low/60 text-secondary opacity-60"
                        : chip.active
                          ? "bg-surface-container text-on-surface shadow-sm"
                          : "bg-surface-container-low text-on-surface"
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px] font-bold">{chip.excluded ? "remove" : "check"}</span>
                    <span className="font-label-code text-body-sm font-semibold">{chip.label}</span>
                    {chip.active ? (
                      <span className="text-[10px] uppercase font-bold tracking-wider px-1 rounded bg-secondary-fixed text-on-secondary-fixed">
                        Target
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>

            <section className="flex flex-col gap-space-sm">
              <div className="flex items-center justify-between">
                <h3 className="font-caption text-caption font-bold uppercase tracking-wider text-secondary">Same part, other numbers</h3>
                <span className="font-caption text-caption text-secondary">Cross-reference table</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-space-xs">
                {data.crossRefRows.every((row) => row.partNumber === "—") ? (
                  <p className="font-body-sm text-body-sm text-secondary sm:col-span-3">No other numbers for this part yet.</p>
                ) : null}
                {data.crossRefRows.filter((row) => row.partNumber !== "—").map((row, index) => (
                  <button
                    key={`${row.partNumber}-${index}`}
                    type="button"
                    className="p-space-sm rounded-lg bg-surface-container-low hover:bg-surface-container flex flex-col gap-0.5 text-left transition-colors relative group"
                    onClick={() => actions.onCopyCrossRef(row.partNumber)}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="font-caption text-caption text-secondary">{row.brand}</span>
                      <span className="material-symbols-outlined text-[14px] text-secondary group-hover:text-on-surface">content_copy</span>
                    </div>
                    <span className="font-label-code text-caption font-bold text-on-surface">{row.partNumber}</span>
                    <span className="text-[10px] text-secondary">{row.note}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>

          <footer className="p-space-lg bg-surface-container-lowest shadow-[0_-4px_16px_rgba(0,0,0,0.06)] shrink-0 flex flex-col gap-space-sm z-20">
            <button
              type="button"
              className="w-full py-2 px-space-lg rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm font-semibold flex items-center justify-center gap-1 transition-colors"
              onClick={actions.onReportNoFit}
            >
              <span className="material-symbols-outlined text-[18px]">report</span>
              <span>This part didn&apos;t fit my car</span>
            </button>

            <button
              type="button"
              className="w-full py-3 px-space-lg rounded-xl bg-primary hover:bg-primary/90 text-on-primary font-body-md text-body-md font-semibold flex items-center justify-center gap-space-sm shadow-md transition-all active:scale-[0.99]"
              onClick={actions.onUseInService}
            >
              <span>Use in a service log</span>
              {data.plate !== "—" ? (
                <span className="font-label-plate text-caption px-1.5 py-0.5 rounded bg-surface-container-highest/20 text-on-primary">
                  {data.plate} PRE-FILLED
                </span>
              ) : null}
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </button>

            <div className="flex items-center justify-between text-[11px] font-caption text-secondary px-1 pt-0.5">
              <span />
              <span className="font-label-code">ROAM-FLT-LOG-V6</span>
            </div>
          </footer>
        </aside>
      </div>
    </div>
  );
}
