// Stitch: dominion-redesign/categories_tree_tab_gas_station_selected
import { type AdminTaxonomy, type SelectedRef } from "./categoriesFormat";

export type RetiredRow = { table: SelectedRef["table"]; id: string; label: string; parent: string | null };

export function retiredRows(tree: AdminTaxonomy): RetiredRow[] {
  const rows: RetiredRow[] = [];
  for (const row of tree.groups) if (!row.active) rows.push({ table: "category_group", id: row.code, label: row.label, parent: null });
  for (const row of tree.categories) if (!row.active) rows.push({ table: "category", id: row.code, label: row.label, parent: row.parent_active ? null : row.parent_label });
  for (const row of tree.placeTypes) if (!row.active) rows.push({ table: "place_type", id: row.slug, label: row.label, parent: row.parent_restore_label });
  for (const row of tree.facilityTypes) if (!row.active) rows.push({ table: "facility_type", id: row.slug, label: row.label, parent: row.parent_restore_label });
  for (const row of tree.brands) if (!row.active) rows.push({ table: "brand", id: row.id, label: row.name, parent: null });
  return rows;
}

export function RetiredList({
  rows,
  canWrite,
  onRestore,
}: {
  rows: RetiredRow[];
  canWrite: boolean;
  onRestore: (row: RetiredRow) => void;
}) {
  if (!rows.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl bg-surface-container-lowest p-8 text-center shadow-sm">
        <span className="material-symbols-outlined mb-4 text-[28px] text-outline">inbox</span>
        <h4 className="mb-1 font-headline text-sm font-semibold text-on-surface">Nothing is retired.</h4>
        <p className="max-w-sm text-xs leading-relaxed text-on-surface-variant">
          Active taxonomy items retired by an administrator will appear here for audit and restoration. The data is not in yet.
        </p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm">
      <table className="w-full text-left text-xs text-on-surface">
        <thead>
          <tr className="bg-surface-container-low font-label text-[11px] uppercase tracking-wider text-on-surface-variant">
            <th className="px-5 py-3">Item</th>
            <th className="px-3 py-3">Kind</th>
            <th className="px-5 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-container">
          {rows.map((row) => (
            <tr key={`${row.table}-${row.id}`}>
              <td className="px-5 py-3 font-semibold">{row.label}</td>
              <td className="px-3 py-3 font-mono text-[11px] text-outline">{row.table}</td>
              <td className="px-5 py-3 text-right">
                {canWrite && (
                  <button type="button" className="font-semibold text-secondary hover:underline" onClick={() => onRestore(row)}>Restore…</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
