import React from 'react';
import { VehicleTypesManager } from './VehicleTypesManager';

export function TransportSolutionsLayout() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">Transport Solutions</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Commando vehicle body types used to match drivers to trips. Link services to body types
          from each product line under Services.
        </p>
      </div>
      <VehicleTypesManager kind="vehicle" />
    </div>
  );
}
