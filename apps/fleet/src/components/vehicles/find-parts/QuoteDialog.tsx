import { useState } from "react";
import { api } from "../../../services/api";
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
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");

  async function send() {
    setError("");
    try {
      const res = await api.requestPartQuoteV2({
        partId: part.id,
        partNumber: part.oem_part_number,
        qty,
        urgency,
        note,
        vehicleId: vehicle || null,
        componentId: part.maintenance_component_id,
      });
      const id = String(res.item?.id || "");
      setSent(id.slice(0, 8));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-inverse-surface/30 p-space-md">
      <div className="find-parts-sheet bg-surface-container-lowest rounded-xl max-w-md w-full p-space-xl max-h-[100dvh] overflow-y-auto">
        <h2 className="text-headline-lg">Request a quote</h2>
        <p>{String(part.name || part.oem_part_number || "Part")}</p>
        {sent ? (
          <div>
            <p>Quote requested</p>
            <p>Reference {sent}</p>
            <button type="button" onClick={onClose}>Done</button>
          </div>
        ) : (
          <>
            <label className="block mt-space-md">Quantity needed<input type="number" min={1} value={qty} onChange={(event) => setQty(Number(event.target.value))} className="block h-10 px-space-md bg-surface-container-low rounded-lg" /></label>
            <p>MIN: 1</p>
            <label className="block mt-space-md">Urgency
              <select value={urgency} onChange={(event) => setUrgency(event.target.value)} className="block h-10 px-space-md bg-surface-container-low rounded-lg">
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
            <label className="block mt-space-md">Assign to vehicle
              <select value={vehicle} onChange={(event) => setVehicle(event.target.value)} className="block h-10">
                <option value="">Another car</option>
                {cars.map((car) => <option key={car.vehicleId} value={car.vehicleId}>{car.licensePlate}</option>)}
              </select>
            </label>
            <label className="block mt-space-md">Note
              <textarea maxLength={140} value={note} onChange={(event) => setNote(event.target.value)} className="block w-full bg-surface-container-low rounded-lg p-space-sm" />
            </label>
            <p>{note.length}/140</p>
            {error ? <p>{error}</p> : null}
            <div className="flex gap-space-sm mt-space-lg">
              <button type="button" onClick={onClose}>Cancel</button>
              <button type="button" className="bg-primary text-on-primary px-space-lg py-2 rounded-lg" onClick={() => void send()}>Send request</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
