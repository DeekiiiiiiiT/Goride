import { useState } from "react";
import { StepBar } from "./StepBar";
import type { PartsActivity } from "./PartsActivityPanel";
import { PartsActivityPanel } from "./PartsActivityPanel";
import { usePartsMyVehicles, usePartsVehicleOptions, usePartsTerm, useWrongFitCount } from "./findPartsQueries";
import type { PartsMyVehicleRow } from "./findPartsTypes";

export type FleetCar = {
  vehicleId: string;
  licensePlate?: string;
  make?: string;
  model?: string;
  year?: string | number;
  servicesAttention?: Array<{ taskName: string; kind: string }>;
};

function vehicleKey(row: PartsMyVehicleRow, index: number, cars: FleetCar[]) {
  return String(row.vehicle_id || row.id || cars[index]?.vehicleId || index);
}

function vehicleLabel(row: PartsMyVehicleRow, car?: FleetCar) {
  return String(row.label || row.name || [car?.year, car?.make, car?.model].filter(Boolean).join(" ") || "None yet");
}

function vehiclePlate(row: PartsMyVehicleRow, car?: FleetCar) {
  return String(row.plate || row.license_plate || car?.licensePlate || "—");
}

export function CarStep({
  cars,
  activity,
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
  const myVehicles = usePartsMyVehicles();
  const wrongFit = useWrongFitCount();
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [typed, setTyped] = useState("");
  const options = usePartsVehicleOptions(make || undefined, model || undefined, Boolean(make));
  const term = usePartsTerm(typed, typed.trim().length >= 2);

  const fleetItems = (myVehicles.data?.items || []) as PartsMyVehicleRow[];
  const rows = fleetItems.length > 0
    ? fleetItems.map((row, index) => ({ row, car: cars.find((c) => c.vehicleId === vehicleKey(row, index, cars)) || cars[index] }))
    : cars.map((car) => ({ row: {} as PartsMyVehicleRow, car }));

  const activeCount = rows.length;
  const makes = options.data?.makes?.length ? options.data.makes : [];
  const models = options.data?.models?.length ? options.data.models : [];
  const years = options.data?.years?.length ? options.data.years.map(String) : ["2016", "2017", "2018", "2019", "2020"];

  function pickRow(index: number) {
    const { row, car } = rows[index];
    if (car) {
      onPickCar(car);
      return;
    }
    const id = vehicleKey(row, index, cars);
    onPickCar({
      vehicleId: id,
      licensePlate: vehiclePlate(row, car),
      make: String(row.make || ""),
      model: String(row.model || ""),
      year: row.year as string | number | undefined,
    });
  }

  return (
    <div className="w-full">
      <StepBar step={1} trail={[]} />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg w-full items-start">
        <div className="lg:col-span-8 flex flex-col gap-space-lg">
          <div className="bg-surface-container-lowest rounded-xl p-space-xl shadow-sm flex flex-col">
            <div className="flex flex-col mb-space-lg">
              <h2 className="font-headline-lg text-headline-lg text-on-surface">Which car is it?</h2>
              <p className="font-body-md text-body-sm text-on-surface-variant mt-0.5">
                Select an active fleet vehicle to match verified inventory or look up parts for any other car.
              </p>
            </div>
            <div className="flex flex-col mb-space-lg">
              <div className="flex items-center justify-between mb-space-xs">
                <div className="flex items-center gap-space-sm">
                  <span className="font-caption text-caption tracking-wider text-on-surface-variant uppercase font-semibold">My Vehicles (in fleet)</span>
                  <span className="px-space-xs py-0.5 rounded bg-surface-container-high font-label-code text-caption text-on-surface">{activeCount} active</span>
                </div>
              </div>
              <p className="font-body-sm text-caption text-on-surface-variant mb-space-md">
                Clicking your vehicle skips straight to parts — specs and engine trims are already verified.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md" id="fleet-vehicle-grid">
                {rows.length === 0 ? (
                  <p className="font-body-sm text-body-sm text-on-surface-variant">None yet</p>
                ) : rows.map(({ row, car }, index) => (
                  <button
                    key={vehicleKey(row, index, cars)}
                    type="button"
                    className="vehicle-select-card group bg-surface-container-low hover:bg-surface-container p-space-lg rounded-xl cursor-pointer transition-all flex flex-col justify-between shadow-sm relative overflow-hidden text-left"
                    onClick={() => pickRow(index)}
                  >
                    <div className="flex flex-col">
                      <div className="flex items-center justify-between gap-space-sm mb-space-md">
                        <div className="w-9 h-9 rounded-lg bg-surface-container-highest flex items-center justify-center text-on-surface group-hover:bg-primary group-hover:text-on-primary transition-colors">
                          <span className="material-symbols-outlined text-[20px]">directions_car</span>
                        </div>
                        <div className="bg-surface-container-lowest px-space-sm py-0.5 rounded shadow-sm flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-on-surface" />
                          <span className="font-label-plate text-label-plate text-on-surface tracking-widest">{vehiclePlate(row, car)}</span>
                        </div>
                      </div>
                      <div className="font-headline-sm text-headline-sm text-on-surface group-hover:text-primary transition-colors">
                        {vehicleLabel(row, car)}
                      </div>
                      <div className="font-label-code text-caption text-on-surface-variant mt-0.5">
                        {String(row.subtitle || "Verified specs on file")}
                      </div>
                    </div>
                    <div className="mt-space-lg pt-space-md flex flex-col gap-space-sm">
                      <div className="flex flex-wrap items-center gap-space-xs">
                        <span className="inline-flex items-center gap-1 px-space-xs py-0.5 rounded bg-surface-container-lowest font-caption text-caption text-on-surface shadow-xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                          Verified specs
                        </span>
                        <span className="inline-flex items-center gap-1 px-space-xs py-0.5 rounded bg-surface-container-highest font-caption text-caption text-on-surface-variant">
                          {Number(row.parts_on_shelf ?? 0)} parts on shelf
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-on-surface font-body-sm text-caption font-semibold mt-1">
                        <span>Select vehicle</span>
                        <span className="material-symbols-outlined text-[16px] group-hover:translate-x-1 transition-transform">arrow_forward</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div className="relative flex items-center justify-center my-space-lg">
              <div className="w-full h-px bg-surface-container-high" />
              <span className="absolute bg-surface-container-lowest px-space-md font-caption text-caption uppercase text-on-surface-variant tracking-wider font-semibold">or another car</span>
            </div>
            <div className="flex flex-col gap-space-md bg-surface-container-low p-space-lg rounded-xl">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">
                <SelectField label="Make" id="select-make" value={make} onChange={setMake} options={makes} />
                <SelectField label="Model" id="select-model" value={model} onChange={setModel} options={models.length ? models : ["—"]} disabled={!make} />
                <SelectField label="Year" id="select-year" value={year} onChange={setYear} options={years} disabled={!model} />
              </div>
              <div className="flex flex-col mt-space-xs">
                <span className="font-caption text-caption text-on-surface-variant font-medium mb-1.5">Or type vehicle / VIN:</span>
                <div className="relative flex items-center w-full">
                  <span className="material-symbols-outlined absolute left-3 text-on-surface-variant text-[20px]">search</span>
                  <input
                    className="w-full h-10 pl-10 pr-10 bg-surface-container-lowest rounded-lg font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none shadow-xs"
                    id="vehicle-search-input"
                    placeholder="Plate, chassis serial, or make and model"
                    type="text"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                  />
                  {typed ? (
                    <button className="absolute right-2.5 text-on-surface-variant hover:text-on-surface transition-colors flex items-center justify-center p-1 rounded" type="button" onClick={() => setTyped("")} aria-label="Clear search">
                      <span className="material-symbols-outlined text-[16px]">close</span>
                    </button>
                  ) : null}
                </div>
                {term.data?.hits?.length ? (
                  <ul className="mt-2 flex flex-col gap-1">
                    {term.data.hits.slice(0, 5).map((hit: { label: string }) => (
                      <li key={hit.label}>
                        <button type="button" className="text-left font-body-sm text-body-sm text-primary hover:underline" onClick={() => setTyped(hit.label)}>
                          {hit.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <span className="font-body-sm text-caption text-on-surface-variant mt-1.5">
                  Tip: You can also paste Jamaican registration, chassis serial, or JDM model codes.
                </span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-md mt-space-sm pt-space-md">
                <button
                  className="inline-flex items-center justify-center gap-space-xs bg-primary text-on-primary px-space-xl py-2.5 rounded-lg font-body-sm text-body-sm font-semibold hover:bg-surface-tint transition-colors shadow-sm"
                  type="button"
                  onClick={() => onContinueOther({ make, model, year: Number(year) || new Date().getFullYear(), typed })}
                >
                  <span>Continue</span>
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </button>
                <div className="font-body-sm text-caption text-on-surface-variant flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">info</span>
                  <span>Next: We&apos;ll verify engine version if needed</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <PartsActivityPanel activity={activity} onSeeAll={onSeeAll} onAsk={onAsk} />
        <div className="lg:col-span-12">
          <div className="bg-surface-container rounded-xl p-space-md flex items-start gap-space-md shadow-xs">
            <div className="w-8 h-8 rounded-lg bg-surface-container-highest flex items-center justify-center text-on-surface shrink-0">
              <span className="material-symbols-outlined text-[18px]">verified</span>
            </div>
            <div className="flex flex-col">
              <span className="font-headline-sm text-caption text-on-surface uppercase tracking-wider font-semibold">Zero-Fitment Error Guarantee</span>
              <p className="font-body-sm text-caption text-on-surface-variant mt-0.5">
                Every part cataloged is verified against Jamaican road conditions and the chassis code on your fitness certificate.
                Wrong-fit reports in the last {wrongFit.data?.days ?? 30} days: {wrongFit.data?.count ?? 0}.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SelectField({
  label,
  id,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <label className="font-caption text-caption uppercase tracking-wider text-on-surface-variant mb-1 font-semibold" htmlFor={id}>{label}</label>
      <div className="relative bg-surface-container-lowest rounded-lg shadow-xs">
        <select
          className="w-full h-10 px-space-md bg-transparent appearance-none font-body-sm text-body-sm text-on-surface cursor-pointer focus:outline-none disabled:opacity-50"
          id={id}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Select…</option>
          {options.map((opt) => (
            <option key={opt} value={opt === "—" ? "" : opt}>{opt}</option>
          ))}
        </select>
        <span className="material-symbols-outlined absolute right-2.5 top-2.5 text-on-surface-variant pointer-events-none text-[20px]">expand_more</span>
      </div>
    </div>
  );
}
