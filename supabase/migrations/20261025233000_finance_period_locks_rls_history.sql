-- Same lock-date row security was recorded twice.
-- 20261025005733 ran the statements. 20261025210000 is the repo file.
-- Drop the extra version. Does not change the tables.

DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20261025005733'
  AND name = 'finance_period_locks_rls';
