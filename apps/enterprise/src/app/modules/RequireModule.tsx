import type { ModuleKey } from '@roam/platform-settings';
import { Navigate, useLocation } from 'react-router-dom';
import { useModuleAccess } from '@/app/modules/ModuleAccessProvider';
import { useSeatAccess } from '@/app/seats/SeatAccessProvider';
import { FREIGHT_FORWARDER_PATH, isFreightForwarderPath } from '@/app/productDoor';

export function RequireModule({
  module,
  children,
}: {
  module: ModuleKey;
  children: React.ReactNode;
}) {
  const { isModuleEnabled, loading, modulesError, refresh } = useModuleAccess();
  const { canAccessModule } = useSeatAccess();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  if (!isModuleEnabled(module) || !canAccessModule(module)) {
    if (modulesError && !isModuleEnabled(module)) {
      return (
        <div className="mx-auto max-w-md space-y-3 rounded-xl border border-amber-200 bg-amber-50 px-6 py-8 text-center">
          <p className="text-sm font-medium text-amber-950">Couldn’t verify module access</p>
          <p className="text-sm text-amber-900">{modulesError}</p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400"
          >
            Retry
          </button>
        </div>
      );
    }
    const home = isFreightForwarderPath(location.pathname) ? FREIGHT_FORWARDER_PATH : '/app';
    return <Navigate to={home} replace />;
  }

  return <>{children}</>;
}
