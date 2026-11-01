-- Fleet Find parts Rev 3 — workflow fields for FP8/FP10 and Dominion drawer (31 Oct 2026)

alter table public.parts_sourcing_requests
  add column if not exists resolution_note text,
  add column if not exists looking_note text,
  add column if not exists assigned_to uuid,
  add column if not exists install_side text,
  add column if not exists install_position text,
  add column if not exists sent_at timestamptz,
  add column if not exists looking_at timestamptz,
  add column if not exists added_at timestamptz,
  add column if not exists cant_find_at timestamptz,
  add column if not exists cant_find_reason text;

alter table public.part_master
  add column if not exists description text,
  add column if not exists standard_ref text,
  add column if not exists certification text;

alter table public.maintenance_service_categories
  add column if not exists reference_note text;
