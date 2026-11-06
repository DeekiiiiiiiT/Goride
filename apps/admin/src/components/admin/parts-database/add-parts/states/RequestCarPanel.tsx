// AP11 frame 2 — stay in wizard; pre-fill from draft filters
import { useState } from "react";
import { MaterialIcon } from "../../import/MaterialIcon";
import { toast } from "sonner";
import type { AddPartsDraft } from "../addPartsTypes";

export function RequestCarPanel({ draft, galleryExpanded }: { draft: AddPartsDraft; galleryExpanded?: boolean }) {
  const [open, setOpen] = useState(Boolean(galleryExpanded));
  const [make, setMake] = useState(galleryExpanded ? "Suzuki" : "");
  const [model, setModel] = useState(galleryExpanded ? "Swift Sport" : "");
  const [chassis, setChassis] = useState(galleryExpanded ? "ZC32S" : "");
  const [years, setYears] = useState(galleryExpanded ? "2011–2017" : "");
  const [notes, setNotes] = useState("");

  function openForm() {
    const first = draft.listings[0]?.label ?? "";
    const parts = first.split(" ");
    setMake(parts[0] ?? "");
    setModel(parts[1] ?? "");
    setChassis(parts[2] ?? "");
    setOpen(true);
  }

  if (!open && !galleryExpanded) {
    return (
      <button
        type="button"
        className="w-full p-4 rounded-xl border border-outline-variant/40 bg-surface-container-low/50 hover:bg-surface-container-low flex items-center justify-between gap-3 text-left transition-colors"
        onClick={openForm}
      >
        <div className="flex items-center gap-space-md min-w-0">
          <MaterialIcon name="add_road" className="text-primary-container text-[22px] shrink-0" />
          <div>
            <span className="font-label-md text-label-md font-semibold text-on-surface block">Car not in the list? Request it</span>
            <span className="font-body-sm text-on-surface-variant">Owner adds the car to the master catalog, then you can finish this part.</span>
          </div>
        </div>
        <MaterialIcon name="chevron_right" className="text-outline shrink-0" />
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-space-lg flex flex-col gap-space-sm shadow-sm">
      <p className="font-headline-md text-on-surface">Car not in the list</p>
      {galleryExpanded ? (
        <div className="p-2.5 rounded-lg bg-surface-container-low font-body-sm text-on-surface-variant">
          No car matches <span className="font-mono-sm font-semibold text-primary">&quot;Swift ZC32S&quot;</span> in the active chassis index.
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-space-sm">
        <div className="flex flex-col gap-1">
          <label className="font-label-xs uppercase tracking-wider text-outline font-semibold">Make</label>
          <input className="h-9 px-2.5 rounded-lg bg-surface-container-lowest font-body-sm shadow-sm" placeholder="Make" value={make} readOnly={galleryExpanded} onChange={(e) => setMake(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="font-label-xs uppercase tracking-wider text-outline font-semibold">Model</label>
          <input className="h-9 px-2.5 rounded-lg bg-surface-container-lowest font-body-sm shadow-sm" placeholder="Model" value={model} readOnly={galleryExpanded} onChange={(e) => setModel(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-space-sm">
        <div className="flex flex-col gap-1">
          <label className="font-label-xs uppercase tracking-wider text-outline font-semibold">Chassis Code</label>
          <input className="h-9 px-2.5 rounded-lg bg-surface-container-lowest font-mono-sm uppercase shadow-sm" placeholder="Chassis" value={chassis} readOnly={galleryExpanded} onChange={(e) => setChassis(e.target.value.toUpperCase())} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="font-label-xs uppercase tracking-wider text-outline font-semibold">Model Years</label>
          <input className="h-9 px-2.5 rounded-lg bg-surface-container-lowest font-mono-sm shadow-sm" placeholder="2016–2020" value={years} readOnly={galleryExpanded} onChange={(e) => setYears(e.target.value)} />
        </div>
      </div>
      {!galleryExpanded ? (
        <textarea className="min-h-[72px] px-3 py-2 rounded-lg border border-outline-variant/50 bg-surface-container-lowest font-body-sm" placeholder="Anything else we should know?" value={notes} onChange={(e) => setNotes(e.target.value)} />
      ) : null}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          className="w-full h-9 bg-primary-container text-on-primary rounded-lg font-body-sm font-medium flex items-center justify-center gap-1.5 shadow-sm"
          onClick={() => {
            toast.success("Car request noted — finish this part after the car is added.");
            if (!galleryExpanded) setOpen(false);
          }}
        >
          <MaterialIcon name="add_circle" className="text-[16px]" />
          {galleryExpanded ? "+ Request this car" : "Submit request"}
        </button>
        {galleryExpanded ? (
          <div className="flex items-center justify-center gap-1 font-mono-sm text-outline">
            <MaterialIcon name="schedule" className="text-[14px]" />
            <span>Queued to catalog review within 4h</span>
          </div>
        ) : (
          <button type="button" className="h-9 px-3 rounded-lg border text-sm self-start" onClick={() => setOpen(false)}>Cancel</button>
        )}
      </div>
    </div>
  );
}
