# Supabase migrations — maintenance logging

**Policy (audit P-03):** Apply versioned SQL only with `npx supabase db push` from a linked CLI so `schema_migrations.version` matches the filename in [supabase/migrations](../supabase/migrations). Do **not** apply the same migration through the Dashboard SQL editor or MCP `apply_migration` unless you immediately rename/add a matching file in the repo — otherwise production and git drift (fourth occurrence: `20261105010000` vs `20261101043001/06/15`).

**Already on production:** `20261101043001_fleet_maintenance_no_record_r04.sql`, `20261101043006_fleet_maintenance_no_record_r04_recompute_view.sql`, `20261101043015_fleet_maintenance_no_record_r04_due_view.sql` — do not re-run on live; fresh environments apply the full chain in timestamp order.
