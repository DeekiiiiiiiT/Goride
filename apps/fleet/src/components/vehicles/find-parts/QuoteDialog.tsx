import { useEffect, useId, useState } from "react";
import { api } from "../../../services/api";
import { Fp7Screen } from "./screens/Fp7Screen";
import { fpButtonIs } from "./findPartsButton";
import { buildFindPartsScreenData } from "./findPartsScreenData";
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
  const [qty, setQty] = useState(1);
  const [urgency, setUrgency] = useState("normal");
  const [note, setNote] = useState("");
  const [vehicle, setVehicle] = useState(vehicleId || "");
  const [workOrder, setWorkOrder] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");
  const qtyInputId = useId();
  const car = cars.find((row) => row.vehicleId === vehicle);
  const data = buildFindPartsScreenData({
    plate: car?.licensePlate || "—",
    vehicleLabel: car ? [car.year, car.make, car.model].filter(Boolean).join(" ") : "Vehicle",
    quoteRef: sent || "—",
  });

  useEffect(() => {
    if (!vehicleId && cars[0]) setVehicle(cars[0].vehicleId);
  }, [vehicleId, cars]);

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

  function onButton(label: string) {
    if (fpButtonIs(label, "cancel", "close", "done")) {
      onClose();
      return;
    }
    if (fpButtonIs(label, "24h", "within 24")) setUrgency("within_24h");
    else if (fpButtonIs(label, "urgent")) setUrgency("urgent");
    else if (fpButtonIs(label, "low")) setUrgency("low");
    else if (fpButtonIs(label, "normal")) setUrgency("normal");
    else if (fpButtonIs(label, "decrease quantity")) setQty((value) => Math.max(1, value - 1));
    else if (fpButtonIs(label, "increase quantity")) setQty((value) => Math.min(24, value + 1));
    else if (fpButtonIs(label, "send", "broadcast")) void send();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-inverse-surface/30 p-space-md">
      <div className="w-full max-w-4xl">
        {error ? <p className="text-error mb-space-sm">{error}</p> : null}
        {sent ? <p className="mb-space-sm">Reference {sent}</p> : null}
        <label className="sr-only" htmlFor={qtyInputId}>Quantity</label>
        <input
          id="qtyInput"
          className="sr-only"
          type="number"
          min={1}
          max={24}
          value={qty}
          onChange={(e) => setQty(Number(e.target.value) || 1)}
        />
        <textarea className="sr-only" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
        <select className="sr-only" value={vehicle} onChange={(e) => setVehicle(e.target.value)} aria-label="Vehicle">
          {cars.map((row) => (
            <option key={row.vehicleId} value={row.vehicleId}>{row.licensePlate || row.vehicleId}</option>
          ))}
        </select>
        <input type="text" className="sr-only" value={workOrder} onChange={(e) => setWorkOrder(e.target.value)} aria-label="Work order" />
        <input type="text" className="sr-only" value={targetPrice} onChange={(e) => setTargetPrice(e.target.value)} aria-label="Target price" />
        <Fp7Screen actions={{ onButton }} data={data} />
      </div>
    </div>
  );
}
