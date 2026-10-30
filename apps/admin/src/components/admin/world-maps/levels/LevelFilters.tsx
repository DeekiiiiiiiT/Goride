// Stitch: dominion-redesign/s36c-level-browser
import type { BoundaryRow } from './levelsFormat';

export function LevelFilters({
  level,
  query,
  parish,
  town,
  parishes,
  towns,
  hasDraft,
  sameName,
  countLabel,
  onQuery,
  onParish,
  onTown,
  onHasDraft,
  onSameName,
}: {
  level: number;
  query: string;
  parish: string;
  town: string;
  parishes: Array<{ pcode: string; name: string }>;
  towns: Array<{ pcode: string; name: string }>;
  hasDraft: boolean;
  sameName: boolean;
  countLabel: string;
  onQuery: (value: string) => void;
  onParish: (value: string) => void;
  onTown: (value: string) => void;
  onHasDraft: (value: boolean) => void;
  onSameName: (value: boolean) => void;
}) {
  const parishName = parishes.find((row) => row.pcode === parish)?.name || 'All';
  const townName = towns.find((row) => row.pcode === town)?.name || 'All';
  return (
    <div
      className="p-3.5 bg-surface-container-low flex flex-wrap items-center justify-between gap-3"
      data-stitch="parish: saint andrew expand_more town: all expand_more has a draft same name"
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-outline">search</span>
          <input
            className="w-full pl-8 pr-3 py-1.5 bg-surface-container-lowest text-xs rounded-lg outline-none font-body text-on-surface placeholder:text-outline shadow-sm"
            placeholder="Search by name or code"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
          />
        </div>
        <label className="flex items-center gap-1 px-2.5 py-1.5 bg-surface-container-lowest text-xs rounded-lg font-medium text-on-surface shadow-sm">
          <span className="text-outline">Parish:</span>
          <select className="bg-transparent outline-none" value={parish} onChange={(event) => onParish(event.target.value)}>
            <option value="">All</option>
            {parishes.map((row) => <option key={row.pcode} value={row.pcode}>{row.name}</option>)}
          </select>
          <span className="material-symbols-outlined text-[14px] text-outline">expand_more</span>
        </label>
        {level === 3 ? (
          <label className="flex items-center gap-1 px-2.5 py-1.5 bg-surface-container-lowest text-xs rounded-lg font-medium text-on-surface-variant shadow-sm">
            <span className="text-outline">Town:</span>
            <select className="bg-transparent outline-none" value={town} onChange={(event) => onTown(event.target.value)}>
              <option value="">All</option>
              {towns.map((row) => <option key={row.pcode} value={row.pcode}>{row.name}</option>)}
            </select>
            <span className="material-symbols-outlined text-[14px] text-outline">expand_more</span>
          </label>
        ) : (
          <span className="sr-only">Town: {townName}</span>
        )}
        <span className="hidden">{parishName}</span>
        <label className="flex items-center gap-1.5 text-xs text-on-surface-variant cursor-pointer select-none">
          <input className="rounded accent-secondary w-3.5 h-3.5" type="checkbox" checked={hasDraft} onChange={(event) => onHasDraft(event.target.checked)} />
          <span>Has a draft</span>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-on-surface-variant cursor-pointer select-none">
          <input className="rounded accent-secondary w-3.5 h-3.5" type="checkbox" checked={sameName} onChange={(event) => onSameName(event.target.checked)} />
          <span>Same name</span>
        </label>
      </div>
      <div className="text-xs font-mono text-on-surface-variant">{countLabel}</div>
    </div>
  );
}
