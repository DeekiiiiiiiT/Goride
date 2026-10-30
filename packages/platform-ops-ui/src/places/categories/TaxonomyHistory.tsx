// Stitch: dominion-redesign/categories_tree_tab_gas_station_selected
import { changeBy, changeWhen, type ChangeRow } from "./categoriesFormat";

export function TaxonomyHistory({ rows }: { rows: ChangeRow[] }) {
  if (!rows.length) {
    return (
      <div className="rounded-2xl bg-surface-container-lowest p-8 text-center text-xs text-on-surface-variant shadow-sm">
        The data is not in yet.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm">
      <table className="w-full text-left text-xs text-on-surface">
        <thead>
          <tr className="bg-surface-container-low font-label text-[11px] uppercase tracking-wider text-on-surface-variant">
            <th className="px-5 py-3">When</th>
            <th className="px-3 py-3">Item</th>
            <th className="px-3 py-3">Action</th>
            <th className="px-3 py-3">By</th>
            <th className="px-5 py-3">Reason</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-container">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="px-5 py-3 font-mono text-[11px] text-outline">{changeWhen(row.at)}</td>
              <td className="px-3 py-3 font-semibold">{row.item_label}</td>
              <td className="px-3 py-3 capitalize">{row.action}</td>
              <td className="px-3 py-3 text-on-surface-variant">{changeBy(row.actor_id)}</td>
              <td className="px-5 py-3 text-on-surface-variant">{row.reason || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
