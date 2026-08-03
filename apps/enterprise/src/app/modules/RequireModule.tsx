import type { ModuleKey } from '@roam/platform-settings';
import { Navigate } from 'react-router-dom';
import { useModuleAccess } from '@/app/modules/ModuleAccessProvider';

export function RequireModule({
  module,
  children,
}: {
  module: ModuleKey;
  children: React.ReactNode;
}) {
  const { isModuleEnabled, loading, modulesError, refresh } = useModuleAccess();

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  if (!isModuleEnabled(module)) {
    if (modulesError) {
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
    return <Navigate to="/app" replace />;
  }

  return <>{children}</>;
}
