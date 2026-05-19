import React from 'react';
import { NavLink, Outlet, useOutletContext } from 'react-router-dom';

const SUB_TABS = [
  { to: '/admin/fare-rules/transport-solutions/vehicles', label: 'Body types', end: true },
  { to: '/admin/fare-rules/transport-solutions/services', label: 'Services', end: true },
] as const;

export function TransportSolutionsLayout() {
  const outletContext = useOutletContext();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">Transport Solutions</h2>
        <p className="text-sm text-slate-400 mt-1 max-w-2xl">
          Body types define which Commando vehicle shapes can receive trip offers. Services are what
          riders book; link each service to one or more body types in priority order for dispatch waves.
        </p>
      </div>

      <nav className="flex gap-1 p-1 rounded-lg bg-slate-950 border border-slate-800 w-fit">
        {SUB_TABS.map(({ to, label, end }) => (
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
