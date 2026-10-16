import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { legacySettingsPath } from './nav';

/** Redirect old `/settings?tab=` / `?scope=` URLs to `/settings/:area/:section`. */
export function LegacySettingsRedirect() {
  const [params] = useSearchParams();
  const location = useLocation();
  const tab = params.get('tab');
  const scope = params.get('scope');

  if (!tab && !scope) {
    return <Navigate to="/settings" replace />;
  }

  const path = legacySettingsPath(tab, scope);
  // Drop legacy query keys; keep unrelated ones if any
  const next = new URLSearchParams(params);
  next.delete('tab');
  next.delete('scope');
  const search = next.toString();
  return <Navigate to={`${path}${search ? `?${search}` : ''}${location.hash}`} replace />;
}
