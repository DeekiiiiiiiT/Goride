import { useEffect, useRef } from "react";
import type { Fp3OverlayRow, Fp3OverlayViewModel } from "../findPartsViewModels";

/** Shown under a picked overlay row; PartStep sets the same string when advancing. */
export const FP3_OPENING_SIDE_LABEL = "Opening Which side? …";

export type Fp3OverlayActions = {
  onClose: () => void;
  onPickRow: (row: Fp3OverlayRow) => void;
  onAskRoam: (row: Fp3OverlayRow) => void;
  onExpandNotOnFile: (rowId: string) => void;
  onCollapseNotOnFile: () => void;
  vehicleDescriptor: string;
  focusedRowId: string;
  onFocusRow: (rowId: string) => void;
  pickedRowId: string;
  openingSideLabel: string;
};

type OverlayRowMeta = {
  requestRouteLine: string;
  targetEngineLine: string;
  catalogAddAvgMinutes: number | null;
};

function OverlayRowButton({
  row,
  actions,
  expandedNotOnFileId,
  overlayMeta,
}: {
  row: Fp3OverlayRow;
  actions: Fp3OverlayActions;
  expandedNotOnFileId: string;
  overlayMeta: OverlayRowMeta;
}) {
  const expanded = (expandedNotOnFileId === row.id || actions.focusedRowId === row.id) && !row.onFile;
  const picked = actions.pickedRowId === row.id;
  return (
    <div className="flex flex-col gap-space-sm">
      <button
        type="button"
        data-fp3-overlay-row={row.id}
        className={`group w-full text-left p-space-md rounded-xl transition-all flex items-center justify-between gap-space-md ${row.onFile ? "bg-surface-container-low hover:bg-surface-container" : "bg-surface-container-lowest hover:bg-surface-container-low"} ${picked ? "ring-2 ring-primary" : ""}`}
        onClick={() => (row.onFile ? actions.onPickRow(row) : actions.onExpandNotOnFile(row.id))}
      >
        <div className="flex items-center gap-space-md min-w-0">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors ${row.onFile ? "bg-surface-container-lowest text-on-surface group-hover:bg-primary group-hover:text-on-primary" : "bg-surface-container text-on-surface-variant"}`}>
            <span className="material-symbols-outlined text-[20px]">{row.iconKey}</span>
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-space-xs flex-wrap">
              <span className={`font-headline-sm text-headline-sm text-on-surface ${row.onFile ? "group-hover:text-primary" : ""}`}>{row.name}</span>
              {row.opCode !== "—" ? (
                <span className="font-label-code text-caption text-on-surface-variant">{row.opCode}</span>
              ) : null}
            </div>
            {row.descriptionLine ? (
              <span className="font-body-sm text-body-sm text-on-surface-variant truncate">{row.descriptionLine}</span>
            ) : null}
            {row.onFile && row.oemPartNumber && row.oemPartNumber !== "—" ? (
              <span className="font-label-code text-caption text-on-surface-variant mt-0.5">
                OEM #{row.oemPartNumber}
                {row.axleNote ? ` · ${row.axleNote}` : ""}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-space-md shrink-0">
          {picked ? (
            <span className="px-2.5 py-1 rounded-full bg-primary text-on-primary font-label-code text-caption font-semibold">Selected</span>
          ) : (
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-label-code text-caption font-semibold ${row.onFile ? "bg-emerald-50 text-emerald-800" : "bg-surface-container-highest text-on-surface-variant"}`}>
              {row.onFile ? <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span> : null}
              <span>{row.onFileLabel}</span>
            </span>
          )}
          <span className="material-symbols-outlined text-[18px] text-on-surface-variant group-hover:translate-x-0.5 transition-transform">
            {picked ? "check" : "chevron_right"}
          </span>
          <span className="hidden group-hover:inline font-body-sm text-body-sm font-semibold text-primary">Choose →</span>
        </div>
      </button>
      {expanded ? (
        <div className="ml-14 p-space-md rounded-xl bg-surface-container-low border border-surface-container-high flex flex-col gap-space-md">
          <p className="font-body-sm text-body-sm text-on-surface">
            We don&apos;t have {row.name} info for your {actions.vehicleDescriptor} yet.
          </p>
          {overlayMeta.catalogAddAvgMinutes != null ? (
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Roam usually adds missing parts within approximately {overlayMeta.catalogAddAvgMinutes} minutes.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-space-sm">
            <button type="button" className="px-space-md py-2 rounded-lg bg-primary text-on-primary font-body-sm text-body-sm font-semibold" onClick={() => actions.onAskRoam(row)}>
              Ask Roam to add it
            </button>
            <button type="button" className="px-space-md py-2 rounded-lg bg-surface-container-high text-on-surface font-body-sm text-body-sm font-medium" onClick={actions.onCollapseNotOnFile}>
              Pick another part
            </button>
          </div>
          <div className="px-space-xs flex items-center justify-between font-label-code text-caption text-on-surface-variant tracking-wider uppercase">
            <span>{overlayMeta.requestRouteLine}</span>
            <span>{overlayMeta.targetEngineLine}</span>
          </div>
        </div>
      ) : null}
      {picked && actions.openingSideLabel ? (
        <div className="px-space-md py-2 rounded-lg bg-surface-container-high font-body-sm text-body-sm text-on-surface flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-primary animate-pulse">sync</span>
          <span>{actions.openingSideLabel}</span>
        </div>
      ) : null}
    </div>
  );
}

function Fp3OverlaySearchFooter({ onSearchInstead }: { onSearchInstead: () => void }) {
  return (
    <div className="px-space-xl py-space-md bg-surface-container-low flex items-center justify-between shrink-0">
      <span className="font-body-sm text-body-sm text-on-surface-variant">Can&apos;t see your part? Search for it by name.</span>
      <button
        type="button"
        className="font-body-sm text-body-sm font-semibold text-primary underline underline-offset-4 hover:opacity-80 transition-opacity"
        onClick={onSearchInstead}
      >
        Search instead
      </button>
    </div>
  );
}

export function Fp3AreaOverlay({
  data,
  actions,
  sheet,
}: {
  data: Fp3OverlayViewModel;
  actions: Fp3OverlayActions;
  sheet?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  const overlayMeta: OverlayRowMeta = {
    requestRouteLine: data.requestRouteLine,
    targetEngineLine: data.targetEngineLine,
    catalogAddAvgMinutes: data.catalogAddAvgMinutes,
  };

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        actions.onClose();
        return;
      }
      const rows = [...data.rowsOnFile, ...data.rowsNotOnFile];
      if (!rows.length) return;
      const idx = rows.findIndex((r) => r.id === actions.focusedRowId);
      if (event.key === "ArrowDown") {
        event.preventDefault();
        const next = rows[Math.min(rows.length - 1, idx < 0 ? 0 : idx + 1)];
        if (next) actions.onFocusRow(next.id);
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        const next = rows[Math.max(0, idx <= 0 ? 0 : idx - 1)];
        if (next) actions.onFocusRow(next.id);
      }
      if (event.key === "Enter" && actions.focusedRowId) {
        const row = rows.find((r) => r.id === actions.focusedRowId);
        if (!row) return;
        event.preventDefault();
        if (row.onFile) actions.onPickRow(row);
        else actions.onExpandNotOnFile(row.id);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actions, data.rowsNotOnFile, data.rowsOnFile]);

  const headerMeta = (
    <div className="mt-space-lg pt-space-sm flex items-center justify-between font-label-code text-caption text-on-surface-variant tracking-wider uppercase">
      <span>{data.partsInArea} parts in this area</span>
      <span>·</span>
      <span>{data.onFileForCar} on file for your car</span>
    </div>
  );

  const body = (
    <>
      {data.areaEmptyNote ? (
        <p className="font-body-sm text-body-sm text-on-surface-variant px-space-xl pb-space-sm">{data.areaEmptyNote}</p>
      ) : null}
      <div className={`px-space-xl pb-space-lg flex flex-col gap-space-md ${sheet ? "max-h-[70vh] overflow-y-auto" : ""}`}>
        <div className="flex flex-col gap-space-sm">
          {data.rowsOnFile.map((row) => (
            <OverlayRowButton key={row.id} row={row} actions={actions} expandedNotOnFileId={data.expandedNotOnFileId} overlayMeta={overlayMeta} />
          ))}
        </div>
        {data.rowsNotOnFile.length ? (
          <>
            <div className="relative py-space-sm flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full h-px bg-surface-container-highest"></div>
              </div>
              <span className="relative px-3 bg-surface-container-lowest font-label-code text-caption text-on-surface-variant tracking-wider uppercase">
                Not on file for your car yet
              </span>
            </div>
            <div className="flex flex-col gap-space-sm">
              {data.rowsNotOnFile.map((row) => (
                <OverlayRowButton key={row.id} row={row} actions={actions} expandedNotOnFileId={data.expandedNotOnFileId} overlayMeta={overlayMeta} />
              ))}
            </div>
          </>
        ) : null}
      </div>
      {!sheet ? (
        <div className="px-space-xl pb-space-sm font-caption text-caption text-on-surface-variant max-md:hidden">
          <div className="flex items-center gap-space-md flex-wrap">
            <span>↑ ↓ move between rows</span>
            <span>·</span>
            <span>Enter picks</span>
            <span>·</span>
            <span>Esc closes</span>
          </div>
        </div>
      ) : null}
      <Fp3OverlaySearchFooter onSearchInstead={actions.onClose} />
    </>
  );

  if (sheet) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col justify-end md:hidden">
        <button type="button" className="absolute inset-0 bg-[#0a0a0a]/40 backdrop-blur-[2px]" aria-label="Close" onClick={actions.onClose} />
        <div ref={dialogRef} className="find-parts-sheet relative w-full max-h-[90vh] bg-surface-container-lowest rounded-t-2xl shadow-2xl flex flex-col" role="dialog" aria-modal="true">
          <div className="px-space-lg pt-space-md pb-space-sm flex items-center justify-between">
            <div className="flex items-center gap-space-sm">
              <div className="w-10 h-10 bg-primary text-on-primary rounded-xl flex items-center justify-center">
                <span className="material-symbols-outlined text-[22px]">{data.areaIcon}</span>
              </div>
              <div>
                <h2 className="font-headline-sm text-headline-sm text-on-surface">{data.areaName}</h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Pick the part you need</p>
              </div>
            </div>
            <button type="button" className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-surface-container-low" onClick={actions.onClose} aria-label="Close">
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
          {headerMeta}
          {body}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#0a0a0a]/40 backdrop-blur-[2px] flex items-center justify-center p-space-md max-md:hidden">
      <button type="button" className="absolute inset-0" aria-label="Close overlay" onClick={actions.onClose} />
      <div
        ref={dialogRef}
        className="relative w-full max-w-[640px] bg-surface-container-lowest rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fp3-area-overlay-title"
      >
        <div className="px-space-xl pt-space-xl pb-space-lg bg-surface-container-lowest">
          <div className="flex items-start justify-between gap-space-md">
            <div className="flex items-start gap-space-md">
              <div className="w-11 h-11 bg-primary text-on-primary rounded-xl flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[24px]">{data.areaIcon}</span>
              </div>
              <div className="flex flex-col">
                <h2 className="font-headline-lg text-headline-lg text-on-surface tracking-tight" id="fp3-area-overlay-title">{data.areaName}</h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Pick the part you need for your 2019 {actions.vehicleDescriptor.replace(/^2019\s+/i, "")}</p>
              </div>
            </div>
            <button type="button" aria-label="Close parts modal" className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors" onClick={actions.onClose}>
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
          {headerMeta}
        </div>
        {body}
      </div>
    </div>
  );
}
