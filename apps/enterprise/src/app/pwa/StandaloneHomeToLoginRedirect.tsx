import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isStandaloneDisplay } from '@fleet/pwa/pwaMeta';

/**
 * Installed Enterprise PWA used to open start_url `/` (marketing).
 * Send standalone launches on the marketing home to the sign-in screen.
 * Browser tabs on `/` keep the public marketing site.
 */
export function StandaloneHomeToLoginRedirect() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.pathname !== '/') return;
    if (!isStandaloneDisplay()) return;
    navigate('/login', { replace: true });
  }, [location.pathname, navigate]);

  return null;
}
