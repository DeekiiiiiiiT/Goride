import { ProductProviders } from '@/app/ProductProviders';
import { RequireAuth, WrongProductLineGate } from '@/app/auth/RequireAuth';
import { AppShell } from '@/app/layout/AppShell';

export default function AppEntry() {
  return (
    <ProductProviders>
      <RequireAuth>
        <WrongProductLineGate>
          <AppShell />
        </WrongProductLineGate>
      </RequireAuth>
    </ProductProviders>
  );
}
