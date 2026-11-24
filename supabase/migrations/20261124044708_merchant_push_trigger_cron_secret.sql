-- Phase 0 of docs/supabase-key-rotation-plan.md: the merchant new-order push must stop
-- carrying a service_role JWT inside the trigger arguments.
--
-- Before: trigger "notify-merchant-new-order" on delivery.orders called
--   supabase_functions.http_request(...) with 'Authorization: Bearer <service_role JWT>'
--   hard-coded in the trigger definition. That JWT is the key leaked from the repo, so the
--   trigger both stored it in plain text (visible to anyone who can read pg_trigger) and
--   relied on it to be accepted by merchant-push.
--
-- After: a trigger function that reads private.fleet_ops_secrets('fleet_cron_secret') and
--   calls merchant-push with header X-Fleet-Cron-Secret — the same pattern as
--   private.invoke_rush_delivery / private.invoke_fuel_period_auto_close.
--   merchant-push already accepts X-Fleet-Cron-Secret (requireInternalSecret with
--   FLEET_CRON_SECRET), so no function change is needed for this phase.
--
-- merchant-push still understands the Supabase database-webhook payload shape
-- ({record:{merchant_id,order_number,total}}), which is what this function sends, so the
-- push text and the /orders deep link are unchanged.

CREATE OR REPLACE FUNCTION private.notify_merchant_new_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'net', 'private'
AS $function$
DECLARE
  secret text;
  req_id bigint;
BEGIN
  -- No merchant on the order: nothing to notify.
  IF NEW.merchant_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT value INTO secret FROM private.fleet_ops_secrets WHERE name = 'fleet_cron_secret';
  IF secret IS NULL OR length(secret) < 8 THEN
    -- Never block an order insert because the push could not be queued.
    RAISE WARNING 'notify_merchant_new_order: fleet_cron_secret missing, push skipped for order %', NEW.id;
    RETURN NEW;
  END IF;

  BEGIN
    SELECT net.http_post(
      url := 'https://csfllzzastacofsvcdsc.supabase.co/functions/v1/merchant-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Fleet-Cron-Secret', secret
      ),
      body := jsonb_build_object(
        'type', 'INSERT',
        'schema', 'delivery',
        'table', 'orders',
        'record', jsonb_build_object(
          'merchant_id', NEW.merchant_id,
          'order_number', NEW.order_number,
          'total', NEW.total
        )
      ),
      timeout_milliseconds := 5000
    ) INTO req_id;
  EXCEPTION WHEN OTHERS THEN
    -- pg_net queue trouble must not roll back the order.
    RAISE WARNING 'notify_merchant_new_order: enqueue failed for order %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.notify_merchant_new_order() FROM PUBLIC, anon, authenticated, service_role;

-- Swap the trigger. Same name, so pg_cron / docs / nothing else needs to change.
DROP TRIGGER IF EXISTS "notify-merchant-new-order" ON delivery.orders;

CREATE TRIGGER "notify-merchant-new-order"
AFTER INSERT ON delivery.orders
FOR EACH ROW EXECUTE FUNCTION private.notify_merchant_new_order();
