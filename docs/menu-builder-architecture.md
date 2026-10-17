# Menu builder: what's left

**Rev 4 · 2026-10-17** · M1–M4 are fixed and the server is live. Engineering for N1/N2/option sold-out is in the repo; shipping (commit → publish Domino’s → deploy) remains.

**Verified:**
- `delivery` v874 matches the repo for all 16 engine and checkout files.
- The `draft_snapshot` column is in production.
- Domino's draft now holds all 15 dishes (it was empty before).
- Partner engine routes check store membership with `"menu"` permission.
- Live sold-out and location overrides are applied at checkout.
- Engine tests: 20 of 20 pass.

---

## 1. Must fix

| # | Problem | Status |
|---|---|---|
| N1 | Engine-only dishes skipped sold-out + In-House 14-day price check | **Fixed in repo** — checkout prices first, then `evaluateInHousePricedLines` / `assertInHouseCheckout` (freshness + availability + restaurant cost). Publish upserts `menu_items` shadow rows; Brand catalog has product Sold out via `location_overrides`. Confirm prices stamps `priceCheckedAt`. |
| N2 | Engine tests not in CI | **Fixed in repo** — `pnpm --filter @roam/menu-engine test` + Deno `exports.drift.test.ts` + `checkout.test.ts` in `ci.yml`. |

## 2. Small item

- Option-level sold-out: **Fixed in repo** — ProductTypeEditor live option Sold out writes `location_overrides` (`target_kind: option`) without republish.

## 3. Ship

- **Commit** the menu-engine work on its own (exclude `apps/driver/**`). Ask explicitly when ready.
- **Publish Domino's:** Confirm prices → Parity → Publish (shadow rows sync on publish). Then capture Jamaica options via `docs/menu-chain-capture-playbook.md`.
- **Deploy the admin first,** then `dash-customer` after E2E: half-and-half, light sauce, double cheese, buyer checklist, sold-out refuse.

## 4. Done when

- [x] An engine-only dish that's sold out, or has a price older than 14 days, can't be ordered at an In-House store. *(code + unit tests; verify on live after deploy)*
- [x] CI fails if the 15-dish parity test fails. *(wired in `ci.yml`)*
- [ ] Domino's is published and a test order matches the price on their site.
