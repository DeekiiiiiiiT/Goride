# Fleet Inventory & Asset Management — Audit

**Rev 25 · 2 Nov 2026 · R24 completion (gap wiring, CI gates, deploy).**
**Scope:** Fleet → Vehicle Operations → Inventory & Asset Management, and the Roam Driver car kit. Admin is out of scope.

**Closed this round (R24):**
- R24-01: Gap and driver car-kit buttons wired (save, cancel, exports, multi-line forms, kit confirm modal, categories from API, requisition tab counts, etc.).
- R24-02: Sample literals removed; amounts and labels come from hooks + `inv_settings` / loaded rows.
- R24-03: [`scripts/assert-inventory-gap-audit.mjs`](../scripts/assert-inventory-gap-audit.mjs) enforces dead buttons, literal `J$`, record codes, and forbidden plates in gap/car-kit TSX.
- R24-04: Changes committed; `supabase db push` reports remote up to date (includes `photo_paths`); `pnpm deploy:fleet-core` smoke passed (Nov 2026).
- Parts-import migration versions renamed from invalid hour-24 to `20261101223000`–`20261101223400`.

**Still open:**
- R15-01: Signed-in live PNG capture — run [`scripts/capture-inventory-screen-live.mjs`](../scripts/capture-inventory-screen-live.mjs) with `playwright/.auth/fleet.json` after refreshing auth storage; compare `*-live.png` to Stitch `screen.png`.

**Closed carry-forward:**
- No string `style`; inventory type errors are 0.
- Primary gap hooks call save, approve, publish, snooze, count and unpair routes.
- Ledger stock value J$69,380 (verified via SQL sum on `fleet.inv_balance`).

---

## 1. Open items

### R15-01: live screenshots need signed-in capture

**Fix:** after deploy, run the signed-in capture and compare each `screen-live.png` with its Stitch reference PNG (see [`docs/fleet-inventory-live-png-checklist.md`](fleet-inventory-live-png-checklist.md)).

---

## 2. Checks

1. `node scripts/typecheck-fleet-inventory.mjs` reports 0 inventory errors.
2. `node scripts/assert-inventory-gap-audit.mjs` passes (R24-03 rules included).
3. Run [`scripts/sql/fleet_inventory_integrity_checks.sql`](../scripts/sql/fleet_inventory_integrity_checks.sql): every query returns 0 rows, and stock value is J$69,380.
4. In production, spot-check gap modals; edge logs should show 200 on save/export paths.
