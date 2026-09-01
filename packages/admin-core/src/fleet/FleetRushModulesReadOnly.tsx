import React from 'react';
import { RUSH_MODULE_LABELS } from './rushRolloutCatalog';

export type FleetRushModulesReadOnlyProps = {
  rushModules: Record<string, boolean>;
};

export function FleetRushModulesReadOnly({ rushModules }: FleetRushModulesReadOnlyProps) {
  const entries = Object.entries(RUSH_MODULE_LABELS);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900/40">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Effective delivery modules</h3>
      <p className="mt-1 text-xs text-slate-500">
        Synced from service lines — not editable here. Toggle service lines above to change entitlement.
      </p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {entries.map(([key, label]) => {
          const on = rushModules[key] === true;
          return (
            <li
              key={key}
              className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700"
            >
              <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
              <span
                className={`text-[10px] font-medium uppercase ${
                  on ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                }`}
              >
                {on ? 'On' : 'Off'}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
