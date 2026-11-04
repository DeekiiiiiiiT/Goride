-- AS7-01: allow O2 catalyst positions on part_listing and part_listing_exclusion.

ALTER TABLE public.part_listing DROP CONSTRAINT IF EXISTS part_listing_position_check;
ALTER TABLE public.part_listing
  ADD CONSTRAINT part_listing_position_check
  CHECK (
    position IS NULL
    OR position IN ('front', 'rear', 'before_cat', 'after_cat')
  ) NOT VALID;

ALTER TABLE public.part_listing_exclusion DROP CONSTRAINT IF EXISTS part_listing_exclusion_position_check;
ALTER TABLE public.part_listing_exclusion
  ADD CONSTRAINT part_listing_exclusion_position_check
  CHECK (
    position IS NULL
    OR position IN ('front', 'rear', 'before_cat', 'after_cat')
  ) NOT VALID;

ALTER TABLE public.part_listing VALIDATE CONSTRAINT part_listing_position_check;
ALTER TABLE public.part_listing_exclusion VALIDATE CONSTRAINT part_listing_exclusion_position_check;
