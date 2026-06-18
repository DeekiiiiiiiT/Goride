import React, { createContext, useContext } from 'react';
import { RIDESHARE_DISPATCH_CONFIG, type DispatchProductConfig } from './dispatchConfig';

const DispatchConfigContext = createContext<DispatchProductConfig>(RIDESHARE_DISPATCH_CONFIG);

export function DispatchConfigProvider({
  config,
  children,
}: {
  config: DispatchProductConfig;
  children: React.ReactNode;
}) {
  return (
    <DispatchConfigContext.Provider value={config}>{children}</DispatchConfigContext.Provider>
  );
}

export function useDispatchConfig(): DispatchProductConfig {
  return useContext(DispatchConfigContext);
}
