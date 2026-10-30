// Stitch: dominion-redesign/S42f
import { useState } from "react";
import { supabase } from "../../../../utils/supabase/client";
import { partsEnterpriseApi } from "../../../../services/partSourcingService";
import type { FindPartsCandidate, FoundPartRow } from "../partsDatabaseApi";
import { savePartAlias } from "./findPartsApi";

export function PartDetailDrawer({
  part,
  candidates,
  owner,
  componentId,
  onClose,
  onEdit,
}: {
  part: FoundPartRow;
  candidates: FindPartsCandidate[];
  owner: boolean;
  componentId: string;
  onClose: () => void;
  onEdit: () => void;
}) {
  const [alias, setAlias] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const ownerTitle = owner ? undefined : "Only the owner can change parts.";
  const fits = candidates.filter((row) => (part.fitsVariantIds || []).includes(row.id));
  const verified = part.status === "verified";

  async function confirm() {
    if (!owner) return;
    const token = (await supabase.auth.getSession()).data.session?.access_token ?? "";
    await partsEnterpriseApi.decidePart(token, part.partId, "confirmed");
    setNote("Already verified");
  }

  async function addAlias() {
    if (!owner || !alias.trim() || !componentId) return;
    await savePartAlias({ term: alias.trim(), componentId, reason: reason || "Added from Find parts" });
    setAlias("");
    setNote("Saved");
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <aside className="find-parts-sheet h-full w-full max-w-md overflow-y-auto bg-surface-container-lowest p-space-lg shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-headline-lg text-headline-lg font-bold text-on-surface">{part.name}</h2>
            <p className="font-mono-sm text-mono-sm text-secondary">{[part.brand, part.number].filter(Boolean).join(" ")}</p>
          </div>
          <button type="button" className="h-11 px-3" onClick={onClose} aria-label="✕ esc">Close</button>
        </div>
        <section className="mt-4">
          <h3 className="font-headline-md text-headline-md font-semibold">Why it fits</h3>
          <p className="font-body-md text-body-md text-on-surface mt-1">{part.reason}</p>
        </section>
        <section className="mt-4">
          <h3 className="font-headline-md text-headline-md font-semibold">Fits these versions</h3>
          <p className="font-body-sm text-body-sm text-secondary">Applicable trim & engine versions</p>
          <ul className="mt-2">
            {(fits.length ? fits : candidates).map((row) => (
              <li key={row.id} className="font-body-sm text-body-sm text-on-surface">{row.plainLabel || row.codeLine}</li>
            ))}
          </ul>
        </section>
        <section className="mt-4">
          <h3 className="font-headline-md text-headline-md font-semibold">Also called</h3>
          <p className="font-body-sm text-body-sm">{(part.alsoKnownAs || []).join(", ") || "None yet"}</p>
          <div className="flex gap-2 mt-2">
            <input className="h-12 flex-1 rounded-xl bg-surface-container-low px-3" value={alias} placeholder="+ add alias" onChange={(event) => setAlias(event.target.value)} />
            <button type="button" className="h-12 px-3 rounded-xl bg-surface-container disabled:opacity-40" disabled={!owner} title={ownerTitle} onClick={() => { void addAlias(); }}>+ add alias</button>
          </div>
        </section>
        <section className="mt-4">
          <h3 className="font-headline-md text-headline-md font-semibold">Audit & verification history</h3>
          <p className="font-body-sm text-body-sm text-secondary">{verified ? "Already verified" : "Needs checking"}</p>
        </section>
        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" className="h-12 px-4 rounded-xl bg-surface-container-low disabled:opacity-40" disabled={!owner} title={ownerTitle} onClick={() => setNote("Exclude from this car needs a listing. Use Vehicle parts.")}>Exclude from this car</button>
          <button type="button" className="h-12 px-4 rounded-xl bg-surface-container-low disabled:opacity-40" disabled={!owner} title={ownerTitle} onClick={onEdit}>Edit</button>
          <button type="button" className="h-12 px-4 rounded-xl bg-primary-container text-on-primary disabled:opacity-40" disabled={!owner || verified} title={ownerTitle} onClick={() => { void confirm(); }}>{verified ? "Already verified" : "Confirm"}</button>
        </div>
        {note ? <p className="mt-3 font-body-sm text-body-sm">{note}</p> : null}
        <p className="mt-4 font-body-sm text-body-sm text-secondary">content_copy</p>
        <div className="find-parts-phone-bar md:hidden sticky bottom-0 mt-4 flex gap-2 bg-surface-container-lowest py-3">
          <button type="button" className="h-12 flex-1 rounded-xl bg-surface-container-low" onClick={onClose}>Back</button>
          <button type="button" className="h-12 flex-1 rounded-xl bg-primary-container text-on-primary disabled:opacity-40" disabled={!owner} title={ownerTitle}>Save to car manifest</button>
        </div>
      </aside>
    </div>
  );
}
