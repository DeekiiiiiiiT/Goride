// Stitch: dominion-redesign/149b1cf614544883961723d7f8b60303
import { formatUpdated } from "./registerFormat";
import type { PlaceDetail } from "./registerApi";

export function PlaceHistoryTab({ detail }: { detail: PlaceDetail }) {
  return (
    <ul className="flex flex-col gap-2 p-4 text-xs">
      {detail.history.length ? detail.history.map((row, index) => (
        <li key={`${row.created_at}-${index}`} className="rounded-lg bg-surface-container px-3 py-2">
          <div className="font-medium text-on-surface">{row.action}</div>
          <div className="text-on-surface-variant">{row.reason || "—"} · {row.actor || "—"} · {formatUpdated(row.created_at)}</div>
        </li>
      )) : <li className="text-on-surface-variant">No history yet.</li>}
    </ul>
  );
}
