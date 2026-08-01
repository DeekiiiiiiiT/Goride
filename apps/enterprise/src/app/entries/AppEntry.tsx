import { ProductProviders } from '@/app/ProductProviders';
import { RequireAuth, WrongProductLineGate } from '@/app/auth/RequireAuth';
import { ModuleAccessProvider } from '@/app/modules/ModuleAccessProvider';
import { AppShell } from '@/app/layout/AppShell';

export default function AppEntry() {
  return (
    <ProductProviders>
      <RequireAuth>
        <WrongProductLineGate>
          <ModuleAccessProvider>
            <AppShell />
          </ModuleAccessProvider>
        </WrongProductLineGate>
      </RequireAuth>
    </ProductProviders>
  );
}
