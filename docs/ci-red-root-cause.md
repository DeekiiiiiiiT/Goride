# GitHub Actions red: what's left

Rev 20. Closed 2026-11-02 after `8b3055bd` + follow-up on `main`.

**Status:** Rev 19 fixes shipped; follow-up migration + `local_smtp` config pushed — confirm **CI** and **Parts SQL checks** green on latest `main` before treating as closed.

**Green:** Vercel (unchanged).

## What Rev 19 fixed (shipped)

1. **DK7 plate** — Removed forbidden plate fallback in `DkUpdateReportedItemSheet.tsx`; plate chip only when `reportNo` exists.
2. **Admin typecheck** — `description` on `MaintenanceServiceCategory`, `PendingResearchJobPanel` typing, removed dead `PartsImportPanel` / Import tab (Import by area remains).
3. **Parts stock engine** — Migration `20261102131551_adjust_org_part_stock_inventory_engine.sql` on production; `parts_rev2_checks.sql` seeds stock via `inv_opening_balance` instead of inserting into the `org_part_stock` view.

## Follow-up in same closure (Parts SQL unblock)

Parts SQL reached work-order line inserts and hit `maintenance_audit_log_trigger_fn` assuming `NEW.organization_id` on lines. Fixed in `20261102132407_maintenance_audit_log_line_org.sql` (resolve org from parent work order).

CI **Start Supabase** step failed on Supabase CLI 2.99 rejecting `[inbucket]`; renamed to `[local_smtp]` in `supabase/config.toml` (local dev only — not a production config push).

## Verify

After push: GitHub **CI** and **Parts SQL checks** on latest `main` must be green (gap audit, admin typecheck ≤20, `parts_rev2_checks.sql` + five other SQL files, Supabase start).

## Rule for next time

- When a table becomes a view, search for every `INSERT`/`UPDATE`/`DELETE` against it, in functions and tests, in the same change.
- Never put real plate numbers or record numbers in screen code. Use sample labels.
- Audit triggers on child tables must not assume parent columns exist on `NEW`.
