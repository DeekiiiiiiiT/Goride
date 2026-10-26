-- Read-only check. It must return zero rows, and exactly one platform owner.
-- The same check runs nightly and writes platform.permission_audit_log when it fails.
-- Apply migration 20261026040000 first.

SELECT email, jwt_roles, table_roles, problem
FROM platform.role_consistency_problems();

-- Stop the script when the check fails. A clean result raises nothing.
SELECT platform.assert_role_consistency();
