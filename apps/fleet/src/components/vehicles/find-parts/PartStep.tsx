import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../../services/api";

type Browse = {
  systems: Array<{ id: string; plainName: string; components: Array<{ id: string; plainName: string; positionAware: boolean }> }>;
  common: Array<{ id: string; plainName: string }>;
};
type Symptoms = { symptoms: Array<{ id: string; label: string; hint: string | null; components: Array<{ componentId: string }> }> };

export function PartStep({
  vehicleId,
  onBack,
  onPick,
  onSkip,
}: {
  vehicleId: string;
  onBack: () => void;
  onPick: (id: string, positionAware: boolean, name: string) => void;
  onSkip: () => void;
}) {
  const [q, setQ] = useState("");
  const [openArea, setOpenArea] = useState("");
  const browse = useQuery({ queryKey: ["parts-browse"], queryFn: () => api.partsBrowse() as Promise<Browse> });
  const symptoms = useQuery({ queryKey: ["parts-symptoms"], queryFn: () => api.partsSymptoms() as Promise<Symptoms> });
  const term = useQuery({
    queryKey: ["parts-term", q],
    queryFn: () => api.partsTerm(q),
    enabled: q.trim().length >= 2,
  });
  const context = useQuery({
    queryKey: ["parts-vehicle-context", vehicleId],
    queryFn: () => api.partsVehicleContext(vehicleId),
    enabled: Boolean(vehicleId),
  });
  const due = (context.data?.due || []) as Array<{ componentId: string | null; name: string; kind?: string }>;
  const positionAware = (id: string) =>
    (browse.data?.systems || []).some((system) => system.components.some((row) => row.id === id && row.positionAware));
  const suggestions = (term.data?.components || []) as Array<{ id: string; plainName: string }>;

  return (
    <div className="bg-surface-container-lowest rounded-xl p-space-xl shadow-sm">
      <h2 className="font-headline-lg text-headline-lg text-on-surface">What part do you need?</h2>
      <input
        className="w-full h-11 mt-space-md px-space-md bg-surface-container-low rounded-lg"
        value={q}
        onChange={(event) => setQ(event.target.value)}
        placeholder="Search"
      />
      {suggestions.length ? (
        <div className="mt-space-sm flex flex-col">
          {suggestions.map((row) => (
            <button key={row.id} type="button" className="text-left py-2 hover:bg-surface-container-low rounded px-space-sm" onClick={() => onPick(row.id, false, row.plainName)}>
              {row.plainName}
            </button>
          ))}
        </div>
      ) : null}
      {vehicleId && due.length ? (
        <div className="mt-space-lg bg-surface-container-low rounded-xl p-space-lg">
          <p className="font-body-sm text-body-sm">This car has {due.length} services due</p>
          <div className="flex flex-wrap gap-space-sm mt-space-sm">
            {due.map((row) => (
              <button
                key={row.componentId || row.name}
                type="button"
                className="px-space-md py-2 rounded-lg bg-surface-container-lowest shadow-sm"
                onClick={() => row.componentId && onPick(row.componentId, false, row.name)}
              >
                {row.name}{row.kind === "due_soon" ? " · Due soon" : ""}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <h3 className="mt-space-lg font-headline-sm text-headline-sm">Common parts</h3>
      <div className="flex flex-wrap gap-space-sm mt-space-sm">
        {(browse.data?.common || []).map((row) => (
          <button key={row.id} type="button" className="px-space-md py-2 rounded-lg bg-surface-container" onClick={() => onPick(row.id, positionAware(row.id), row.plainName)}>
            {row.plainName}
          </button>
        ))}
      </div>
      <h3 className="mt-space-lg font-headline-sm text-headline-sm">By area</h3>
      <p className="font-caption text-caption text-on-surface-variant">{browse.data?.systems.length || 0} areas</p>
      <div className="flex flex-col gap-space-sm mt-space-sm">
        {(browse.data?.systems || []).map((system) => (
          <div key={system.id} className="bg-surface-container-low rounded-lg">
            <button type="button" className="w-full text-left px-space-md py-3 font-semibold flex justify-between" onClick={() => setOpenArea(openArea === system.id ? "" : system.id)}>
              <span>{system.plainName}</span>
              <span className="font-label-code text-caption">{system.components.length}</span>
            </button>
            {openArea === system.id ? (
              <div className="flex flex-wrap gap-space-sm px-space-md pb-space-md">
                {system.components.map((row) => (
                  <button key={row.id} type="button" className="px-space-sm py-1 rounded bg-surface-container-lowest" onClick={() => onPick(row.id, row.positionAware, row.plainName)}>
                    {row.plainName}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <h3 className="mt-space-lg font-headline-sm text-headline-sm">What's wrong with the car?</h3>
      <div className="flex flex-col gap-space-sm mt-space-sm">
        {(symptoms.data?.symptoms || []).map((row) => (
          <button key={row.id} type="button" className="text-left bg-surface-container-low rounded-lg p-space-md" onClick={() => row.components[0] && onPick(row.components[0].componentId, false, row.label)}>
            <div className="font-semibold">{row.label}</div>
            {row.hint ? <div className="font-body-sm text-caption text-on-surface-variant">{row.hint}</div> : null}
          </button>
        ))}
      </div>
      <div className="mt-space-lg flex gap-space-md">
        <button type="button" onClick={onBack}>Back to car selection</button>
        <button type="button" className="bg-surface-container px-space-lg py-2 rounded-lg" onClick={onSkip}>Skip</button>
      </div>
    </div>
  );
}
