import { useEffect, useRef, useState } from "react";
import { api } from "../../../services/api";
import { Fp7Markup } from "./markup/Fp7Markup";
import { labelFromFpClick } from "./findPartsDomFill";
import type { FleetCar } from "./CarStep";

export function QuoteDialog({
  part,
  vehicleId,
  cars,
  onClose,
}: {
  part: Record<string, unknown>;
  vehicleId: string | null;
  cars: FleetCar[];
  onClose: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [qty, setQty] = useState(1);
  const [urgency, setUrgency] = useState("normal");
  const [note, setNote] = useState("");
  const [vehicle, setVehicle] = useState(vehicleId || "");
  const [workOrder, setWorkOrder] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const qtyInput = root.querySelector("#qtyInput") as HTMLInputElement | null;
    if (qtyInput) {
      qtyInput.readOnly = false;
      qtyInput.type = "number";
      qtyInput.min = "1";
      qtyInput.max = "24";
      qtyInput.value = String(qty);
      const onInput = () => setQty(Number(qtyInput.value) || 1);
      qtyInput.addEventListener("input", onInput);
      return () => qtyInput.removeEventListener("input", onInput);
    }
    return undefined;
  }, [qty]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.querySelectorAll("textarea").forEach((el) => {
      const area = el as HTMLTextAreaElement;
      area.value = note;
      area.oninput = () => setNote(area.value);
    });
    root.querySelectorAll("select").forEach((el, index) => {
      const sel = el as HTMLSelectElement;
      if (index === 0) {
        sel.value = vehicle;
        sel.onchange = () => setVehicle(sel.value);
      }
    });
  }, [note, vehicle, cars.length]);

  async function send() {
    setError("");
    try {
      const res = await api.requestPartQuoteV2({
        partId: part.id,
        partNumber: part.oem_part_number,
        qty,
        urgency: urgency === "24h" ? "within_24h" : urgency,
        note,
        vehicleId: vehicle || null,
        componentId: part.maintenance_component_id,
        workOrder: workOrder || undefined,
        targetPriceJmd: targetPrice ? Number(targetPrice) : undefined,
      });
      const id = String((res as { item?: { id?: string }; reference?: string }).item?.id || (res as { reference?: string }).reference || "");
      setSent(id.slice(0, 8) || id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send");
    }
  }

  function handleFpClick(detail: { label?: string }) {
    const label = labelFromFpClick(detail);
    if (label.includes("cancel") || label.includes("close") || label.includes("done")) {
      onClose();
      return;
    }
    if (label.includes("24h")) setUrgency("within_24h");
    else if (label.includes("urgent")) setUrgency("urgent");
    else if (label.includes("low")) setUrgency("low");
    else if (label.includes("normal")) setUrgency("normal");
    else if (label.includes("decrease quantity")) setQty((value) => Math.max(1, value - 1));
    else if (label.includes("increase quantity")) setQty((value) => Math.min(24, value + 1));
    else if (label.includes("send") || label.includes("broadcast")) void send();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-inverse-surface/30 p-space-md">
      <div ref={rootRef} className="w-full max-w-4xl">
        {error ? <p className="text-error mb-space-sm">{error}</p> : null}
        {sent ? <p className="mb-space-sm">Reference {sent}</p> : null}
        <Fp7Markup onFpClick={handleFpClick} />
        <input type="hidden" value={workOrder} onChange={(e) => setWorkOrder(e.target.value)} aria-label="Work order" />
        <input type="hidden" value={targetPrice} onChange={(e) => setTargetPrice(e.target.value)} aria-label="Target price" />
      </div>
    </div>
  );
}
