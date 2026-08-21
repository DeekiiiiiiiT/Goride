-- Rush order chat: public.order_messages for Realtime + RLS (mirrors ride_messages pattern).

CREATE TABLE IF NOT EXISTS public.order_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES delivery.orders(id) ON DELETE CASCADE,
  pair TEXT NOT NULL CHECK (pair IN (
    'customer_courier',
    'customer_merchant',
    'merchant_courier',
    'support'
  )),
  sender_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN (
    'customer',
    'merchant',
    'courier',
    'support',
    'system'
  )),
  body TEXT NOT NULL CHECK (char_length(body) >= 1 AND char_length(body) <= 500),
  quick_reply_key TEXT NULL,
  -- Stamped for pairs involving a courier so reassignment does not leak history.
  courier_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_messages_order_pair_created_idx
  ON public.order_messages (order_id, pair, created_at ASC);

CREATE INDEX IF NOT EXISTS order_messages_order_pair_courier_created_idx
  ON public.order_messages (order_id, pair, courier_user_id, created_at ASC)
  WHERE courier_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS order_messages_reports_order_idx
  ON public.order_messages (order_id, created_at DESC);

COMMENT ON TABLE public.order_messages IS
  'Rush in-order chat (public schema for Realtime). Writes via service role only.';

ALTER TABLE public.order_messages ENABLE ROW LEVEL SECURITY;

-- Reported messages flag table (consumer report → support desk)
CREATE TABLE IF NOT EXISTS public.order_message_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.order_messages(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES delivery.orders(id) ON DELETE CASCADE,
  reporter_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT NULL CHECK (reason IS NULL OR char_length(reason) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, reporter_user_id)
);

ALTER TABLE public.order_message_reports ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.order_message_reports TO authenticated;
GRANT SELECT, INSERT ON public.order_message_reports TO service_role;

-- Participant SELECT: pair-scoped + courier history isolation
DROP POLICY IF EXISTS order_messages_participant_select ON public.order_messages;
CREATE POLICY order_messages_participant_select ON public.order_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM delivery.orders o
      WHERE o.id = order_messages.order_id
        AND (
          -- Customer on customer_* or support pairs
          (
            order_messages.pair IN ('customer_courier', 'customer_merchant', 'support')
            AND EXISTS (
              SELECT 1 FROM delivery.customers c
              WHERE c.id = o.customer_id AND c.user_id = auth.uid()
            )
          )
          OR
          -- Merchant owner / team with orders permission on merchant_* or support
          (
            order_messages.pair IN ('customer_merchant', 'merchant_courier', 'support')
            AND (
              EXISTS (
                SELECT 1 FROM delivery.merchants m
                WHERE m.id = o.merchant_id AND m.owner_id = auth.uid()
              )
              OR EXISTS (
                SELECT 1 FROM delivery.merchant_team_members tm
                WHERE tm.merchant_id = o.merchant_id
                  AND tm.user_id = auth.uid()
                  AND 'orders' = ANY (tm.permissions)
              )
            )
          )
          OR
          -- Courier: only messages stamped with their user id (reassignment-safe)
          (
            order_messages.pair IN ('customer_courier', 'merchant_courier', 'support')
            AND order_messages.courier_user_id IS NOT NULL
            AND order_messages.courier_user_id = auth.uid()
          )
        )
    )
  );

GRANT SELECT ON public.order_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_messages TO service_role;

ALTER TABLE public.order_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'order_messages'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.order_messages;
    END IF;
  END IF;
END $$;

-- Retention: anonymize/purge completed order chat older than N days, keep open support cases.
CREATE OR REPLACE FUNCTION public.purge_order_messages_retention(p_days integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, delivery
AS $$
DECLARE
  deleted_count integer := 0;
BEGIN
  WITH doomed AS (
    SELECT om.id
    FROM public.order_messages om
    JOIN delivery.orders o ON o.id = om.order_id
    WHERE o.status IN ('completed', 'cancelled', 'delivered')
      AND COALESCE(o.delivered_at, o.cancelled_at, o.updated_at) < (now() - make_interval(days => p_days))
      AND NOT EXISTS (
        SELECT 1 FROM delivery.support_cases sc
        WHERE sc.order_id = o.id
          AND sc.status IN ('open', 'pending')
      )
  )
  DELETE FROM public.order_messages om
  USING doomed d
  WHERE om.id = d.id;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_order_messages_retention(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_order_messages_retention(integer) TO service_role;

COMMENT ON FUNCTION public.purge_order_messages_retention(integer) IS
  'Deletes order_messages for terminal orders older than p_days, excluding open support cases.';

NOTIFY pgrst, 'reload schema';
