// Stitch: dominion-redesign/8923fc739cb14e808622165b97bafd8c
import React, { useState } from 'react';
import { Car, CheckSquare, Download, Plus, Search, ShieldCheck } from 'lucide-react';

type DominionMasterListProps = {
  search: string;
  onSearch: (value: string) => void;
  onAdd?: () => void;
  addLabel?: string;
  pageTitle?: string;
  children: React.ReactNode;
  empty?: boolean;
  selectedCount?: number;
  statusFilter?: string;
  onStatusFilter?: (value: string) => void;
  publishFilter?: string;
  onPublishFilter?: (value: string) => void;
  emptyDetail?: string;
};

/** Shared list frame. The table body is supplied by the page. */
export function DominionMasterList({
  search,
  onSearch,
  onAdd,
  addLabel = '+ Add record',
  pageTitle = 'Vehicles',
  children,
  empty = false,
  selectedCount = 0,
  statusFilter,
  onStatusFilter,
  publishFilter,
  onPublishFilter,
  emptyDetail,
}: DominionMasterListProps) {
  const [localStatus, setLocalStatus] = useState('All');
  const [localPublish, setLocalPublish] = useState('All');
  const statusValue = statusFilter ?? localStatus;
  const publishValue = publishFilter ?? localPublish;
  const addText = addLabel.startsWith('+') ? addLabel : `+ ${addLabel}`;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex items-end justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <nav className="mb-1 flex items-center gap-1.5 text-xs font-normal text-slate-500" aria-label="Breadcrumb">
            <span>Dominion</span>
            <span className="text-slate-400">/</span>
            <span>Master data</span>
            <span className="text-slate-400">/</span>
            <span className="font-medium text-slate-700">{pageTitle}</span>
          </nav>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{pageTitle}</h1>
        </div>
        {onAdd ? (
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" aria-hidden />
            {addText}
          </button>
        ) : (
          <span className="sr-only">+ Add record</span>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex min-w-[280px] flex-1 flex-wrap items-center gap-3">
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-3 top-2 h-[18px] w-[18px] text-slate-400" aria-hidden />
            <input
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              placeholder="Search name"
              type="text"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-3 text-xs placeholder-slate-400 transition-all focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-600"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-500">Status:</label>
            <select
              value={statusValue}
              onChange={(event) => {
                const next = event.target.value;
                if (onStatusFilter) onStatusFilter(next);
                else setLocalStatus(next);
              }}
              className="rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-2.5 pr-8 text-xs text-slate-700 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
            >
              <option>All</option>
              <option>Active</option>
              <option>Inactive</option>
              <option>Archived</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-500">Publish:</label>
            <select
              value={publishValue}
              onChange={(event) => {
                const next = event.target.value;
                if (onPublishFilter) onPublishFilter(next);
                else setLocalPublish(next);
              }}
              className="rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-2.5 pr-8 text-xs text-slate-700 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
            >
              <option>All</option>
              <option>Draft</option>
              <option>Published</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2 border-l border-slate-200 py-0.5 pl-4 text-xs">
          <span className="text-[11px] font-medium text-slate-400">Legend:</span>
          <span className="inline-flex items-center rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
            Draft
          </span>
          <span className="inline-flex items-center rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
            Published
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex-1 overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50/75 font-mono text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">
                  Id <span className="normal-case text-slate-400">(font-mono)</span>
                </th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Publish</th>
                <th className="px-4 py-3 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {empty ? (
                <tr>
                  <td colSpan={5} className="px-4 py-24 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-slate-400">
                        <Car className="h-5 w-5" aria-hidden />
                      </div>
                      <p className="text-sm font-medium text-slate-600">The data is not in yet.</p>
                      {emptyDetail ? (
                        <p className="mt-1 max-w-sm text-xs text-slate-400">{emptyDetail}</p>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ) : (
                children
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs">
          <div className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-slate-400" aria-hidden />
            <span className="font-medium text-slate-400">
              {selectedCount > 0 ? `${selectedCount} selected` : 'None selected'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled
              className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-400 opacity-60"
            >
              <ShieldCheck className="h-[15px] w-[15px]" aria-hidden />
              Verify
            </button>
            <button
              type="button"
              disabled
              className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-400 opacity-60"
            >
              <Download className="h-[15px] w-[15px]" aria-hidden />
              Export CSV
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
