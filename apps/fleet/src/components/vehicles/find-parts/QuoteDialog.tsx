import { useEffect, useState } from "react";
import { api } from "../../../services/api";
import { Fp7Screen } from "./screens/Fp7Screen";
import { buildFp7ViewModel } from "./findPartsViewModels";
import type { FleetCar } from "./CarStep";
import { usePartsActivity } from "./findPartsQueries";

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
  const car = cars.find((row) => row.vehicleId === vehicle);
  const activity = usePartsActivity(true);
  const pendingQuotes = (activity.data?.quotes?.items || []).length;
  const offers = (part.offers as Array<{ supplier_name?: string; landedCostJmd?: number }> | undefined) || [];
  const data = buildFp7ViewModel({
    part,
    plate: car?.licensePlate || "—",
    vehicleLabel: car ? [car.year, car.make, car.model].filter(Boolean).join(" ") : "Vehicle",
    quoteRef: sent || "—",
    offers,
    stockQty: Number(part.stockQty || 0),
    pendingQuoteCount: pendingQuotes,
    trimLabel: String(part.trimLabel || part.variant || ""),
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

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-inverse-surface/30 p-space-md">
      <div className="w-full max-w-4xl">
        {error ? <p className="text-error mb-space-sm">{error}</p> : null}
        <Fp7Screen
          data={data}
          form={{
            qty,
            note,
            vehicle,
            workOrder,
            targetPrice,
            urgency,
            sent,
            cars,
          }}
          actions={{
            onClose,
            onDone: onClose,
            onViewActivity: onClose,
            onDecQty: () => setQty((value) => Math.max(1, value - 1)),
            onIncQty: () => setQty((value) => Math.min(24, value + 1)),
            onQtyChange: (value) => setQty(value),
            onNoteChange: setNote,
            onVehicleChange: setVehicle,
            onWorkOrderChange: setWorkOrder,
            onTargetPriceChange: setTargetPrice,
            onUrgency: setUrgency,
            onSend: () => { void send(); },
            onCancel: onClose,
          }}
        />
      </div>
    </div>
  );
}
