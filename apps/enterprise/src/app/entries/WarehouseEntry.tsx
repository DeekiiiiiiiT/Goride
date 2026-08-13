import { ProductProviders } from '@/app/ProductProviders';
import { RequireAuth, WrongProductLineGate } from '@/app/auth/RequireAuth';
import { ModuleAccessProvider } from '@/app/modules/ModuleAccessProvider';
import { SeatAccessProvider } from '@/app/seats/SeatAccessProvider';
import { WarehouseShell } from '@/app/layout/WarehouseShell';
import { WrongDoorGuard } from '@/app/verticals/WrongDoorGuard';

/** Freight Forwarder product door (`freight-forwarder.*` / legacy `warehouse.*`). */
export default function WarehouseEntry() {
  return (
    <ProductProviders>
      <RequireAuth>
        <WrongProductLineGate>
          <ModuleAccessProvider>
            <SeatAccessProvider>
              <WrongDoorGuard door="freight_forwarder">
                <WarehouseShell />
              </WrongDoorGuard>
            </SeatAccessProvider>
          </ModuleAccessProvider>
        </WrongProductLineGate>
      </RequireAuth>
    </ProductProviders>
  );
}
