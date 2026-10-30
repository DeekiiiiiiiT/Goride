// Stitch: dominion-redesign/categories_tree_tab_gas_station_selected
// Stitch: dominion-redesign/categories_brands_tab
import { useMemo, useState } from "react";
import { monogram, type AdminTaxonomy, type BrandRow } from "./categoriesFormat";

function Icon({ name, className = "" }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className}`.trim()}>{name}</span>;
}

const PAGE = 11;

export function BrandsTable({
  tree,
  canWrite,
  onAdd,
  onEdit,
  onRetire,
}: {
  tree: AdminTaxonomy;
  canWrite: boolean;
  onAdd: () => void;
  onEdit: (row: BrandRow) => void;
  onRetire: (row: BrandRow) => void;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tree.brands.filter((row) => row.active && (!needle || row.name.toLowerCase().includes(needle) || row.slug.includes(needle)));
  }, [tree.brands, query]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const safePage = Math.min(page, pages - 1);
  const slice = rows.slice(safePage * PAGE, safePage * PAGE + PAGE);
  const from = rows.length === 0 ? 0 : safePage * PAGE + 1;
  const to = Math.min(rows.length, safePage * PAGE + PAGE);
  const logos = tree.brands.filter((row) => row.active && row.logo_url).length;
  const labelFor = (slug: string) => tree.placeTypes.find((row) => row.slug === slug)?.label || slug;

  return (
    <div className="overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm">
      <div className="flex flex-col justify-between gap-3 bg-surface-container-low px-5 py-3.5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <span className="font-headline text-xs font-semibold text-on-surface">Registered Fuel Networks</span>
          <span className="rounded bg-surface-container px-2 py-0.5 font-mono text-[11px] text-on-surface-variant">Jamaica Commercial</span>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="relative w-64">
            <Icon name="search" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-outline" />
            <input
              className="w-full rounded-lg bg-surface-container-lowest py-1 pl-8 pr-3 font-body text-xs text-on-surface shadow-sm outline-none placeholder:text-outline"
              placeholder="Search brands…"
              type="text"
              value={query}
              onChange={(event) => { setQuery(event.target.value); setPage(0); }}
            />
          </div>
          {canWrite && (
            <button type="button" className="inline-flex items-center gap-1 rounded-lg bg-surface-container-highest px-3 py-1 text-xs font-medium text-on-surface shadow-sm hover:bg-surface-container" onClick={onAdd}>
              <Icon name="add" className="text-[15px]" />
              <span>Brand</span>
            </button>
          )}
        </div>
      </div>
      <div className="w-full overflow-x-auto">
        <table className="w-full whitespace-nowrap text-left text-xs text-on-surface">
          <thead>
            <tr className="bg-surface-container-low/70 font-label text-[11px] uppercase tracking-wider text-on-surface-variant">
              <th className="w-10 py-3 pl-5 pr-2" scope="col" />
              <th className="px-3 py-3 font-semibold" scope="col">Brand</th>
              <th className="px-3 py-3 font-semibold" scope="col">Aliases</th>
              <th className="px-3 py-3 font-semibold" scope="col">Used for</th>
              <th className="px-4 py-3 text-right font-semibold" scope="col">Places</th>
              <th className="py-3 pl-3 pr-5 text-right font-semibold" scope="col">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-container">
            {slice.map((row) => (
              <tr key={row.id} className="group hover:bg-surface-container-low">
                <td className="py-3 pl-5 pr-2" />
                <td className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    {row.logo_url ? (
                      <img alt="" src={row.logo_url} className="h-8 w-8 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-container-high font-mono text-xs font-semibold text-on-surface-variant">
                        {monogram(row.name)}
                      </div>
                    )}
                    <div className="flex flex-col">
                      <span className="font-headline font-semibold text-on-surface group-hover:text-secondary">{row.name}</span>
                      <span className="font-mono text-[10px] text-outline">{row.slug}</span>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(row.aliases || []).map((alias) => (
                      <span key={alias} className="rounded bg-surface-container px-2 py-0.5 font-mono text-[10px] text-on-surface-variant">{alias}</span>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-1">
                    {(row.place_types || []).map((slug) => (
                      <span key={slug} className="inline-flex items-center gap-1 rounded-full bg-surface-container-high px-2.5 py-0.5 text-[11px] font-medium text-on-primary-container">
                        <Icon name="local_gas_station" className="text-[13px] text-outline" />
                        {labelFor(slug)}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="font-mono text-xs font-bold text-on-surface">{row.places}</span>
                </td>
                <td className="py-3 pl-3 pr-5 text-right text-xs font-medium">
                  {canWrite && (
                    <div className="flex items-center justify-end gap-3">
                      <button type="button" className="text-secondary hover:underline" onClick={() => onEdit(row)}>Edit</button>
                      <button type="button" className="text-error hover:opacity-80" onClick={() => onRetire(row)}>Retire…</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col justify-between gap-3 bg-surface-container-low/50 px-5 py-3.5 text-xs sm:flex-row sm:items-center">
        <div className="flex items-center gap-2 font-mono text-[11px] text-on-surface-variant">
          <span className="font-semibold text-on-surface">{rows.length} brands</span>
          <span>·</span>
          <span>{logos} with a logo</span>
        </div>
        <div className="flex items-center gap-3 font-mono text-[11px] text-on-surface-variant">
          <span>Showing {from}–{to} of {rows.length} brands</span>
          <div className="flex items-center gap-1">
            <button type="button" className="flex h-6 w-6 items-center justify-center rounded bg-surface-container text-outline disabled:opacity-50" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
              <Icon name="chevron_left" className="text-xs" />
            </button>
            <button type="button" className="flex h-6 w-6 items-center justify-center rounded bg-surface-container-highest text-on-surface hover:bg-secondary hover:text-on-secondary" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)}>
              <Icon name="chevron_right" className="text-xs" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
