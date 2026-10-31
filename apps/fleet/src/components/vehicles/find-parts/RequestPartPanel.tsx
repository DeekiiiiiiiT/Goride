import { useId, useState } from "react";
import { api } from "../../../services/api";
import { Fp8Screen } from "./screens/Fp8Screen";
import { StepBar } from "./StepBar";
import { fpButtonIs } from "./findPartsButton";
import { buildFindPartsScreenData } from "./findPartsScreenData";
import { usePartsRunnerOnline } from "./findPartsQueries";

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
  const runner = usePartsRunnerOnline();
  const [qty, setQty] = useState(1);
  const [urgency, setUrgency] = useState("normal");
  const [note, setNote] = useState("");
  const [sent, setSent] = useState("");
  const photoInputId = useId();
  const data = buildFindPartsScreenData({ plate, vehicleLabel: carLabel || "Vehicle" });

  async function submit(photoUrl?: string) {
    const res = await api.requestFindPart({
      vehicleId,
      componentId: componentId || undefined,
      partName: partName || undefined,
      qty,
      urgency: urgency === "24h" ? "within_24h" : urgency,
      note,
      photo_url: photoUrl,
    });
    setSent(String((res as { item?: { id?: string } }).item?.id || "").slice(0, 8));
  }

  function onButton(label: string) {
    if (fpButtonIs(label, "back", "reset filters")) {
      onBack();
      return;
    }
    if (fpButtonIs(label, "activity ledger", "view in activity")) {
      onViewActivity();
      return;
    }
    if (fpButtonIs(label, "24h", "within 24")) setUrgency("within_24h");
    else if (fpButtonIs(label, "urgent")) setUrgency("urgent");
    else if (fpButtonIs(label, "low")) setUrgency("low");
    else if (fpButtonIs(label, "normal")) setUrgency("normal");
    else if (fpButtonIs(label, "ask roam", "send request", "submit")) void submit().catch(() => undefined);
  }

  return (
    <div>
      <StepBar step={3} trail={[]} />
      {sent ? <p className="mb-space-md">Ticket {sent}</p> : null}
      <p className="font-body-sm text-body-sm text-on-surface mb-space-sm">
        {runner.data?.online ? "PARTS RUNNER ONLINE" : "PARTS RUNNER OFFLINE"} (kmtr-dispatch)
      </p>
      <label htmlFor={photoInputId} className="mb-space-md inline-flex cursor-pointer items-center gap-2 rounded-lg border border-outline-variant px-space-md py-space-sm font-body-sm text-body-sm">
        <span className="material-symbols-outlined text-[18px]">add_a_photo</span>
        <span>Add photo</span>
        <input
          id={photoInputId}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            void api.uploadPartRequestPhoto(file).then((res) => submit(res.photo_url)).catch(() => undefined);
          }}
        />
      </label>
      <textarea className="sr-only" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Request note" />
      <input className="sr-only" type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value) || 1)} aria-label="Quantity" />
      <Fp8Screen actions={{ onButton }} data={data} />
    </div>
  );
}
