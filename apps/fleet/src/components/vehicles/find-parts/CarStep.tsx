import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../services/api";
import { PartsActivityPanel, type PartsActivity } from "./PartsActivityPanel";

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
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [typed, setTyped] = useState("");
  const makesQuery = useQuery({
    queryKey: ["parts-vehicle-options"],
    queryFn: () => api.partsVehicleOptions({}),
    staleTime: 60_000,
  });
  const modelsQuery = useQuery({
    queryKey: ["parts-vehicle-options", make],
    queryFn: () => api.partsVehicleOptions({ make }),
    enabled: Boolean(make),
  });
  const makes = makesQuery.data?.makes ?? [];
  const models = modelsQuery.data?.models ?? [];
  const years = modelsQuery.data?.years?.length ? modelsQuery.data.years : Array.from({ length: 30 }, (_, index) => new Date().getFullYear() - index);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg w-full items-start find-parts-columns">
      <div className="lg:col-span-8 flex flex-col gap-space-lg">
        <div className="bg-surface-container-lowest rounded-xl p-space-xl shadow-sm flex flex-col">
          <h2 className="font-headline-lg text-headline-lg text-on-surface">Which car is it?</h2>
          <p className="font-body-md text-body-sm text-on-surface-variant mt-0.5">
            Select an active fleet vehicle to match verified inventory or look up parts for any other car.
          </p>
          <div className="flex items-center gap-space-sm mt-space-lg mb-space-xs">
            <span className="font-caption text-caption tracking-wider text-on-surface-variant uppercase font-semibold">My Vehicles (in fleet)</span>
            <span className="px-space-xs py-0.5 rounded bg-surface-container-high font-label-code text-caption text-on-surface">{cars.length} active</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
            {cars.map((car) => {
              const due = car.servicesAttention?.[0]?.taskName;
              return (
                <button
                  key={car.vehicleId}
                  type="button"
                  className="vehicle-select-card group bg-surface-container-low hover:bg-surface-container p-space-lg rounded-xl cursor-pointer text-left flex flex-col justify-between shadow-sm"
                  onClick={() => onPickCar(car)}
                >
                  <div className="flex items-center justify-between gap-space-sm mb-space-md">
                    <div className="w-9 h-9 rounded-lg bg-surface-container-highest flex items-center justify-center text-on-surface">
                      <span className="material-symbols-outlined text-[20px]">directions_car</span>
                    </div>
                    <div className="bg-surface-container-lowest px-space-sm py-0.5 rounded shadow-sm flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-on-surface" />
                      <span className="font-label-plate text-label-plate text-on-surface tracking-widest">{car.licensePlate || "No plate"}</span>
                    </div>
                  </div>
                  <div className="font-headline-sm text-headline-sm text-on-surface">{[car.make, car.model, car.year].filter(Boolean).join(" ")}</div>
                  <div className="mt-space-lg pt-space-md flex flex-col items-start gap-space-sm">
                    {due ? (
                      <span className="inline-flex items-center px-space-xs py-0.5 rounded bg-surface-container-highest font-caption text-caption text-on-surface-variant">
                        Service due: {due}
                      </span>
                    ) : null}
                    <span className="flex items-center justify-between text-on-surface font-body-sm text-caption font-semibold">
                      Select vehicle
                      <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="relative flex items-center justify-center my-space-lg">
            <div className="w-full h-px bg-surface-container-high" />
            <span className="absolute bg-surface-container-lowest px-space-md font-caption text-caption uppercase text-on-surface-variant">or another car</span>
          </div>
          <form
            className="flex flex-col gap-space-md bg-surface-container-low p-space-lg rounded-xl"
            onSubmit={(event) => {
              event.preventDefault();
              onContinueOther({ make, model, year: Number(year), typed });
            }}
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">
              <label className="flex flex-col">
                <span className="font-caption text-caption uppercase text-on-surface-variant mb-1">Make</span>
                <select className="w-full h-10 px-space-md bg-surface-container-lowest rounded-lg" value={make} onChange={(event) => { setMake(event.target.value); setModel(""); }}>
                  <option value="">Choose</option>
                  {makes.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label className="flex flex-col">
                <span className="font-caption text-caption uppercase text-on-surface-variant mb-1">Model</span>
                <select className="w-full h-10 px-space-md bg-surface-container-lowest rounded-lg" value={model} onChange={(event) => setModel(event.target.value)}>
                  <option value="">Choose</option>
                  {models.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label className="flex flex-col">
                <span className="font-caption text-caption uppercase text-on-surface-variant mb-1">Year</span>
                <select className="w-full h-10 px-space-md bg-surface-container-lowest rounded-lg" value={year} onChange={(event) => setYear(event.target.value)}>
                  <option value="">Choose</option>
                  {years.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
            </div>
            <label className="font-caption text-caption text-on-surface-variant">Or type vehicle / VIN:</label>
            <input className="w-full h-10 px-space-md bg-surface-container-lowest rounded-lg" value={typed} onChange={(event) => setTyped(event.target.value)} placeholder="Type a plate from your fleet, or make, model and year." />
            <p className="font-body-sm text-caption text-on-surface-variant">Type a plate from your fleet, or make, model and year.</p>
            <button type="submit" className="inline-flex items-center justify-center gap-space-xs bg-primary text-on-primary px-space-xl py-2.5 rounded-lg font-semibold">
              Continue <span className="material-symbols-outlined">arrow_forward</span>
            </button>
          </form>
        </div>
      </div>
      <PartsActivityPanel activity={activity} onSeeAll={onSeeAll} onAsk={onAsk} />
    </div>
  );
}

