// AP11 frame 3 — stay in wizard; pre-fill engine from draft
import { useState } from "react";
import { MaterialIcon } from "../../import/MaterialIcon";
import { PartsButton } from "../../PartsButton";
import { toast } from "sonner";
import type { AddPartsDraft } from "../addPartsTypes";

export function RequestEnginePanel({ draft, galleryExpanded }: { draft: AddPartsDraft; galleryExpanded?: boolean }) {
  const [open, setOpen] = useState(Boolean(galleryExpanded));
  const [code, setCode] = useState(galleryExpanded ? "K20A" : draft.engineCode);
  const [displacement, setDisplacement] = useState(galleryExpanded ? "2.0 L" : "");
  const [notes, setNotes] = useState("");

  if (!open && !galleryExpanded) {
    return (
      <PartsButton
        variant="secondary"
        className="w-full justify-start text-left"
        onClick={() => {
          setCode(draft.engineCode || code);
          setOpen(true);
        }}
      >
        Can&apos;t find the engine? Request this engine
      </PartsButton>
    );
  }

  return (
    <div className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-space-lg flex flex-col gap-space-sm shadow-sm">
      <p className="font-headline-md text-on-surface">Engine not in catalog</p>
      {galleryExpanded ? (
        <div className="p-2.5 rounded-lg bg-surface-container-low font-body-sm text-on-surface-variant">
          No engine family matches <span className="font-mono-sm font-semibold text-primary">K20A</span> in the master index.
        </div>
      ) : (
        <p className="font-body-sm text-on-surface-variant">Request a missing engine family (owner adds it under Platforms and engines).</p>
      )}
      <div className="grid grid-cols-2 gap-space-sm">
        <div className="flex flex-col gap-1">
          <label className="font-label-xs uppercase text-outline font-semibold">Engine code</label>
          <input className="h-9 px-2.5 rounded-lg bg-surface-container-lowest font-mono uppercase shadow-sm" placeholder="Engine code" value={code} readOnly={galleryExpanded} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="font-label-xs uppercase text-outline font-semibold">Displacement</label>
          <input className="h-9 px-2.5 rounded-lg bg-surface-container-lowest font-mono-sm shadow-sm" placeholder="2.0 L" value={displacement} readOnly={galleryExpanded} onChange={(e) => setDisplacement(e.target.value)} />
        </div>
      </div>
      {!galleryExpanded ? (
        <textarea className="min-h-[72px] px-3 py-2 rounded-lg border" placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      ) : null}
      <div className="flex gap-2 flex-col">
        <button
          type="button"
          className="h-9 px-3 rounded-lg bg-primary-container text-on-primary font-semibold text-sm flex items-center justify-center gap-1.5"
          onClick={() => {
            toast.success("Engine request noted — finish this part after the engine is on file.");
            if (!galleryExpanded) setOpen(false);
          }}
        >
          <MaterialIcon name="add_circle" className="text-[16px]" />
          {galleryExpanded ? "+ Request this engine" : "Submit request"}
        </button>
        {!galleryExpanded ? (
          <PartsButton variant="danger" className="self-start" onClick={() => setOpen(false)}>Cancel</PartsButton>
        ) : null}
      </div>
    </div>
  );
}
