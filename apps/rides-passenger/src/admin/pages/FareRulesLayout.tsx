import React from 'react';
import { NavLink, Outlet, useOutletContext } from 'react-router-dom';

const TABS = [
  { to: '/admin/fare-rules', label: 'Rules', end: true },
  { to: '/admin/fare-rules/calculator', label: 'Trip calculator', end: false },
] as const;

export function FareRulesLayout() {
  const outletContext = useOutletContext();

  return (
    <div className="space-y-6">
      <nav className="flex gap-1 p-1 rounded-lg bg-slate-900 border border-slate-800 w-fit">
        {TABS.map(({ to, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <Outlet context={outletContext} />
    </div>
  );
}
