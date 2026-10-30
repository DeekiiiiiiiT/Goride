// Stitch: dominion-redesign/s36c-level-browser
import type { BoundaryRow, SortKey } from './levelsFormat';
import { childWord } from './levelsFormat';

const COLUMNS: Array<{ key: SortKey; label: string; align?: string }> = [
  { key: 'name', label: 'Name' },
  { key: 'pcode', label: 'Code' },
  { key: 'parent_name', label: 'Parent' },
  { key: 'area_sqkm', label: 'Area km²', align: 'text-right' },
  { key: 'vertex_count', label: 'Points', align: 'text-right' },
  { key: 'children', label: 'Children' },
  { key: 'version', label: 'Live' },
  { key: 'published_at', label: 'Updated' },
];

export function BoundaryTable({
  rows,
  selected,
  onSort,
  onOpen,
}: {
  rows: BoundaryRow[];
  selected: string | null;
  onSort: (key: SortKey) => void;
  onOpen: (pcode: string) => void;
}) {
  return (
    <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-surface-container text-on-surface-variant text-[11px] font-label uppercase tracking-wider select-none z-10">
          <tr>
            {COLUMNS.map((column) => (
              <th key={column.key} className={`py-2.5 px-4 font-semibold ${column.align || ''}`}>
                <button type="button" className="uppercase" onClick={() => onSort(column.key)}>{column.label}</button>
              </th>
            ))}
            <th className="py-2.5 px-4 w-8" />
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-container">
          {rows.map((row) => {
            const on = row.pcode === selected;
            const kids = childWord(row.admin_level);
            return (
              <tr
                key={row.pcode}
                className={on ? 'bg-secondary-container/40 hover:bg-secondary-container/60 transition-colors cursor-pointer' : 'hover:bg-surface-container-low transition-colors cursor-pointer'}
                onClick={() => onOpen(row.pcode)}
              >
                <td className="py-3 px-4 font-semibold text-on-surface">
                  <span className="inline-flex items-center gap-2">
                    {on ? <span className="w-2 h-2 rounded-full bg-secondary" /> : null}
                    <span>{row.name}</span>
                    {row.has_draft ? <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-amber-100 text-amber-900">Draft</span> : null}
                    {row.same_name_count > 1 ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-label font-bold bg-amber-100 text-amber-900">Same name ×{row.same_name_count}</span>
                    ) : null}
                  </span>
                </td>
                <td className="py-3 px-4 font-mono font-medium text-secondary">{row.pcode}</td>
                <td className="py-3 px-4 text-on-surface-variant font-medium">{row.parent_name || '—'}</td>
                <td className="py-3 px-4 font-mono text-right">{row.area_sqkm ?? '—'}</td>
                <td className="py-3 px-4 font-mono text-right">{row.vertex_count?.toLocaleString() ?? '—'}</td>
                <td className="py-3 px-4 font-mono text-on-surface-variant">{kids && row.children ? `${row.children} ${kids}` : '—'}</td>
                <td className="py-3 px-4">
                  <span className="inline-flex items-center gap-1 font-mono text-[11px] text-tertiary font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-tertiary" /> v{row.version ?? '—'}
                  </span>
                </td>
                <td className="py-3 px-4 font-mono text-on-surface-variant">{row.published_at ? row.published_at.slice(0, 10) : '—'}</td>
                <td className="py-3 px-4 text-right">
                  <span className="material-symbols-outlined text-[16px] text-outline">chevron_right</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
