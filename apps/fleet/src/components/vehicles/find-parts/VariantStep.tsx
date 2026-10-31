import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../services/api";
import type { FleetCar } from "./CarStep";

type Candidate = { id: string; plainLabel: string; codeLine?: string };
type VariantRow = {
  id?: string;
  engine_code?: string | null;
  transmission?: string | null;
  drivetrain?: string | null;
  generation?: string | null;
  body_type?: string | null;
};

export function VariantStep({
  make,
  model,
  year,
  cars,
  onBack,
  onPick,
  onAskAdd,
}: {
  make: string;
  model: string;
  year: number | null;
  cars: FleetCar[];
  onBack: () => void;
  onPick: (variantId: string) => void;
  onAskAdd: () => Promise<void>;
}) {
  const query = useQuery({
    queryKey: ["parts-find-variants", make, model, year],
    queryFn: () => api.findParts({ make, model, year: String(year || "") }),
    enabled: Boolean(make && model && year),
  });
  const candidates = (query.data?.candidates || []) as Candidate[];
  const variants = (query.data?.variants || []) as VariantRow[];
  const same = cars.filter((car) =>
    (car.make || "").toLowerCase() === make.toLowerCase()
    && (car.model || "").toLowerCase() === model.toLowerCase(),
  );
  const engines = [...new Set(variants.map((row) => row.engine_code).filter(Boolean))];
  const [asked, setAsked] = useState(false);

  if (query.isLoading) return <p>Finding parts…</p>;
  if (query.isError) {
    return (
      <div>
        <p>Could not load parts. Nothing was changed.</p>
        <button type="button" onClick={() => query.refetch()}>Retry</button>
      </div>
    );
  }
  if (!candidates.length) {
    return (
      <div className="bg-surface-container-lowest rounded-xl p-space-xl shadow-sm">
        <h2 className="font-headline-lg text-headline-lg text-on-surface">We don't have the {year} {make} {model} in our car list yet.</h2>
        <div className="flex flex-wrap gap-space-md mt-space-lg">
          <button type="button" className="bg-primary text-on-primary px-space-xl py-2.5 rounded-lg font-semibold" onClick={() => { void onAskAdd().then(() => setAsked(true)); }}>Ask Roam to add it</button>
          {asked ? <p className="w-full">Asked Roam to add this car.</p> : null}
          <button type="button" className="bg-surface-container-low px-space-lg py-2 rounded-lg" onClick={onBack}>Select another vehicle</button>
        </div>
      </div>
    );
  }

  const radar = variants[0];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
      <div className="lg:col-span-8 bg-surface-container-lowest rounded-xl p-space-xl shadow-sm">
        <h2 className="font-headline-lg text-headline-lg text-on-surface">Which {year} {make} {model} is it?</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md mt-space-lg">
          {candidates.map((row) => (
            <button key={row.id} type="button" className="bg-surface-container-low hover:bg-surface-container p-space-lg rounded-xl text-left" onClick={() => onPick(row.id)}>
              <div className="font-headline-sm text-headline-sm text-on-surface">{row.plainLabel}</div>
              {row.codeLine ? <div className="font-label-code text-caption text-on-surface-variant mt-1">{row.codeLine}</div> : null}
            </button>
          ))}
          <button type="button" className="bg-surface-container p-space-lg rounded-xl text-left" onClick={() => onPick("any")}>Not sure</button>
        </div>
        <p className="font-body-sm text-caption text-on-surface-variant mt-space-md">Pick the version that matches your papers.</p>
        <div className="flex gap-space-md mt-space-lg">
          <button type="button" onClick={onBack}>Back</button>
          <button type="button" className="bg-primary text-on-primary px-space-lg py-2 rounded-lg font-semibold" onClick={() => onPick(candidates[0]?.id || "any")}>Continue</button>
        </div>
      </div>
      <div className="lg:col-span-4 flex flex-col gap-space-lg">
        {same.length ? (
          <aside className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm">
            <h3 className="font-headline-sm text-headline-sm">In your fleet</h3>
            <p className="font-body-sm text-caption text-on-surface-variant mt-1">{same.length} of your vehicles are this model</p>
            <ul className="mt-space-md flex flex-col gap-space-sm">
              {same.map((car) => (
                <li key={car.vehicleId} className="font-label-plate text-label-plate">{car.licensePlate || "No plate"}</li>
              ))}
            </ul>
          </aside>
        ) : null}
        {radar ? (
          <aside className="bg-surface-container-low rounded-xl p-space-lg">
            <h3 className="font-headline-sm text-body-md">Fit</h3>
            {radar.engine_code ? <p>Engine {radar.engine_code}</p> : null}
            {radar.transmission ? <p>Transmission {radar.transmission}</p> : null}
            {radar.drivetrain ? <p>Drive {radar.drivetrain}</p> : null}
            {radar.generation ? <p>Generation {radar.generation}</p> : null}
            {radar.body_type ? <p>Body {radar.body_type}</p> : null}
          </aside>
        ) : null}
        <aside className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm">
          <h3 className="font-headline-sm text-headline-sm">Where to find it on your papers</h3>
          <p className="font-body-sm text-caption text-on-surface-variant mt-space-sm">The version is on the TAJ fitness certificate, and the chassis prefix is stamped on the car.</p>
          {engines.length ? <p className="font-label-code text-caption mt-space-sm">Engine codes: {engines.join(", ")}</p> : null}
        </aside>
      </div>
    </div>
  );
}
