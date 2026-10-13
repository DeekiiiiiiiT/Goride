import { PageHeader } from '../../components/ui/PageHeader';
import { IdentityDirectoryPage } from '../users/IdentityDirectoryPage';

export function CustomersHubPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Customers" description="People who order on Rush." />
      <IdentityDirectoryPage lockedPersona="customer" embedded />
    </div>
  );
}
