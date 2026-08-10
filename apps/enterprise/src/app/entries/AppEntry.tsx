import { ProductProviders } from '@/app/ProductProviders';
import { RequireAuth, WrongProductLineGate } from '@/app/auth/RequireAuth';
import { ModuleAccessProvider } from '@/app/modules/ModuleAccessProvider';
import { SeatAccessProvider } from '@/app/seats/SeatAccessProvider';
import { AppShell } from '@/app/layout/AppShell';
import { RedirectWarehouseSeatFromCourier } from '@/app/verticals/RedirectWarehouseSeatFromCourier';
import { WrongDoorGuard } from '@/app/verticals/WrongDoorGuard';

export default function AppEntry() {
  return (
    <ProductProviders>
      <RequireAuth>
        <WrongProductLineGate>
          <ModuleAccessProvider>
            <SeatAccessProvider>
              <WrongDoorGuard door="courier">
                <RedirectWarehouseSeatFromCourier>
                  <AppShell />
                </RedirectWarehouseSeatFromCourier>
              </WrongDoorGuard>
            </SeatAccessProvider>
          </ModuleAccessProvider>
        </WrongProductLineGate>
      </RequireAuth>
    </ProductProviders>
  );
}
