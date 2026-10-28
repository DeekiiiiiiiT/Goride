-- Phase 8: Mark rides.dispatch_settings as deprecated
-- Do NOT drop this table yet - it's still used for fallback during rollout

COMMENT ON TABLE rides.dispatch_settings IS 
  'DEPRECATED: Use matching.policies for dispatch configuration. This table is retained for backward compatibility during matching brain rollout. Will be removed after stable production operation.';

-- Also add comment to the view
COMMENT ON VIEW public.rides_dispatch_settings IS 
  'DEPRECATED: Use matching.policies via /admin/policies API. This view is retained for backward compatibility.';
