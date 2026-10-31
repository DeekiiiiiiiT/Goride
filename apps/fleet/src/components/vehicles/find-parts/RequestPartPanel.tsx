import { useState } from "react";
import { api } from "../../../services/api";

export function RequestPartPanel({
  vehicleId,
  carLabel,
  plate,
  componentId,
  partName,
  onBack,
  onViewActivity,
}: {
  vehicleId: string | null;
  carLabel: string;
  plate: string;
  componentId: string;
  partName: string;
  onBack: () => void;
  onViewActivity: () => void;
}) {
  const [qty, setQty] = useState(1);
  const [urgency, setUrgency] = useState("normal");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState("");
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");
  const need = [partName || (componentId ? "Part" : ""), carLabel].filter(Boolean).join(" · ");

  async function send() {
    setError("");
    try {
      const res = await api.requestFindPart({
        vehicleId,
        needText: need || note || "Part request",
        qty,
        urgency,
        maintenanceComponentId: componentId || null,
        photoUrl: photo || null,
      });
      setSent(String(res.item?.id || "").slice(0, 8));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send");
    }
  }

  if (sent) {
    return (
      <div className="bg-surface-container-lowest rounded-xl p-space-xl">
        <p>Request sent to Roam. Reference {sent}.</p>
        <button type="button" onClick={onViewActivity}>View in Your parts activity →</button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
      <div className="lg:col-span-8 bg-surface-container-lowest rounded-xl p-space-xl">
        <h2 className="text-headline-lg">We don't have this part for this car on file yet.</h2>
        <p className="mt-space-md">{need}</p>
        <label className="block mt-space-md">Quantity needed
          <input type="number" min={1} value={qty} onChange={(event) => setQty(Number(event.target.value))} />
        </label>
        <label className="block mt-space-md">Urgency
          <select value={urgency} onChange={(event) => setUrgency(event.target.value)}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="urgent">Urgent</option>
          </select>
        </label>
        <label className="block mt-space-md">Note
          <textarea maxLength={140} value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        <label className="block mt-space-md">
          A photo of the old part helps us match it.
          <input type="file" accept="image/*" onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            void api.uploadPartRequestPhoto(file).then((res) => setPhoto(res.photo_url)).catch(() => setError("Could not upload the photo"));
          }} />
        </label>
        {error ? <p>{error}</p> : null}
        <button type="button" className="mt-space-lg bg-primary text-on-primary px-space-lg py-2 rounded-lg" onClick={() => void send()}>Ask Roam to find it</button>
        <button type="button" className="ml-space-md" onClick={onBack}>Search a different part</button>
      </div>
      {vehicleId ? (
        <aside className="lg:col-span-4 bg-surface-container-low rounded-xl p-space-lg">
          <div>{plate}</div>
          <div>{carLabel}</div>
        </aside>
      ) : null}
      <div>
        <h3>What happens next?</h3>
        <p>Roam looks for the part.</p>
        <p>Prices show in Your parts activity.</p>
      </div>
    </div>
  );
}
