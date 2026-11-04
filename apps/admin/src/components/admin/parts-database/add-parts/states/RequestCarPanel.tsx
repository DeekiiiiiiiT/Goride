// AP11 frame 2 — stay in wizard; pre-fill from draft filters
import { useState } from "react";
import { toast } from "sonner";
import type { AddPartsDraft } from "../addPartsTypes";

export function RequestCarPanel({ draft }: { draft: AddPartsDraft }) {
  const [open, setOpen] = useState(false);
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [chassis, setChassis] = useState("");
  const [notes, setNotes] = useState("");

  function openForm() {
    const first = draft.listings[0]?.label ?? "";
    const parts = first.split(" ");
    setMake(parts[0] ?? "");
    setModel(parts[1] ?? "");
    setChassis(parts[2] ?? "");
    setOpen(true);
  }

  return (
    <>
      <button type="button" className="text-left text-primary font-body-sm hover:underline" onClick={openForm}>
        Can&apos;t find the car? Request this car
      </button>
      {open ? (
        <div className="rounded-xl border border-outline-variant/40 bg-surface-container-low p-4 flex flex-col gap-2">
          <p className="font-body-sm text-on-surface">Request a missing car (owner reviews in Pending vehicle catalog).</p>
          <input className="h-10 px-3 rounded-lg border" placeholder="Make" value={make} onChange={(e) => setMake(e.target.value)} />
          <input className="h-10 px-3 rounded-lg border" placeholder="Model" value={model} onChange={(e) => setModel(e.target.value)} />
          <input className="h-10 px-3 rounded-lg border font-mono uppercase" placeholder="Chassis" value={chassis} onChange={(e) => setChassis(e.target.value)} />
          <textarea className="min-h-[72px] px-3 py-2 rounded-lg border" placeholder="Anything else we should know?" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="flex gap-2">
            <button
              type="button"
              className="h-9 px-3 rounded-lg bg-primary-container text-on-primary font-semibold text-sm"
              onClick={() => {
                toast.success("Car request noted — finish this part after the car is added.");
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
