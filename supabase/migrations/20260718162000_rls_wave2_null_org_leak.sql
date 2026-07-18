-- RLS Wave 2: remove organization_id IS NULL OR … financial leaks

-- ---------------------------------------------------------------------------
-- ledger.accounts / entries / source_receipts
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS ledger_accounts_select ON ledger.accounts;
CREATE POLICY ledger_accounts_select ON ledger.accounts
  FOR SELECT TO authenticated
  USING (
    public.rbac_is_platform_user(auth.uid())
    OR (owner_user_id IS NOT NULL AND owner_user_id = auth.uid())
    OR (
      organization_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.organizations o
        WHERE o.id = ledger.accounts.organization_id AND o.owner_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS ledger_entries_select ON ledger.entries;
CREATE POLICY ledger_entries_select ON ledger.entries
  FOR SELECT TO authenticated
  USING (
    public.rbac_is_platform_user(auth.uid())
    OR EXISTS (
      SELECT 1 FROM ledger.accounts a
      WHERE a.id IN (ledger.entries.debit_account_id, ledger.entries.credit_account_id)
        AND a.owner_user_id = auth.uid()
    )
    OR (
      organization_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.organizations o
        WHERE o.id = ledger.entries.organization_id AND o.owner_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS ledger_source_receipts_select ON ledger.source_receipts;
CREATE POLICY ledger_source_receipts_select ON ledger.source_receipts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ledger.entries e
      WHERE e.id = ledger_entry_id
        AND (
          public.rbac_is_platform_user(auth.uid())
          OR EXISTS (
            SELECT 1 FROM ledger.accounts a
            WHERE a.id IN (e.debit_account_id, e.credit_account_id)
              AND a.owner_user_id = auth.uid()
          )
          OR (
            e.organization_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM public.organizations o
              WHERE o.id = e.organization_id AND o.owner_id = auth.uid()
            )
          )
        )
    )
  );

-- ---------------------------------------------------------------------------
-- Driver financial ledger rebuild tables
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS fin_events_select ON ledger.financial_events;
CREATE POLICY fin_events_select ON ledger.financial_events
  FOR SELECT TO authenticated
  USING (
    public.rbac_is_platform_user(auth.uid())
    OR driver_id = auth.uid()::text
    OR (
      organization_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.organizations o
        WHERE o.id = organization_id AND o.owner_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS fin_alloc_select ON ledger.financial_allocations;
CREATE POLICY fin_alloc_select ON ledger.financial_allocations
  FOR SELECT TO authenticated
  USING (
    public.rbac_is_platform_user(auth.uid())
    OR driver_id = auth.uid()::text
    OR (
      organization_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.organizations o
        WHERE o.id = organization_id AND o.owner_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS dfp_select ON ledger.driver_financial_periods;
CREATE POLICY dfp_select ON ledger.driver_financial_periods
  FOR SELECT TO authenticated
  USING (
    public.rbac_is_platform_user(auth.uid())
    OR driver_id = auth.uid()::text
    OR (
      organization_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.organizations o
        WHERE o.id = organization_id AND o.owner_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS dfp_lines_select ON ledger.driver_financial_period_lines;
CREATE POLICY dfp_lines_select ON ledger.driver_financial_period_lines
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ledger.driver_financial_periods p
      WHERE p.id = period_id
        AND (
          public.rbac_is_platform_user(auth.uid())
          OR p.driver_id = auth.uid()::text
          OR (
            p.organization_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM public.organizations o
              WHERE o.id = p.organization_id AND o.owner_id = auth.uid()
            )
          )
        )
    )
  );

NOTIFY pgrst, 'reload schema';
