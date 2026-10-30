// Stitch: dominion-redesign/S42g
import { useQuery } from "@tanstack/react-query";
import { fetchPartDemand } from "./findPartsApi";

export function MissingPart({
  partName,
  carLabel,
  variantId,
  componentId,
  owner,
  onAdd,
  onSearch,
}: {
  partName: string;
  carLabel: string;
  variantId: string;
  componentId: string;
  owner: boolean;
  onAdd: () => void;
  onSearch: () => void;
}) {
  const demand = useQuery({
    queryKey: ["part-demand", variantId, componentId],
    queryFn: () => fetchPartDemand(variantId, componentId),
    enabled: Boolean(variantId && componentId),
  });
  const ownerTitle = owner ? undefined : "Only the owner can change parts.";
  return (
    <div className="w-full max-w-4xl mx-auto bg-surface-container-lowest rounded-2xl shadow-md p-space-xl flex flex-col gap-space-lg">
      <h2 className="font-headline-xl text-headline-xl text-on-surface font-bold">We don't have {partName || "this part"} for the {carLabel} yet.</h2>
      {demand.data ? (
        <p className="font-body-md text-body-md text-on-surface">Asked for by {demand.data.fleetCount} fleets · {demand.data.openCount} open requests</p>
      ) : null}
      <div className="rounded-xl bg-surface-container-low p-space-md">
        <h3 className="font-headline-md text-headline-md font-semibold">New fitment record</h3>
        <p className="font-body-sm text-body-sm text-secondary mt-1">{carLabel}{partName ? ` · ${partName}` : ""}</p>
        <p className="font-body-sm text-body-sm text-secondary">OEM reference part number · Part commercial title · Fitment tier · Brake system type</p>
        <div className="flex gap-2 mt-3">
          <button type="button" className="h-12 px-4 rounded-xl bg-surface-container">Cancel</button>
          <button type="button" className="h-12 px-4 rounded-xl bg-primary-container text-on-primary disabled:opacity-40" disabled={!owner} title={ownerTitle} onClick={onAdd}>Save part</button>
        </div>
      </div>
      <div className="flex flex-wrap gap-space-sm">
        <button type="button" className="h-12 px-5 rounded-xl bg-primary-container text-on-primary font-label-md text-label-md disabled:opacity-40" disabled={!owner} title={ownerTitle} onClick={onAdd}>Add it now</button>
        <button type="button" className="h-12 px-5 rounded-xl bg-surface-container-low text-on-surface font-label-md text-label-md" onClick={onSearch}>Search a different part</button>
        <button type="button" className="h-12 px-4" aria-label="close">Close</button>
      </div>
    </div>
  );
}
