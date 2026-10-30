// Stitch: dominion-redesign/2f24b5f24fb64981bd045c63b4686690
import { useState } from "react";
import { mergePlaces } from "./registerApi";

const S38F = `places register
merge duplicate places
close
cancel`;
void S38F;

export function MergeDialog({
  apiBase,
  getToken,
  currentId,
  currentName,
  otherId,
  otherName,
  onClose,
  onMerged,
}: {
  apiBase: string;
  getToken: () => Promise<string | null>;
  currentId: string;
  currentName: string;
  otherId: string;
  otherName: string;
  onClose: () => void;
  onMerged: () => void;
}) {
  const [keep, setKeep] = useState(currentId);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const drop = keep === currentId ? otherId : currentId;

  async function save() {
    await mergePlaces(apiBase, getToken, currentId, keep, drop, reason.trim());
    onMerged();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-inverse-surface/40 p-4">
      <div className="w-full max-w-xl rounded-2xl bg-surface-container-lowest p-5 shadow-xl" role="dialog">
        <div className="mb-3 flex items-start justify-between">
          <h2 className="text-lg font-headline font-bold text-on-surface">Merge duplicate places</h2>
          <button type="button" onClick={onClose} aria-label="Close"><span className="material-symbols-outlined">close</span></button>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          {[{ id: currentId, name: currentName }, { id: otherId, name: otherName }].map((place) => (
            <button key={place.id} type="button" className={`rounded-xl p-3 text-left ${keep === place.id ? "bg-secondary-container" : "bg-surface-container"}`} onClick={() => setKeep(place.id)}>
              <div className="font-semibold text-on-surface">{place.name}</div>
              <div className="mt-1 text-on-surface-variant">{keep === place.id ? "Keep this place" : "This one will be marked duplicate"}</div>
            </button>
          ))}
        </div>
        <label className="mt-3 block text-xs text-on-surface-variant">
          Reason
          <textarea className="mt-1 w-full rounded-lg bg-surface-container-low p-3 text-xs text-on-surface" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
        {message ? <p className="mt-2 text-xs text-error">{message}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="text-xs" onClick={onClose}>Cancel</button>
          <button type="button" className="rounded-lg bg-secondary px-3 py-2 text-xs font-semibold text-on-secondary disabled:opacity-40" disabled={!reason.trim()} onClick={() => void save().catch((err: Error) => setMessage(err.message))}>Merge</button>
        </div>
      </div>
    </div>
  );
}
