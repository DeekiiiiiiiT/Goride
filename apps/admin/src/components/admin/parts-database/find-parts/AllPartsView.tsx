// Stitch: dominion-redesign/S42h
import type { FindPartsResult, FoundPartRow } from "../partsDatabaseApi";
import type { BrowseArea } from "./PartStep";

export function AllPartsView({
  areas,
  result,
  owner,
  onAdd,
  onOpen,
  onBack,
}: {
  areas: BrowseArea[];
  result: FindPartsResult;
  owner: boolean;
  onAdd: () => void;
  onOpen: (part: FoundPartRow) => void;
  onBack: () => void;
}) {
  const items = (result.plainSections ?? []).flatMap((section) => section.items);
  const ownerTitle = owner ? undefined : "Only the owner can change parts.";
  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-space-lg">
      <div className="flex items-center justify-between">
        <h2 className="font-headline-xl text-headline-xl font-bold text-on-surface">Everything for this car</h2>
        <button type="button" className="h-12 px-4 rounded-xl bg-primary-container text-on-primary disabled:opacity-40" disabled={!owner} title={ownerTitle} onClick={onAdd}>Add a part to this car</button>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr className="font-label-xs text-label-xs text-secondary">
            <th>Component & specification</th>
            <th>OEM / reference mono</th>
            <th>Classification tier</th>
            <th>Validation status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.partId + item.number}>
              <td className="py-2">{item.name}</td>
              <td className="font-mono-sm text-mono-sm">{item.number}</td>
              <td>{item.tier}</td>
              <td>{item.status === "verified" ? "Verified" : "Needs checking"}</td>
              <td><button type="button" onClick={() => onOpen(item)}>View details north_east</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {areas.map((area) => (
        <section key={area.id}>
          <h3 className="font-headline-md text-headline-md font-semibold">{area.plainName}</h3>
          {area.components.every((row) => row.count === 0) ? <p className="text-secondary">Nothing yet for {area.plainName}</p> : null}
        </section>
      ))}
      <p className="font-body-sm text-body-sm text-secondary">Export catalogue manifest · Find & cross-match · Validation rules · Revision ledger · more_vert</p>
      <button type="button" className="self-start h-12" onClick={onBack}>Back</button>
    </div>
  );
}
