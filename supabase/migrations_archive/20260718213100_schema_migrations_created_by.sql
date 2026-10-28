-- CLI 2.99.0 creates schema_migrations without created_by.
-- Earlier history-align files insert that column. Add it when it is missing
-- so a fresh replay and the live database both accept those rows.

ALTER TABLE supabase_migrations.schema_migrations
  ADD COLUMN IF NOT EXISTS created_by text;
