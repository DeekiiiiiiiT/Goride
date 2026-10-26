// Stitch: dominion-redesign/8923fc739cb14e808622165b97bafd8c
import React from 'react';

type DominionMasterListProps = {
  search: string;
  onSearch: (value: string) => void;
  onAdd?: () => void;
  addLabel?: string;
  children: React.ReactNode;
  empty?: boolean;
  selectedCount?: number;
};

/** Shared list frame. The table body is supplied by the page. */
export function DominionMasterList({
  search,
  onSearch,
  onAdd,
  addLabel = 'Add record',
  children,
  empty = false,
  selectedCount = 0,
}: DominionMasterListProps) {
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search name"
          className="w-64 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
        />
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Draft</span>
        <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-dominion-approve">Published</span>
        {onAdd ? (
          <button
            type="button"
            onClick={onAdd}
            className="ml-auto rounded-lg bg-dominion-blue px-3 py-1.5 text-sm font-medium text-white"
          >
            {addLabel}
          </button>
        ) : null}
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {empty ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">The data is not in yet.</p>
        ) : children}
        <div className="flex items-center gap-3 border-t border-slate-200 px-4 py-2 text-xs text-slate-400">
          <span>{selectedCount > 0 ? `${selectedCount} selected` : 'None selected'}</span>
          <button type="button" disabled className="rounded border border-slate-200 px-2 py-1 opacity-50">Verify</button>
          <button type="button" disabled className="rounded border border-slate-200 px-2 py-1 opacity-50">Export CSV</button>
        </div>
      </div>
    </div>
  );
}
