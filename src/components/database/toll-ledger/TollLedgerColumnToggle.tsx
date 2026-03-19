import React, { useState, useRef, useEffect } from 'react';
import { Columns3, RotateCcw } from 'lucide-react';
import type { ColumnDef } from './TollLedgerTable';

interface TollLedgerColumnToggleProps {
  columns: ColumnDef[];
  visibleColumns: string[];
  onToggle: (key: string) => void;
  onResetDefaults: () => void;
}

const GROUP_LABELS: Record<string, string> = {
  core: 'Core Fields',
  reconciliation: 'Reconciliation',
  financial: 'Financial',
  meta: 'Metadata',
};

const GROUP_ORDER = ['core', 'reconciliation', 'financial', 'meta'] as const;

export function TollLedgerColumnToggle({
  columns,
  visibleColumns,
  onToggle,
  onResetDefaults,
}: TollLedgerColumnToggleProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  // Group columns
  const grouped: Record<string, ColumnDef[]> = {};
  for (const col of columns) {
    if (!grouped[col.group]) grouped[col.group] = [];
    grouped[col.group].push(col);
  }

  const activeCount = visibleColumns.length;
  const defaultCount = columns.filter(c => c.defaultVisible).length;
  const isDefault = activeCount === defaultCount &&
    columns.filter(c => c.defaultVisible).every(c => visibleColumns.includes(c.key));

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen(!open)}
        className={`
          inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors
          ${open
            ? 'border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300'
            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
          }
        `}
      >
        <Columns3 className="h-4 w-4" />
        Columns
        {!isDefault && (
          <span className="ml-0.5 px-1.5 py-0.5 text-xs rounded-full bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg z-50">
          {/* Header */}
          <div className="px-3 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Toggle Columns
            </span>
            {!isDefault && (
              <button
                onClick={onResetDefaults}
                className="inline-flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 transition-colors"
              >
                <RotateCcw className="h-3 w-3" />
                Reset
              </button>
            )}
          </div>

          {/* Column groups */}
          <div className="max-h-80 overflow-y-auto py-1">
            {GROUP_ORDER.map(group => {
              const cols = grouped[group];
              if (!cols || cols.length === 0) return null;
              return (
                <div key={group}>
                  <div className="px-3 pt-2.5 pb-1">
                    <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                      {GROUP_LABELS[group]}
                    </span>
                  </div>
                  {cols.map(col => {
                    const checked = visibleColumns.includes(col.key);
                    return (
                      <label
                        key={col.key}
                        className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onToggle(col.key)}
                          className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600 text-rose-600 focus:ring-rose-500 focus:ring-offset-0 cursor-pointer"
                        />
                        <span className={`text-sm ${checked ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'}`}>
                          {col.label}
                        </span>
                        {!col.defaultVisible && (
                          <span className="ml-auto text-[10px] text-slate-400 dark:text-slate-600">extra</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="px-3 py-2 border-t border-slate-100 dark:border-slate-800">
            <span className="text-[10px] text-slate-400 dark:text-slate-500">
              {activeCount} of {columns.length} columns visible
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
