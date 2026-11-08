-- Phase 3a (20261106204744) created these two trigger functions without the
-- standard REVOKE. They only run as triggers; lock them down like every other
-- public function so anon / authenticated can't call them directly.
REVOKE ALL ON FUNCTION public.trg_part_listing_auto_trust() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_vehicle_oe_number_auto_trust() FROM PUBLIC, anon, authenticated;
