import type { MasterPartRow } from "../partsDatabaseApi";
import { formatUpdated, TIER_META } from "./matchMeta";

export function PartsMasterTable({
  rows,
  total,
  page,
  pageSize,
  selectedId,
  onOpen,
  onPage,
}: {
  rows: MasterPartRow[];
  total: number;
  page: number;
  pageSize: number;
  selectedId: string;
  onOpen: (row: MasterPartRow) => void;
  onPage: (page: number) => void;
}) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="w-full flex flex-col rounded-xl bg-surface-container-lowest shadow-sm overflow-hidden" id="section-parts-view">
      <div className="px-space-lg py-3 bg-surface-container-low border-b border-outline-variant/40 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary-container/10 flex items-center justify-center text-primary border border-primary/20">
            <span className="material-symbols-outlined text-[18px]">inventory_2</span>
          </div>
          <h2 className="font-headline-md text-headline-md text-on-surface font-bold tracking-tight">Parts Catalog Master</h2>
          <span className="px-2 py-0.5 rounded-full bg-secondary-container border border-outline-variant/40 text-on-secondary-container font-mono-sm text-mono-sm font-semibold">{total} Records</span>
        </div>
        <div className="font-mono-sm text-mono-sm text-secondary flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
          <span>SORT: RECENTLY UPDATED</span>
        </div>
      </div>
      <div className="master-table overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface/80 border-b border-outline-variant/40 font-mono-sm text-[11px] uppercase text-secondary tracking-wider h-10">
              <th className="px-space-lg font-semibold">Part Name</th>
              <th className="px-space-md font-semibold">Part Number</th>
              <th className="px-space-md font-semibold">Brand</th>
              <th className="px-space-md font-semibold">Match Type</th>
              <th className="px-space-md font-semibold">Assembly</th>
              <th className="px-space-md font-semibold">Fitted Cars</th>
              <th className="px-space-md font-semibold">Verification</th>
              <th className="px-space-md font-semibold">Updated</th>
              <th className="px-space-md text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/20 text-on-surface font-body-sm text-body-sm">
            {rows.length === 0 ? (
              <tr><td className="px-space-lg py-6 text-secondary" colSpan={9}>None on file for this filter.</td></tr>
            ) : rows.map((row) => {
              const tier = TIER_META[row.tier] ?? TIER_META[1];
              const selected = row.partId === selectedId;
              const versions = row.versionCount === 1 ? "1 version" : `${row.versionCount} versions`;
              return (
                <tr
                  key={row.partId}
                  className={selected
                    ? "h-12 bg-primary-fixed/20 hover:bg-primary-fixed/30 cursor-pointer border-l-4 border-l-primary"
                    : "h-12 bg-surface-container-lowest hover:bg-surface-container-low cursor-pointer"}
                  onClick={() => onOpen(row)}
                >
                  <td className="px-space-lg font-semibold">{row.name || "Part"}</td>
                  <td className="px-space-md font-mono-sm text-mono-sm text-primary font-bold">{row.number || "—"}</td>
                  <td className="px-space-md font-medium">{row.brand || "—"}</td>
                  <td className="px-space-md">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-mono-sm text-[11px] font-semibold" style={{ color: tier.dot, backgroundColor: `${tier.dot}1a`, border: `1px solid ${tier.dot}33` }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tier.dot }} />
                      {tier.label}
                    </span>
                  </td>
                  <td className="px-space-md text-secondary font-medium">{row.assembly || "—"}</td>
                  <td className="px-space-md font-mono-sm text-mono-sm text-on-surface-variant">
                    <span className="font-medium text-on-surface">{row.fittedCars || "—"}</span>
                    {row.versionCount > 0 ? <span className="text-secondary"> · {versions}</span> : null}
                  </td>
                  <td className="px-space-md">
                    {row.status === "verified" ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-600/20 text-emerald-700 font-label-xs text-label-xs font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />Verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-600/20 text-amber-700 font-label-xs text-label-xs font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />Needs checking
                      </span>
                    )}
                  </td>
                  <td className="px-space-md font-mono-sm text-mono-sm text-secondary">{formatUpdated(row.updatedAt)}</td>
                  <td className="px-space-md text-right">
                    <button type="button" className="w-8 h-8 rounded-lg flex items-center justify-center text-secondary hover:text-primary hover:bg-surface-container ml-auto" aria-label={`Open ${row.name}`}>
                      <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="master-cards flex-col gap-2 p-3">
        {rows.map((row) => {
          const tier = TIER_META[row.tier] ?? TIER_META[1];
          return (
            <button key={row.partId} type="button" className="rounded-xl bg-surface-container-low p-3 text-left" onClick={() => onOpen(row)}>
              <span className="font-semibold text-on-surface block">{row.name || "Part"}</span>
              <span className="font-mono-sm text-mono-sm text-primary">{row.number || "—"}</span>
              <span className="mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ color: tier.dot }}>{tier.label}</span>
            </button>
          );
        })}
      </div>
      <div className="px-space-lg py-2.5 bg-surface-container-low border-t border-outline-variant/40 flex items-center justify-between">
        <span className="font-body-sm text-body-sm text-secondary">Showing <strong className="font-semibold text-on-surface">{start}–{end}</strong> of {total} parts</span>
        <div className="flex items-center gap-2 font-body-sm text-body-sm">
          <button type="button" className="px-3 h-8 rounded-lg bg-surface border border-outline-variant/50 text-secondary disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
          <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-primary-container text-on-primary font-mono-sm font-bold">{page}</span>
          <button type="button" className="px-3 h-8 rounded-lg bg-surface border border-outline-variant/50 text-secondary disabled:opacity-40" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
        </div>
      </div>
    </div>
  );
}
