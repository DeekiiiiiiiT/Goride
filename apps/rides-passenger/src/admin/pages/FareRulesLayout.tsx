import React from 'react';
import { Outlet, useOutletContext } from 'react-router-dom';
import { VehicleTypesProvider } from '../context/VehicleTypesContext';

export function FareRulesLayout() {
  const outletContext = useOutletContext();

  return (
    <VehicleTypesProvider>
      <Outlet context={outletContext} />
    </VehicleTypesProvider>
  );
}
