#!/bin/sh
# Local replay of supabase/migrations from an empty database (mirrors the CI replay job).
psql -U supabase_admin -d postgres -q -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  s text;
BEGIN
  FOREACH s IN ARRAY ARRAY[
    'supabase_migrations', 'supabase_functions'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = s) THEN
      EXECUTE format('CREATE SCHEMA %I', s);
    END IF;
  END LOOP;
END $$;
-- The Supabase platform (and the CLI's local stack) ships this webhook trigger function; the production
-- dump references it, so a bare Postgres needs the same stub before the baseline runs.
CREATE OR REPLACE FUNCTION supabase_functions.http_request()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$ BEGIN RETURN NEW; END $fn$;
-- The CLI's local stack also ships the auth helper functions the production dump's policies call.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$ SELECT NULL::uuid $fn$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $fn$ SELECT NULL::text $fn$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $fn$ SELECT '{}'::jsonb $fn$;
CREATE OR REPLACE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $fn$ SELECT NULL::text $fn$;
-- The storage service owns storage.buckets / storage.objects in a real project; a bare Postgres has the schema
-- only. Minimal stand-ins so the production dump's bucket seed and the storage policies can run.
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  owner uuid,
  public boolean DEFAULT false NOT NULL,
  avif_autodetection boolean DEFAULT false NOT NULL,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text,
  name text,
  owner uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  last_accessed_at timestamptz DEFAULT now() NOT NULL,
  metadata jsonb,
  path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/')) STORED
);
CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[]
LANGUAGE sql IMMUTABLE AS $fn$ SELECT string_to_array(name, '/') $fn$;
CREATE OR REPLACE FUNCTION storage.filename(name text) RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$ SELECT (string_to_array(name, '/'))[cardinality(string_to_array(name, '/'))] $fn$;
-- Granted so the stubs above are usable from the migrator role, and so the production dump's bucket seed runs.
GRANT USAGE ON SCHEMA storage TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA storage TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA storage TO postgres;
GRANT USAGE ON SCHEMA supabase_functions TO postgres;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO postgres;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA supabase_functions TO postgres;
SQL
cd /tmp/migrations || exit 2
fail=0
for f in $(ls *.sql | sort); do
  if ! psql -U postgres -d postgres -q -v ON_ERROR_STOP=1 -1 -f "$f" >/tmp/out.log 2>&1; then
    echo "FAILED: $f"
    tail -8 /tmp/out.log
    fail=1
    break
  fi
done
echo "replay done fail=$fail"
