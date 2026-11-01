# Fleet Inventory & Asset Management — Audit

**Rev 7 · 1 Nov 2026 · Rev 6 implementation complete (code + prod migrations).**
**Scope:** Fleet → Vehicle Operations → Inventory & Asset Management (Stitch IN1–IN18) and the Roam Driver car kit (Stitch DK1–DK6). Spec: `docs/stitch/roam-fleet-app/inventory/`, `docs/stitch/roam-driver-app/car-kit/`.

**Rev 6 closure summary**

| ID | Status | Notes |
|----|--------|--------|
| R6-01 | Done | `public.fleet_inv_*` bridge; controllers on `getServiceClient()`; prod `71948` / `71958`. |
| R6-03 | Done | Stitch spacing/typography tokens in Fleet + Driver `globals.css` / scoped CSS. |
| R6-06 | Done | Prod migrations `165324`–`165443` backfilled in repo. |
| R6-04 | Done | Virtual locations + double-entry (`20261101192000` / prod `172128`). |
| R6-05 | Done | Kit rebuild applied prod (`92100`); no direct `inv_ledger` updates. |
| R6-02 | Done | Equipment → `maintenance_events` + second spare opening balance (`92300`). |
| R6-10 | Done | Removed `apps/fleet/src/types/equipment.ts`; legacy HTTP routes return **410** when phase 2 on; drop migration applied. |
| R6-09 | Done | Eight analytics views + public bridge + GET routes; QR label remains JSON payload (printable label = follow-up). |
| R6-08 | Done | `POST /inventory/finance/post` returns **501** (no fake accept). |
| R6-07 | Done | IN/DK screens wired to shell/API; Stitch sample strings removed. |
| R6-11 | Done | Stable `Idempotency-Key` on `setOrgPartStock`; `org_part_stock_idempotency.test.ts`. |
| R6-12 | Partial | `docs/fleet-inventory-r6-live-capture.md` + `live-data` sample stripping; owner PNG captures still manual. |

**Deploy:** Redeploy **fleet-core** after pulling edge changes, then confirm Overview stock value (~**J$ 54,380**) and no “Invalid schema: fleet”.

**SQL checks:** Run `scripts/sql/fleet_inventory_integrity_checks.sql` for Roam org (off-peak); expect 0 rows.

---

## 1. Open items (Rev 7)

- **Side-by-side PNG proof:** Capture `screen-live.png` per `docs/fleet-inventory-r6-live-capture.md` (not checked into repo in this pass).
- **15 Stitch gap flows** (settings, import, PO editor, etc.) — still placeholders until Stitch exports land (`STITCH_GAP_SCREENS.md`).
- **Owner sign-off:** Maintenance UI shows migrated tyre/wheel history for 5179KZ; kit compliance target (7/10) after kit rebuild.
- **Printable QR asset label** — optional; API returns JSON at `POST .../assets/:id/qr-label`.

---

## 2. Screens the owner still needs to make in Stitch

Still placeholders ("Stitch screen pending"): Inventory settings · Add/edit item · Import items · Locations & bins · Opening balances · Register asset · New/edit purchase order · Add/edit vendor + list · Start a count + count sheet · New requisition + list · Approval review drawer · Pair mobile scanner · Snooze settings · Kit version compare · Driver "Update status" sheet.

---

## 3. Order to finish (post–Rev 6)

1. Deploy fleet-core → verify production Overview.
2. Owner PNG captures + Maintenance/kit sign-off.
3. Port each Stitch gap export via `scripts/port-inventory-stitch.mjs`.

**SQL checks (ongoing):** balances ≠ sum(ledger); movement legs not summing to zero; negative stock; asset status/location mismatch; cars without a kit; NULL `organization_id`; `inv_verify_chain` not ok.
