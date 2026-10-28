-- App API can read fleet.workforce_memberships through this public view.
CREATE OR REPLACE VIEW public.fleet_workforce_memberships AS
  SELECT
    id,
    organization_id,
    user_id,
    service_line,
    status,
    joined_at,
    joined_via,
    join_request_id,
    invite_id,
    ended_at,
    ended_by,
    ended_reason,
    created_at,
    updated_at
  FROM fleet.workforce_memberships;

REVOKE ALL ON public.fleet_workforce_memberships FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_workforce_memberships TO service_role;

NOTIFY pgrst, 'reload schema';
