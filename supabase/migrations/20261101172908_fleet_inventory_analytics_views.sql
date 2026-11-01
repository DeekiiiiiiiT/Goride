-- from 20261101192200
CREATE OR REPLACE VIEW fleet.v_inv_kit_reserve WITH (security_invoker = true) AS SELECT b.organization_id, b.item_id, i.name AS item_name, b.location_id, b.on_hand, b.reserved, GREATEST(b.on_hand - b.reserved, 0) AS available FROM fleet.inv_balance b JOIN fleet.inv_item i ON i.id = b.item_id AND i.organization_id = b.organization_id WHERE b.reserved > 0;
CREATE OR REPLACE VIEW public.fleet_inv_v_kit_reserve WITH (security_invoker = true) AS SELECT * FROM fleet.v_inv_kit_reserve;
REVOKE ALL ON public.fleet_inv_v_kit_reserve FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fleet_inv_v_kit_reserve TO service_role;
