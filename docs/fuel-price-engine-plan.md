# Fuel Price Engine

**Rev 2 · 2026-10-28** · Built, deployed, and running on live data. 23 items left (below). Project `csfllzzastacofsvcdsc`.

Written for: the owner, and Cursor implementing it. Screens: [stitch/fuel-price-engine-prompts.txt](stitch/fuel-price-engine-prompts.txt).

Rules: no report is ever deleted, and a doubtful report goes to Review. Plug only shows the engine's price. Fleet's pump-photo capture never changes.

## Where it stands (live, 28 Oct)

- All 7 migrations are applied. explorer, fleet-fuel, petrojam-prices and platform-catalog were redeployed at 02:40 UTC. The daily 05:00 job is scheduled.
- There are 77 Fleet reports. **24 are accepted and 53 are in Review.** Of the 53, 39 have no grade, 13 are duplicates (5 pairs and one triple), and 1 is the J$39.07 fill.
- Only 4 stations have a price, and all 4 are "May be outdated". That part is correct: no accepted fill since Petrojam's 22 Oct week.
- **CI never ran any engine test.** CI stops at step 39, "Dominion Stitch contract". The Parts SQL replay stops in a Places migration first. Local Deno tests pass (8/8). Plug typecheck is clean.

## To do: all of it, in one release

### Engine SQL: one new migration

| # | Problem | Fix |
|---|---|---|
| 1 | **Both halves of a duplicate are flagged.** Each report sees the other as its duplicate, so both get weight 0 and the price counts **zero** times, not once. This holds all 13 duplicates in prod. | In `price_engine_check`, mark `DUPLICATE` only when the other report is **earlier** (on a tie, the lower `id` wins). |
| 2 | Duplicates go to Review. The plan says "kept, not counted twice", so they don't need the owner. | A report whose only reason is `DUPLICATE` → `accepted` with weight 0. |
| 3 | Every no-grade report also gets `OUT_OF_BOUNDS`, because there's no wholesale price for "unknown". Review shows 2 reasons where only 1 is real. | Skip the bounds check when the grade is unknown. |
| 4 | `UNUSUAL_FOR_STATION` uses MAD, and a station's prices are often identical (e.g. 229.3578 ×3). That makes MAD 0, so a 1-cent difference gets flagged. | Use `greatest(MAD, 1% of median)`. |
| 5 | Trust updates use `UPDATE … FROM` with several rows per reporter, so only one row's +0.05/−0.10 lands. `accepted` also goes up by 1 per publish, not per report. | Sum the change and count the reports per reporter in a sub-select, then apply them once. |
| 6 | **Approve works on a no-grade or unverified-place report.** It leaves Review but can never publish. Bulk Approve on the 39 would clear them silently. | `price_engine_review` refuses `approved` while the grade is `unknown` or the status is `waiting_place`. The error says "Set the grade first" or "Verify the station first". |
| 7 | **The retirement script will break publishing.** `price_current`'s only unique key is `(station_id, grade)`. Once retirement drops `station_id`, the engine's `on conflict (place_id, grade)` has no key and fails. | Add `unique (place_id, grade)` on `places.price_current` now. |
| 8 | Changing a report's place, amount or litres doesn't re-run the engine. The triggers fire on insert and delete only. | Add an `after update of place_id, grade, litres, amount` trigger on both intakes. It re-checks the report, then publishes the old and new place/grade. |
| 9 | Plug reports are copied into `fleet.master_change_log` (with `reporter_hash`). After "delete my data" the copy stays. | Drop `plug_price_report_master_change`. Plug data isn't master data. |
| 10 | — | The migration ends by re-checking every report that isn't owner-decided, then republishing every place/grade. That clears #1–#4 from the live queue. |

### Fleet intake

| # | Problem | Fix |
|---|---|---|
| 11 | **Live fills with no grade are dropped.** `submitFleetPriceReport` returns early on `unknown`. Half of today's fills have no grade, so half of new fills would vanish. The backfill kept them. | Insert them with `grade = 'unknown'`. They wait in Review. |
| 12 | **Live fills are stamped at midnight.** `reported_at = entry.date` is a date only. Migration 250000 fixed exactly this for the backfill, because it made same-day fills look like duplicates. | Use the save time (`new Date().toISOString()`), the same as the backfill's `created_at`. |
| 13 | **Only the first save reaches the engine.** Later changes are dropped: a corrected amount (re-POST of the same id, duplicate key swallowed), a gas-card fill completed by `jaa/adopt-statement`, a station set by `stations/promote-learnt` / evidence-inbox / `reconcile-ledger-orphans`, or a deleted fill (`DELETE /fuel-entries/:id`). | Make one `syncFleetPriceReport(entry)` and call it from all of those routes. It upserts on `fuel_entry_id` (updating place, grade, litres and amount, so #8 fires). On delete it sets the check to `rejected` with the note "fill deleted": kept, never counted. |

### Dominion and CI

| # | Problem | Fix |
|---|---|---|
| 14 | No bulk grade. The 39 no-grade reports would take 39 separate clicks. | Add **Set grade** to the bulk bar in [PriceEngineReview.tsx](../apps/admin/src/components/admin/fuel-prices/PriceEngineReview.tsx). It calls the existing `/grade` route for each selected row. |
| 15 | A new admin `tsc` error: `replaceAll` at [priceEngineApi.ts:132](../apps/admin/src/components/admin/fuel-prices/priceEngineApi.ts#L132). | `.replace(/_/g, " ")`. |
| 16 | **CI fails before any engine test.** 4 Places review files are missing their `// Stitch:` lines (`PlacesReviewQueue`, `Split`, `Merge`, `Coverage` ×2). | Add the 5 markers that `node scripts/stitch-contract.mjs` prints. |
| 17 | **The Parts SQL replay fails before `price_engine_checks.sql`.** `places_phase4_public` asserts 56 public stations, and a fresh database has 0. | Wrap that assertion in `if exists (select 1 from places.place)`. Prod already applied it, so only replay changes. |
| 18 | The SQL test expects a duplicate Plug report in `review`. | After #2, expect `accepted`, weight 0. Add cases: a pair counts once (#1), no-grade isn't `OUT_OF_BOUNDS` (#3), Approve on unknown grade is refused (#6), and a place change republishes both places (#8). |

### Data, after deploy

| # | What | Done when |
|---|---|---|
| 19 | Link vehicle **5179KZ** to its catalog entry in Dominion, so future fills get the vehicle grade. It's the only vehicle, and it has no catalog link. | New fills show `grade_source = vehicle`. |
| 20 | Bulk **Set grade E-10 87** on the 39 no-grade reports. The vehicle's other fills are 36 × 87 and 2 × 90, so check the 90 ones first. Then Reject the J$39.07 fill. | The Review queue is 0, or only real doubts. |
| 21 | Check the first runs: the daily job (05:00 UTC, 29 Oct), and Petrojam's 29 Oct week via `petrojam-weekly-sync`. | `cron.job_run_details` shows success. Prices from older weeks show "May be outdated". |
| 22 | Watch the first live Fleet fill after deploy. | It has a report with a real time, and it's accepted or in Review within seconds. |
| 23 | Run `scripts/sql/places_phase8_retire.sql` on or after 12 Nov, only after #7. | `price_observation` and `latest_retail_estimate` are gone, and a new fill still publishes. |

Outside this plan, for the fuel audits: 4 Fleet fills look entered twice. On 5 Oct 15:35 there are two J$5,000 / 21.33 L fills 2 s apart, and on 13 Oct three fills fall within 6 s. If they are double entries, the fuel charge is doubled too.
