import { ProductProviders } from '@/app/ProductProviders';
import { RequireAuth, WrongProductLineGate } from '@/app/auth/RequireAuth';
import { ModuleAccessProvider } from '@/app/modules/ModuleAccessProvider';
import { SeatAccessProvider } from '@/app/seats/SeatAccessProvider';
import { WarehouseShell } from '@/app/layout/WarehouseShell';

/** Invitation / seat-gated Warehouse vertical at /warehouse. */
export default function WarehouseEntry() {
  return (
    <ProductProviders>
      <RequireAuth>
        <WrongProductLineGate>
          <ModuleAccessProvider>
            <SeatAccessProvider>
              <WarehouseShell />
            </SeatAccessProvider>
          </ModuleAccessProvider>
        </WrongProductLineGate>
      </RequireAuth>
    </ProductProviders>
  );
}
