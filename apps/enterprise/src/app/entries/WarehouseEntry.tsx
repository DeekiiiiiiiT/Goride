import { ProductProviders } from '@/app/ProductProviders';
import { RequireAuth, WrongProductLineGate } from '@/app/auth/RequireAuth';
import { ModuleAccessProvider } from '@/app/modules/ModuleAccessProvider';
import { SeatAccessProvider } from '@/app/seats/SeatAccessProvider';
import { WarehouseShell } from '@/app/layout/WarehouseShell';
import { WrongDoorGuard } from '@/app/verticals/WrongDoorGuard';

/** Warehouse product door entry (`warehouse.*` or path /warehouse on apex/preview). */
export default function WarehouseEntry() {
  return (
    <ProductProviders>
      <RequireAuth>
        <WrongProductLineGate>
          <ModuleAccessProvider>
            <SeatAccessProvider>
              <WrongDoorGuard door="warehouse">
                <WarehouseShell />
              </WrongDoorGuard>
            </SeatAccessProvider>
          </ModuleAccessProvider>
        </WrongProductLineGate>
      </RequireAuth>
    </ProductProviders>
  );
}
