import React from 'react';
import { Outlet, useOutletContext } from 'react-router-dom';
import { VehicleTypesProvider } from '../context/VehicleTypesContext';

export function ServicesLayout() {
  const outletContext = useOutletContext();

  return (
    <VehicleTypesProvider>
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-white">Services</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Rider-facing products grouped by line of business. Link each service to body types under
            Pricing &amp; Transport → Transport Solutions for dispatch.
          </p>
        </div>
        <Outlet context={outletContext} />
      </div>
    </VehicleTypesProvider>
  );
}
