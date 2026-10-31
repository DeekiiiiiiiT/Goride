import { useEffect, useRef, useState } from "react";
import { api } from "../../../services/api";
import { Fp8Markup } from "./markup/Fp8Markup";
import { StepBar } from "./StepBar";
import { labelFromFpClick } from "./findPartsDomFill";
import { usePartsActivity, usePartsRunnerOnline, useWrongFitCount } from "./findPartsQueries";

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
  const rootRef = useRef<HTMLDivElement>(null);
  const runner = usePartsRunnerOnline();
  const activity = usePartsActivity();
  useWrongFitCount();
  const [qty, setQty] = useState(1);
  const [urgency, setUrgency] = useState("normal");
  const [note, setNote] = useState("");
  const [sent, setSent] = useState("");

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (carLabel) root.querySelectorAll("h2, .font-headline-md").forEach((el) => {
      if (el.textContent?.includes("Fit")) el.textContent = carLabel;
    });
    if (plate) root.querySelectorAll(".font-label-plate").forEach((el) => { el.textContent = plate; });
  }, [carLabel, plate]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.querySelectorAll("textarea").forEach((el) => {
      const area = el as HTMLTextAreaElement;
      area.value = note;
      area.oninput = () => setNote(area.value);
    });
    const qtyInput = root.querySelector('input[type="number"]') as HTMLInputElement | null;
    if (qtyInput) {
      qtyInput.value = String(qty);
      qtyInput.oninput = () => setQty(Number(qtyInput.value) || 1);
    }
  }, [note, qty]);

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

  function handleFpClick(detail: { label?: string }) {
    const label = labelFromFpClick(detail);
    if (label.includes("back")) {
      onBack();
      return;
    }
    if (label.includes("reset filters")) {
      onBack();
      return;
    }
    if (label.includes("activity ledger")) {
      onViewActivity();
      return;
    }
    if (label.includes("24h")) setUrgency("within_24h");
    else if (label.includes("urgent")) setUrgency("urgent");
    else if (label.includes("low")) setUrgency("low");
    else if (label.includes("normal")) setUrgency("normal");
    else if (label.includes("ask roam")) void submit().catch(() => undefined);
  }

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.querySelectorAll("span, div").forEach((el) => {
      if (el.textContent === "PARTS RUNNER ONLINE" && runner.data) {
        el.textContent = runner.data.online ? "PARTS RUNNER ONLINE" : "PARTS RUNNER OFFLINE";
      }
    });
  }, [runner.data]);

  return (
    <div ref={rootRef}>
      <StepBar step={3} trail={[]} />
      {sent ? <p className="mb-space-md">Ticket {sent}</p> : null}
      <p className="font-body-sm text-body-sm text-on-surface mb-space-sm">parts runner online (kmtr-dispatch)</p>
      <Fp8Markup onFpClick={handleFpClick} />
      <input
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          void api.uploadPartRequestPhoto(file).then((res) => submit(res.photo_url)).catch(() => undefined);
        }}
      />
    </div>
  );
}
