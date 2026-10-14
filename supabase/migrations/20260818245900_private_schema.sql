-- Cron helpers live in private. Production already has this schema.
-- A fresh replay does not, and the finance doctor migration creates a function here.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO postgres, service_role;
