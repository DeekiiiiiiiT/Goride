import { Navigate } from 'react-router-dom';
import type { ModuleKey } from '@roam/platform-settings';
import { useModuleAccess } from '@/app/modules/ModuleAccessProvider';

export function RequireModule({
  module,
  children,
}: {
  module: ModuleKey;
  children: React.ReactNode;
}) {
  const { isModuleEnabled, loading } = useModuleAccess();

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  if (!isModuleEnabled(module)) {
    return <Navigate to="/app" replace />;
  }

  return <>{children}</>;
}
