# Roam Rush In-House Processing: Open Items

**Rev 4 · 2026-10-12.** This page lists only what still needs fixing. Rev 1–3 history is in git.

**Status:** Rev 3 items 1–13 are fixed, except for one bug the fix itself introduced (item 1 below).
- **Live code:** `delivery` v845.
- **Production data:** 8 In-House migrations, 1 store (beta, not live), 0 tasks, and `IN_HOUSE_ENABLED` off.
- **Tests:** Deno 41/41 and merchant-ops 18/18 pass.

---

## 1. Event lookups read a column that doesn't exist (live in v845)

`procurement_events` has an **`at`** column. It has no `created_at`.

The new buyer-path code selects `created_at`:
- `taskEvents()` in `inHouse/routes.ts` (around line 71)
- the queue's event query (around line 210)

Supabase returns an error for that select. The error is ignored and the event list comes back **empty**, so `lastClaimer()` and `abandonMoment()` always return null.

What this breaks in production:
- **An abandoned order's purchase can never be recorded.** `receiptFollowsAbandon(..., null)` is always false, even for ops.
- **The original buyer can't record their spend** once a task has been retried or abandoned, because `purchaseRecording` returns `denied`. That spend never reaches the ledger. This is the gap Rev 3 items 2–3 were meant to close.
- The queue's "buyer" name and the retry audit's `buyer` field are always blank.

The unit tests passed because their sample events use `created_at`.

**Fix:**
1. Select `created_at:at` (a PostgREST alias) in both queries, or rename the field in code to `at`.
2. Check `error` on both queries and fail loudly, not with an empty list.
3. Change the test samples to the real column name, and add one check that runs `select to_state, actor_id, payload, at from delivery.procurement_events limit 0` against the database in CI.

## 2. Everything deployed is uncommitted

About 66 files are in production (v845 and the migrations) but not in git:
- the pizza and choice-list work;
- the Rev 3 fixes;
- `inHouse/customerMenu.ts`;
- `tools/in-house-cart-fill/`;
- 5 migration files.

The migration files now match the production versions, which closes the Rev 3 drift.

**Fix:** commit once item 1 is fixed, then check that `git status` is clean.

## 3. Alerts go to nobody

The sweep pages through `in_house_alert_phones`, which is **empty** in production.

**Fix:** add at least one ops phone number, then trigger a test page before the beta starts.

## 4. The customer store page reveals Roam's cost

For In-House stores, `GET /merchants/:id` still returns:
- each item's `in_store_price` (the restaurant's price) and its `source_*` fields;
- each option's `priceAdjustment` (the restaurant's add-on price) next to `marketplaceAdjustment`.

Nothing on screen shows these, but anyone inspecting the network traffic can work out the markup.

**Fix:** strip `in_store_price` and `source_*` from customer items. For options, send only the customer price (`marketplaceAdjustment`, or `priceAdjustment` for partners).

## 5. Launch steps (owner)

- [ ] Sign the ADR 0023 checklist (still 0 of 7).
- [ ] Add the beta customers to `delivery.in_house_beta_customers`.
- [ ] Turn on `IN_HOUSE_ENABLED`, and set the pilot store live with `audience = beta`.
- [ ] Pilot counter check: confirm the restaurant hands over a prepaid online carry-out order for "Roam {order number}" without seeing the card. If it won't, switch the store to phone ordering.
- [ ] Run the one-week closed beta, then set `audience = public`.

---

## Next check will confirm

- An abandoned task with a receipt uploaded after the abandon can be written off by ops.
- After a retry, the original buyer can still record their purchase (as a writeoff).
- `git status` is clean.
- A test page arrives on the ops phone.
- No In-House `in_store_price` appears in the customer store response.
