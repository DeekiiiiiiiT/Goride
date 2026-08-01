import type { ModuleKey } from '@roam/platform-settings';
import { RequireModule } from '@/app/modules/RequireModule';

/** Wrap a page with module packaging gate. */
export function Gated({
  module,
  children,
}: {
  module: ModuleKey;
  children: React.ReactNode;
}) {
  return <RequireModule module={module}>{children}</RequireModule>;
}
