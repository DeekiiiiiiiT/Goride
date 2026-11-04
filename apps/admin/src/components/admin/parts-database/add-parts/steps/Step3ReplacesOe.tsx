// Stitch AP7
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { AddPartsDraft } from "../addPartsTypes";
import { fetchVehicleOptions } from "../../partsDatabaseApi";

export function Step3ReplacesOe({ draft, setDraft, onSkip }: { draft: AddPartsDraft; setDraft: (d: AddPartsDraft) => void; onSkip: () => void }) {
  const makes = useQuery({ queryKey: ["vehicle-options-makes"], queryFn: () => fetchVehicleOptions({}) });
  const [brand, setBrand] = useState("");
  const [number, setNumber] = useState("");

  const makerOptions = makes.data?.makes ?? [];

  return (
    <>
      <h2 className="font-headline-md text-on-surface">Replaces a factory number (optional)</h2>
      <button type="button" className="text-primary text-body-sm self-start" onClick={onSkip}>Skip</button>
      <div className="flex flex-wrap gap-2">
        <select
          className="h-10 min-w-[140px] px-3 rounded-xl border"
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
        >
          <option value="">Car maker</option>
          {makerOptions.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <input className="h-10 flex-1 min-w-[140px] px-3 rounded-xl border font-mono" placeholder="Factory number" value={number} onChange={(e) => setNumber(e.target.value)} />
        <button
          type="button"
          className="h-10 px-3 rounded-xl border"
          onClick={() => {
            const n = number.trim();
            const b = brand.trim();
            if (!n || !b) return;
            setDraft({ ...draft, factoryNumbers: [...draft.factoryNumbers, { brand: b, number: n }] });
            setNumber("");
          }}
        >
          + Add row
        </button>
      </div>
      <ul className="text-sm font-mono flex flex-col gap-1">
        {draft.factoryNumbers.map((r, i) => (
          <li key={`${r.brand}-${r.number}-${i}`} className="flex items-center gap-2">
            {r.brand} {r.number}
            <button type="button" className="text-on-surface-variant" onClick={() => setDraft({ ...draft, factoryNumbers: draft.factoryNumbers.filter((_, j) => j !== i) })}>Delete</button>
          </li>
        ))}
      </ul>
    </>
  );
}
