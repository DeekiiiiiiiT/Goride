-- Tenant isolation checks for external (off-platform) orgs.
-- Run after 20260822120000_external_organizations.sql as a privileged role,
-- then verify as a non-owner authenticated user if testing RLS in SQL editor.
--
-- Expected:
-- 1. External orgs have owner_id IS NULL and created_by_org_id IS NOT NULL.
-- 2. A creator can SELECT their external orgs.
-- 3. Another org owner cannot SELECT someone else's external org (RLS).

SELECT id, name, is_external, owner_id, created_by_org_id
FROM public.organizations
WHERE is_external = true
LIMIT 20;

-- Cross-tenant leak probe (should be 0 rows for a non-creator auth.uid()):
-- SET ROLE authenticated;  -- only in a session with a JWT
-- SELECT count(*) AS leaked
-- FROM public.organizations
-- WHERE is_external = true
--   AND created_by_org_id IS DISTINCT FROM (
--     SELECT id FROM public.organizations WHERE owner_id = auth.uid() LIMIT 1
--   );
