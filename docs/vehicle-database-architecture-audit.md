# Vehicle Database — Architecture Audit (open items only)

**Rev 4 · 2026-10-14** · Done items are removed; this lists only what's left.

**The rule:** Roam Dominion is the master reference database and never shows customer records. The Vehicle Database section (Catalog → Platforms & Engines → Maintenance templates → Parts) is one system built around `vehicle_catalog`. Every Roam app reads from it through the catalog API. Customer parts work lives in the RoamFleet app and RoamFleet `/admin` (Parts desk).

**Code is complete.** Every architecture item from Rev 1–3 is closed, committed (`5f988257`) and live.

**Verified 2026-10-14:**
- **Migrations:** `20261015030000` and `20261015120000` are recorded on both sides.
- **Live bundles:** downloaded and checked. Org routes are gone from Dominion, the Parts desk has number reviews, and readiness refresh is present.
- **Cron:** `catalog-demand-readiness` 03:30 UTC and `parts-repeat-alerts` 06:15 UTC.
- **Tests:** the privacy test now runs the real Dominion routes. Deno 14/14, CSV vitest 1/1, SQL checks on every PR, fleet `tsc` 501, no admin errors in parts files.

---

## Open items

### B-1 — Low-Medium — Readiness goes stale after every edit

`variant_parts_readiness` is now a materialised view, refreshed only by the nightly cron, the "Refresh demand" button and "Seed in-use". None of these refresh it:
- Confirm / Reject a part
- Attach / Add a part
- Add a rule
- Approve a proposal
- Set a family

So:
- **Stale matrix:** the Data quality matrix doesn't change after you click Confirm, which looks like the click failed.
- **Gate lags:** the catalog API (`catalog_api.ts:49`) gates tiered search on this view. A variant you just finished stays "not ready" until 03:30 UTC. A rejected part can leave a variant "ready" with a missing component until then.

**Fix:** call `refresh_variant_parts_readiness()` at the end of those routes (it takes a second at 356 variants). Also show the "refreshed at" time on Data quality.

### B-2 — Low — "Seed in-use" widens fit without review

`seed_in_use_engine_parts()` takes a confirmed powertrain part that fits one in-use variant (by variant, platform or engine rule) and adds an **engine-family** rule. That instantly covers every chassis with that engine. It's tagged `seed_in_use`, so it's traceable, but nobody approves it.

**Fix:** write these as `part_rule_proposal` rows for the Data quality "Suggested rules" list instead of direct rules. Or show the blast radius and ask for confirmation before inserting.

### B-3 — Data (the tools are ready; this is the remaining work)

| Item | Prod now | Target |
|---|---|---|
| Confirmed parts | **0** of 36 | Verify the seeded numbers on Data quality first |
| Ready variants | **0** | ≥ 60% of in-use variants |
| Fitment rules | 22 | Platform rules for air filter / belt; pads, rotors, cabin filter, wipers, shocks per in-use platform |
| Maintenance templates | 5 global, **0** platform / engine / variant, **0** with a component | Platform / engine schedules with components (use the scoped form) |
| Platform families | **0** parents | Decide the `platform_family_review` rows |
| Reference offers | **0** | Suppliers + prices for in-use parts |

Work in-use variants first. The Data quality matrix sorts by demand.

---

## Checks to re-run next review

- **Prod:**
  - confirmed parts, ready variants, templates by scope / with component, platform parents, offers
  - `variant_parts_readiness` refreshed right after a Confirm (B-1)
- **Live code:** `npx supabase functions download fleet-core --project-ref csfllzzastacofsvcdsc` into a scratch dir, then grep. Your deploys don't rebuild the local bundles.
- **Tests:** Deno 14/14 · CSV vitest · fleet `tsc` 501.
