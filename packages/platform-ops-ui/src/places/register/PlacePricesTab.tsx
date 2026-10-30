// Stitch: dominion-redesign/149b1cf614544883961723d7f8b60303
import { gradeLabel } from "./registerFormat";
import type { PlaceDetail } from "./registerApi";

export function PlacePricesTab({ detail }: { detail: PlaceDetail }) {
  return (
    <ul className="flex flex-col gap-2 p-4 text-xs">
      {detail.prices.length ? detail.prices.map((row) => (
        <li key={row.grade} className="flex justify-between rounded-lg bg-surface-container px-3 py-2">
          <span>{gradeLabel(row.grade)}</span>
          <span className="font-mono">J${Number(row.price_per_litre).toFixed(2)}</span>
        </li>
      )) : <li className="text-on-surface-variant">No prices yet.</li>}
    </ul>
  );
}
