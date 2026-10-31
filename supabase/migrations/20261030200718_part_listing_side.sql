-- Left / right on a listing. Blank still fits both sides.

alter table public.part_listing
  add column if not exists side text;

alter table public.part_listing
  drop constraint if exists part_listing_side_check;

alter table public.part_listing
  add constraint part_listing_side_check
  check (side is null or side in ('left', 'right', 'both'));
