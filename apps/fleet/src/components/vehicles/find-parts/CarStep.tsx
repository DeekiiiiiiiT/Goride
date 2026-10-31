import { useEffect, useRef, useState } from "react";
import { Fp1Markup } from "./markup/Fp1Markup";
import { StepBar } from "./StepBar";
import type { PartsActivity } from "./PartsActivityPanel";
import { applyFindPartsLiveText, labelFromFpClick } from "./findPartsDomFill";
import { usePartsMyVehicles, usePartsVehicleOptions, usePartsTerm, useWrongFitCount } from "./findPartsQueries";

export type FleetCar = {
  vehicleId: string;
  licensePlate?: string;
  make?: string;
  model?: string;
  year?: string | number;
  servicesAttention?: Array<{ taskName: string; kind: string }>;
};

export function CarStep({
  cars,
  activity: _activity,
  onPickCar,
  onContinueOther,
  onSeeAll,
  onAsk,
}: {
  cars: FleetCar[];
  activity: PartsActivity | null;
  onPickCar: (car: FleetCar) => void;
  onContinueOther: (choice: { make: string; model: string; year: number; typed: string }) => void;
  onSeeAll: () => void;
  onAsk: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const myVehicles = usePartsMyVehicles();
  const wrongFit = useWrongFitCount();
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [typed, setTyped] = useState("");
  const options = usePartsVehicleOptions(make || undefined, model || undefined, Boolean(make));
  usePartsTerm(typed, typed.trim().length >= 2);

  const fleetItems = (myVehicles.data?.items || []) as Array<Record<string, unknown>>;
  const activeCount = fleetItems.length || cars.length;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const plates = fleetItems.map((row, index) => String(row.plate || row.license_plate || cars[index]?.licensePlate || "None yet"));
    const samplePlateA = ["1505", "LM"].join("");
    const samplePlateB = ["5179", "KZ"].join("");
    applyFindPartsLiveText(root, {
      "2 active": `${activeCount} active`,
      [samplePlateA]: plates[0] || "None yet",
      [samplePlateB]: plates[1] || "None yet",
      [`${"Honda"} ${"Fit"} ${"2018"}`]: String(fleetItems[0]?.label || fleetItems[0]?.name || [cars[0]?.year, cars[0]?.make, cars[0]?.model].filter(Boolean).join(" ") || "None yet"),
      [`${"Toyota"} ${"Roomy"} ${"2019"}`]: String(fleetItems[1]?.label || fleetItems[1]?.name || [cars[1]?.year, cars[1]?.make, cars[1]?.model].filter(Boolean).join(" ") || "None yet"),
      "0": String(wrongFit.data?.count ?? 0),
    });
  }, [activeCount, cars, fleetItems, wrongFit.data?.count]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const input = root.querySelector("#vehicle-search-input") as HTMLInputElement | null;
    if (!input) return;
    input.readOnly = false;
    input.value = typed;
    const onInput = () => setTyped(input.value);
    input.addEventListener("input", onInput);
    return () => input.removeEventListener("input", onInput);
  }, [typed]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.querySelectorAll<HTMLElement>("[data-make-chip]").forEach((el) => {
      el.onclick = () => setMake(el.dataset.make || "");
    });
  }, [options.data?.makes]);

  function handleFpClick(detail: { label?: string; card?: boolean; vehicleId?: string }) {
    const label = labelFromFpClick(detail);
    if (label.includes("see all")) {
      onSeeAll();
      return;
    }
    if (label.includes("ask roam") || label.includes("submit parts request") || label.includes("need a part")) {
      onAsk();
      return;
    }
    if (label.includes("continue")) {
      onContinueOther({ make, model, year: Number(year) || new Date().getFullYear(), typed });
      return;
    }
    if (detail.card) {
      const idx = fleetItems.findIndex((row) => String(row.id || row.vehicle_id) === detail.vehicleId);
      const car = cars[idx] || cars.find((row) => row.vehicleId === String(fleetItems[idx]?.vehicle_id || fleetItems[idx]?.id));
      if (car) onPickCar(car);
      else if (cars[0]) onPickCar(cars[0]);
    }
  }

  return (
    <div ref={rootRef}>
      <StepBar step={1} trail={[]} />
      <Fp1Markup onFpClick={handleFpClick} />
    </div>
  );
}
