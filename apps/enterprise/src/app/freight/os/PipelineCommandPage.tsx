import { Navigate } from 'react-router-dom';

/** Retired — Overview command center lives at /app (DashboardPage). */
export function PipelineCommandPage() {
  return <Navigate to="/app" replace />;
}
