-- ═══════════════════════════════════════════════════════════════════════════
-- One-time purge: legacy trip-sourced KV rows under ledger:% (NOT ledger_event:*)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- When: After full backup + stakeholder sign-off (see src/solution.md Phase 7 / 9).
-- Where: Supabase SQL Editor or a reviewed migration — NOT invoked by the app.
--
-- Table name must match your project. This repo’s Edge server uses kv_store_37f42386.
-- If your table differs, replace it everywhere below.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 1) VERIFY — run these first; keep the output with your change ticket.
-- ═══════════════════════════════════════════════════════════════════════════

-- Count legacy rows (should match GET /ledger/count → legacyLedgerEntries for same org scope;
--   raw SQL here is global unless you add org filters).
SELECT count(*) AS legacy_ledger_rows
FROM kv_store_37f42386
WHERE key LIKE 'ledger:%';

-- Sanity: canonical events must NOT be touched by this script
SELECT count(*) AS canonical_ledger_event_rows
FROM kv_store_37f42386
WHERE key LIKE 'ledger_event:%';

-- Optional: sample keys (inspect before delete)
-- SELECT key FROM kv_store_37f42386 WHERE key LIKE 'ledger:%' LIMIT 25;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) DELETE — irreversible. Re-run section 1 after delete; legacy count should be 0.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Prefer a short maintenance window. For very large tables, ask DBA about batched
-- DELETE ... WHERE key IN (SELECT key ... LIMIT N) in a loop instead of one shot.
--

-- BEGIN;
-- DELETE FROM kv_store_37f42386 WHERE key LIKE 'ledger:%';
-- COMMIT;

-- Uncomment the three lines above when ready. If your host requires a single statement:
-- DELETE FROM kv_store_37f42386 WHERE key LIKE 'ledger:%';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) AFTER PURGE — optional code/doc cleanup (repo)
-- ═══════════════════════════════════════════════════════════════════════════
-- See docs/LEDGER_LEGACY_INVENTORY.md → "Checklist after full KV purge".
-- GET /ledger/count may still return legacyLedgerEntries: 0; you can then simplify
-- the server and Delete Center UI if desired.
