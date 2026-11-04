// AP11 frame 3 — stay in wizard; pre-fill engine from draft
import { useState } from "react";
import { toast } from "sonner";
import type { AddPartsDraft } from "../addPartsTypes";

export function RequestEnginePanel({ draft }: { draft: AddPartsDraft }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(draft.engineCode);
  const [notes, setNotes] = useState("");

  return (
    <>
      <button
        type="button"
        className="text-left text-primary font-body-sm hover:underline"
        onClick={() => {
          setCode(draft.engineCode || code);
          setOpen(true);
        }}
      >
        Can&apos;t find the engine? Request this engine
      </button>
      {open ? (
        <div className="rounded-xl border border-outline-variant/40 bg-surface-container-low p-4 flex flex-col gap-2">
          <p className="font-body-sm text-on-surface">Request a missing engine family (owner adds it under Platforms and engines).</p>
          <input className="h-10 px-3 rounded-lg border font-mono uppercase" placeholder="Engine code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <textarea className="min-h-[72px] px-3 py-2 rounded-lg border" placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="flex gap-2">
            <button
              type="button"
              className="h-9 px-3 rounded-lg bg-primary-container text-on-primary font-semibold text-sm"
              onClick={() => {
                toast.success("Engine request noted — finish this part after the engine is on file.");
                setOpen(false);
              }}
            >
              Submit request
            </button>
            <button type="button" className="h-9 px-3 rounded-lg border text-sm" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      ) : null}
    </>
  );
}
