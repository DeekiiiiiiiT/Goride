# Roam Rush — Payment, Risk & Fraud Architecture Audit

**Revision 5 — 2026-10-05 (fourth pass):** fourth implementation pass verified (Part R5, directly below). Parts R4, R3, R2 and Rev 1 (the original audit, 2026-10-03) follow unchanged.
**Type:** Audit only. No code was changed while producing this document or its revisions.

---

## Part R5 — Fourth implementation pass (2026-10-05)

### R5.0 What was checked

Still uncommitted on `main`. Changes since R4:
- **new migrations:** `20261005010000_rush_money_r4.sql`, `20261005020000_rush_cron_door.sql`;
- **new files:** the edge function `supabase/functions/rush-cron/index.ts` (+ `verify_jwt = false` in `config.toml`), `_shared/rushMoney/shortCollection.ts`;
- **reworked files:** `routes.ts`, `cancelOrder.ts`, `executeRefund.ts`, `protocol.ts`, `collectOnDelivery.ts`, `processDispute.ts`, `supportRoutes.ts`, `financeRoutes.ts`, `orderRefund.ts`, `customerOrderRoutes.ts`, `cancelPolicy.ts`, `walletRules.ts`, `journalLines.ts`;
- **UI:** courier (safe drop restored, Can't-deliver), customer (checkout wallet line, Report Issue item ids, My Issues), merchant, admin (Remittance Desk, Finance).

All of the above was read in full.

- **Tests:** `deno test _shared/rushMoney/` passes **12 of 12** (now including a half-paid short-collection case), type-checked, all run in `ci.yml`.
- **Type check:** at the repo baseline. The `processDispute.ts` error that exposed X3 is gone; `rush-cron` type-checks clean.
- **Not checked:** live production data. The Supabase connection was still unavailable, so it is **still unverified whether the eight `2026100*` migrations are applied**, whether `rush-cron` is deployed with `FLEET_CRON_SECRET`, and whether the R2.4 gate queries return zero.

### R5.1 Verdict

**Every R4 finding (X1–X9) is fixed or reduced to a residual.** The quality of this pass is high:
- self-reports confirm and reject correctly, with the balance check, role check and a closed audit trail;
- short cash collections can no longer break the Layer A′ exact-sum rule, and both books now agree that the courier keeps their full share;
- missing-item refunds use real item ids and a per-customer budget;
- fault is stored on the refund instead of guessed from text;
- payouts carry unpaid amounts forward, net what restaurants owe, and lock exactly the lines they summed;
- chargeback outcomes are one-shot and role-gated;
- the failed-delivery protocol measures the wait from server timestamps and checks GPS against the drop-off pin (within 300 m);
- safe drop is back as its own choice.

You also found and fixed something I missed: the R2/R3 cron jobs read `app.settings.*`, which were empty, so the refund drain, recon and scores jobs **never actually reached the app**. They now go through `private.invoke_rush_delivery` → `rush-cron` → `delivery`.

**What's left is small, and none of it is a live money leak:**
- **Y1 (latent, live WiPay):** a late duplicate charge can be refunded twice.
- **Y2 (latent, `payout_export`):** automatic missing-item refunds don't charge the restaurant.
- **Y3 (latent, scale):** recon's settle catch-up will stop working past a few hundred orders.
- **The production gate** is still unproven, including the two historical double charges (**V15**).

**Answer to "did I do everything properly":** yes for everything I asked for in R4. Fix **Y1–Y3**, run the production gate, and the payment core is ready for its flags to be turned on one at a time (cash orders → wallet → payout export), each after its own soak.

### R5.2 Status of the R4 findings

| R4 | Status | Evidence |
|---|---|---|
| X1 self-report desk | ✅ Fixed | Reject writes `void` (allowed by the constraint); confirm requires `expectedBalanceMinor` (the report list now returns each courier's `balance_minor` and the desk sends it); `canMoveMoney` role check; the confirmed report is closed as `void` with "Confirmed as settlement {id}", so there is no second `posted` row; the desk shows the result |
| X2 short-collection rounding | ✅ Fixed | `scaleShortCollection`: the courier keeps their full share, and platform + restaurant split the remainder with the restaurant part as the **residual**, so the sum equals `collected` exactly. Same rule as `cashSettleLines`. Residual: if the customer pays less than the courier's own share, Layer A′ records the courier keeping only what was paid, while the ledger books the full share as cash earned (rare; Low) |
| X3 missing-item auto refunds | ✅ Fixed, with **Y2** | `items` selected; customer picks items (`itemIds`); `customerOverRefundBudget` enforces 2 refunds / J$5,000 per 30 days for R1 and R6 |
| X4 fourth door / fault by text | ✅ Fixed, with **Y2** | `payments.refunds.fault` column; `executeRefundById` reads it; `supportRoutes.ts` and `financeRoutes.ts` pass `fault` and use `reverseSplit` + `skipLedger`; `week_payable` nets `merchant_receivable` for merchant batches |
| X5 carry-forward | ✅ Fixed | No lower date bound; `week_payable` returns `line_ids`; `rush_lock_lines` locks exactly those; default period end is the last completed Jamaica day |
| X6 Roam-funded pay against customer money | ✅ Fixed | `fundPay` draws from `order_clearing` only up to `total − customerRefund`; the rest from `platform_cost` |
| X7 chargeback outcome | ✅ Fixed | Allowed only from `open`/`fighting`, an atomic status claim, one idempotency key per outcome, and `canMoveMoney`; chargeback intake also role-gated |
| X8 safe drop / phone-trusted protocol | ✅ Fixed | "Leave at a safe spot → Complete delivery" restored alongside "Customer still unavailable"; wait = first contact → photo (server `at`); GPS ≤ 0.3 km from `delivery_lat/lng`; both callers select `at` and the drop-off pin |
| X9 small items | ✅ Mostly fixed | `courier_compensation_amount` = the quote; recon settle excludes already-settled orders (see **Y3**); card orders blocked when debt is over the limit; `risk.scores` once per day; checkout shows the wallet line |
| V15 historical double charges | ❌ Open (guard added) | New trigger `payments.refuse_second_capture` + `refund_superseded_capture` stops future cross-intent double charges (see **Y1**); RD-2026-000001/000007 have no data fix |

### R5.3 New findings (Y-series)

#### Y1 — A late duplicate charge can be refunded twice — **High (latent: live WiPay)**
- **Evidence:** the new `BEFORE INSERT` trigger on `payments.transactions` turns a second capture on an already-paid order into `duplicate_superseded`, and its `AFTER INSERT` partner queues a `dup-capture:{txn}` refund. But `payments.complete_payment_intent` (unchanged since Phase 0) keeps going after its insert. If the intent had expired, or the order is cancelled or refunding, it **also** queues a `late-capture:{txn}` refund for the same transaction (`…_phase0.sql:185-199`). Two full refunds of one charge are now pending, and `executeRefundById` runs each row without re-checking eligibility.
- **Scenario:** exactly the RD-2026-000001 pattern. The customer pays the new link; the old, expired WiPay tab completes later. The function sees the old intent as expired and the trigger sees a second capture. Both refund. In demo mode both "succeed"; live, the second either over-refunds or fails eight times and parks as "needs a person".
- **Fix:** in `complete_payment_intent`, re-read the inserted row's status. If it's `duplicate_superseded`, return `duplicate_refund_required` without entering the late-capture branch. Also make `executeRefundById` check `refundableRemaining` for the refund's transaction before calling the provider.

#### Y2 — Automatic missing-item refunds don't charge the restaurant — **Medium (latent: `payout_export`)**
- **Evidence:** R6 in `processDispute.ts:262-268` calls `orchestrateSystemOrderRefund` **without `fault: "merchant"`**. Since X4, the refund unwind decides merchant fault only from that column, so the missing item is booked as Roam-funded. The matching `applyMerchantFaultDebit` passes `skipLedger: true` by design, so the restaurant is charged nowhere in the ledger (only in the legacy `payments.merchant_adjustments`, which payouts don't read).
- **Not affected:** R1 (forgotten order) refunds **before** delivery, when the restaurant was never paid, so leaving the fault off there is harmless.
- **Fix:** pass `fault: "merchant"` on the R6 refund (and on R1, for consistency). Add a test that an R6 refund reduces `merchant_payable` by the item's food share.

#### Y3 — Recon's settle catch-up breaks once the books grow — **Medium (latent: scale)**
- **Evidence:** `/internal/rush-money/recon` (`routes.ts:589-595`) reads **every** `settle_order` journal (PostgREST caps responses at `max_rows = 1000`) and passes all their order ids in one `not.in.(…)` URL filter. With UUIDs, that URL passes typical proxy limits at a few hundred ids. The query then errors (unchecked) and nothing is settled. Past 1,000 journals the exclusion list is also silently truncated. The capture loop above it has the same 1,000-row cap on `payments.transactions`.
- **Fix:** move both checks into SQL views, `delivered orders without a settle:{id} journal` and `completed transactions without a capture:{id} journal`, and page through them. Report counts, not just backfills.

#### Y4 — Small items — **Low**
- Netting at payout time zeroes the *sum*, but `merchant_payable` and `merchant_receivable` account balances both stay non-zero for ever. Reports should read party net, not individual accounts.
- `rush-cron` is a new function: confirm it's deployed and that `FLEET_CRON_SECRET` is set for it, then check `cron.job_run_details` / `net._http_response` for a 200 after the first run.
- `payments/index.ts` still starts with a BOM (harmless).

### R5.4 What to do next, in order

1. **Y1:** stop the second refund on late duplicates. **Y2:** pass `fault: "merchant"` on R6.
2. **Production gate:**
   - confirm the eight migrations are applied and `rush-cron` is deployed;
   - run the R2.4 queries plus the following, and confirm the cron jobs return 200:
     ```sql
     select * from rush_money.v_order_clearing_stale;
     select * from rush_money.v_provider_recon_exceptions;
     select jobname, schedule from cron.job where jobname like 'rush-%';
     ```
   - resolve RD-2026-000001/000007 (refund the later capture) so `delivery.v_rush_multi_capture_orders` is empty.
3. **Y3** before order volume grows.
4. **Turn the flags on one at a time, each with a soak and the gate views at zero:**
   - `DASH_ALLOW_CASH_ORDERS`;
   - `wallet_live` (after the stored-value legal sign-off, Rev 1 §5.2);
   - `payout_export` (after the payout rail is chosen, Rev 1 Q11).
5. Then the remaining Rev 1 §8 screens: refund tracker, merchant statements, dispute workbench evidence panel, chargeback desk UI.

---

## Part R4 — Third implementation pass (2026-10-04)

### R4.0 What was checked

Still uncommitted on `main`. Changes since R3:
- **new migration:** `20261004230000_rush_money_r3.sql`;
- **new files:** `_shared/rushMoney/postJournal.ts` + `postJournal.test.ts`;
- **reworked files:** `cancelOrder.ts`, `routes.ts`, `settleOrder.ts`, `executeRefund.ts`, `reverseSplit.ts`, `cancelPolicy.ts`, `protocol.ts`, `collectOnDelivery.ts`, `processDispute.ts`, `financeRoutes.ts`, `orderRoutes.ts`, `customerOrderRoutes.ts`, `merchantDebit.ts`, `index.ts`;
- **UI:** the courier "Can't deliver" flow, the admin Remittance Desk and the Finance page;
- **CI:** `ci.yml` now also runs `postJournal.test.ts`.

All of the above was read in full.

- **Tests:** `deno test _shared/rushMoney/` passes **11 of 11**, type-checked, and all four test files run in `ci.yml`.
- **Type check:** at the repo baseline (`courierConsumerRoutes.ts` 132 vs HEAD 129; everything else at or below HEAD). One of the new errors is a real bug, not noise; see **X3**.
- **Not checked:** live production data. The Supabase connection was still unavailable, so it is **still unverified whether the six `20261004*` migrations are applied** and whether the R2.4 gate queries return zero.

### R4.1 Verdict

**All three live problems from R3 are fixed** (W1, W2, W5), and so is W6:
- every cancel journal now goes through a `public` client, and failures are parked in `recon_exceptions`, with a test proving it;
- the after-cancel steps (free the courier, close the stack leg, compensation, GCT reversal, Growth Guarantee clawback, customer SMS) now live inside `cancelOrder()`, and the dead blocks are gone;
- the courier app logs calls, texts, the 5-minute wait and the photo with GPS, and follows the server's verdict; a skipped protocol opens a `risk.cases` row;
- admin cancel no longer issues a second refund.

Also fixed:
- line-level payout locking (W3 core);
- fault-aware refund unwinding with a single merchant charge (W4 core);
- historical delivered orders settled by the now-scheduled recon (W7);
- customer-funded vs merchant-funded cancel pay (W8 core);
- cash eligibility at checkout and cash orders starting as `awaiting_collection`;
- a chargeback outcome endpoint;
- a Layer A′ short-collection adjustment.

**I found no remaining live money leak.** What's left is:
- (a) two small **live** regressions: auto missing-item refunds can never fire (X3), and the "leave at safe location" option was removed (X8);
- (b) the self-report confirm/reject buttons, which **cannot work** as written (X1);
- (c) problems that only bite once a switch is turned on: the remittance rounding when cash goes live (X2); payout carry-forward (X5) and the fourth merchant-charge door (X4) when `payout_export` goes live;
- (d) the production gate (**V15** is still open, and the migrations are unconfirmed).

**Answer to "did I do everything properly":** nearly.
- Fix **X1–X4** before relying on the remittance desk or turning on `payout_export`.
- Decide **X8**.
- Run the production gate.
- After that, the remaining items are polish (X6, X7, X9).

### R4.2 Status of the R3 findings

| R3 | Status | Notes |
|---|---|---|
| W1 cancel journals hit the wrong schema | ✅ Fixed | `postRushJournal(publicJournalClient(), …)` checks the error and parks it in `recon_exceptions` (`source = 'cancel_journal'`); `postJournal.test.ts` asserts the public target |
| W2 after-cancel steps skipped | ✅ Fixed | All moved into `cancelOrder()` (`cancelOrder.ts:156-198`); the old blocks and `refundCardOnCancel` are gone from `index.ts`. Residual: `courier_compensation_amount` still comes from the old 50%-of-delivery-fee formula, so courier History can show a different figure than the ledger pays (X9) |
| W3 payout lock per journal | 🟡 Core fixed → **X5** | Lines now carry `payout_batch_id`; only parties with a net payable are locked; the preparer can't approve (SQL and route) ✅. Carry-forward doesn't actually happen (X5) |
| W4 merchant charged twice / fault-blind | 🟡 Core fixed → **X4** | `reverseSplit(merchantAtFault)` charges food only on merchant fault; three of four fault-debit callers pass `skipLedger: true` ✅. Still open: `supportRoutes.ts`, fault read from the refund's reason text, and `merchant_receivable` never netted |
| W5 protocol can't be completed | ✅ Fixed | `CustomerUnavailablePage` logs call/sms/wait/photo + GPS; the home page follows `review` / `words` / `order-cancelled`; skipped protocol opens a `risk.cases` row. Residuals in X8 |
| W6 admin double refund | ✅ Fixed | Admin cancel calls only `cancelOrder()` |
| W7 historical delivered orders | ✅ Fixed | Recon (scheduled 06:30 daily) also settles orders in `settled` with no settle journal; idempotent `settle:{order}`. Residual in X9 |
| W8 cancel journals in the wrong place | 🟡 Mostly fixed → **X6** | Merchant-fault courier pay comes from the restaurant ✅; COD failed delivery pays the restaurant ✅; debt only when `wallet_live` ✅; customer-funded pay from `order_clearing` ✅. New gap in X6 |
| W9 small items | 🟡 | `restaurant_closed`/"closed"/"stock" now merchant fault ✅; cash orders start `awaiting_collection` ✅; cash box shown only for cash orders ✅; `payout_lines` insert error checked ✅. Still: no return fee, and `cancel-quote` detects cash differently from `cancelOrder` |
| V5 (second half) Layer A′ short collection | 🟡 Built, but regressed → **X2** | |
| V13 self-report confirm | ❌ Built but non-functional → **X1** | |
| V14 enforcement | 🟡 | Cash eligibility enforced at checkout ✅; chargeback won/lost endpoint ✅; daily scores job (debt only). Still: debt over J$5,000 doesn't block **card** orders; auto-refund budget constants unused |
| V15 RD-2026-000001/000007 + guard | ❌ Open | No migration or guard added |

### R4.3 New findings (X-series)

#### X1 — Courier "I've paid" reports can be neither confirmed nor rejected — **High**
- **Confirm:** `POST /admin/rush-money/remittance-reports/:id/decide` calls `settleRemittance` with `expectedBalanceMinor: Number(body.expectedBalanceMinor || 0)` (`routes.ts:474`). The desk sends only `{ decision: 'confirm' }` (`RemittanceDeskPage.tsx:372`). `settleRemittance` refuses unless the account balance equals the expected balance (`settleRemittance.ts:108`), and a courier who reports a payment always owes more than 0, so **every confirm fails**. The desk fires the request with `void fetch(…)` and never shows the result.
- **Reject:** the route writes `status: 'rejected'` (`routes.ts:466`), but the constraint allows only `pending, pending_confirmation, posted, reversed, void` (`…_workflows.sql:6`). The update fails, the error isn't checked, and the admin is told "Report rejected" while it stays pending.
- **Also:**
  - a successful confirm would leave **two** `posted` settlement rows for one payment (the self-report row plus the one `settleRemittance` inserts);
  - neither `decide` nor the chargeback outcome checks for a money-moving role (any Dash admin, including `dash_ops`, can use them).
- **Fix:**
  - the desk reads the courier's current balance and sends it as `expectedBalanceMinor`;
  - reject writes `void` (or add `rejected` to the constraint);
  - on confirm, mark the self-report row `void` with a link to the settlement it produced;
  - require the money-moving roles;
  - show the outcome in the desk.

#### X2 — Layer A′ short collection reintroduces the R-1 rounding failure — **High (latent: cash orders)**
- **Evidence:** `collectOnDelivery.ts:143-160` scales bag, platform due, merchant due and courier-retained by `receivedShare` and **rounds each one independently**. The Layer A′ table enforces `bag_total = platform_due + merchant_due + courier_retained` **exactly**. This is the exact bug fixed in the Layer A′ remittance cutover (R-1), where `courier_retained` was made the residual so the sum holds by construction.
- **Example:** bag 250,000 minor, platform 31,337, merchant 153,001, retained 65,662; the customer pays half (share 0.5):
  - bag = 125,000
  - platform = 15,669 (15,668.5 rounded)
  - merchant = 76,501 (76,500.5 rounded)
  - retained = 32,831
  - total = **125,001**, so the CHECK fails, the collection is parked, and the courier's remittance is never recorded.
- **Also inconsistent:** Layer A′ now shrinks the courier's retained share pro rata, but `cashSettleLines` books the courier's **full** share as `courier_cash_earned` and charges the shortfall to `platform_cost`. The two books disagree about who absorbs a short payment, and the courier ends up out of pocket.
- **Fix:**
  - compute `courierRetained = bagScaled − platformScaled − merchantScaled` (residual);
  - decide one rule for who absorbs a short payment (recommended: the courier keeps their full share, the platform and the restaurant's receivable absorb the shortfall, and the customer's debt recovers it) and apply it in both Layer A′ and the ledger;
  - add the half-paid example as a test.

#### X3 — Automatic missing-item refunds can never fire — **Medium (live)**
- **Evidence:** the new item-level rule R6 reads `order.items` (`processDispute.ts:241`), but the order query (`processDispute.ts:112`) doesn't select `items`. So `items` is always `[]`, `food = 0`, and `partialCap = 0`: the auto refund is skipped and every missing-item claim goes to manual review. This is the TS2352 error flagged by `deno check`.
- **Also:**
  - the rule finds items by searching the customer's free-text note for the item name, which will miss most real claims;
  - the per-customer auto-refund budget (`AUTO_REFUND_BUDGET_*`) is defined but never enforced.
- **Fix:** select `items`; let the customer pick the missing items in the Report Issue screen (Rev 1 §8.1) and send their ids; enforce the budget before auto-refunding.

#### X4 — A fourth merchant-charge door, and fault decided by text — **Medium (latent: `payout_export`)**
- **Evidence:** `admin/supportRoutes.ts:96-131` (resolving a support case with a refund) was not updated. It still calls `applyMerchantFaultDebit` with the **full refund amount** (delivery, tip and GCT included) and without `skipLedger`, so it posts a full-amount `merchant_receivable` journal on top of the refund unwind.
- **Separately:** `executeRefundById` decides merchant/courier fault by searching the refund **reason text** for "merchant"/"restaurant"/"courier" (`executeRefund.ts:209-216`). An admin note like "customer said the restaurant was rude, goodwill refund" charges the restaurant.
- **Also:** `merchant_receivable` (fault debits, lost chargebacks) is still never netted in `week_payable`, so those charges are recorded but never collected.
- **Fix:**
  - route `supportRoutes.ts` through the same `reverseSplit` + `skipLedger` path;
  - store `fault` as a column on `payments.refunds` when the refund is created, and read that;
  - net `merchant_receivable` in the merchant batch.

#### X5 — "Carry the debt to next week" doesn't actually happen — **Medium (latent: `payout_export`)**
- **Evidence:** `week_payable` and `lock_week` only consider journals whose `created_at` falls inside the batch's `[periodStart, periodEnd]` (`…_r3.sql:39-41, 64-65`).
  - A restaurant that owed Roam this week is correctly **not** locked, but next week's window starts after those lines, so the debt is never netted.
  - Earnings from a week where nobody ran a batch are never paid.
- **Also:**
  - the default `periodEnd` is **today** (`routes.ts:273`), so settlements posted between computing the payable and locking it are locked without being paid;
  - the recon catch-up selects up to 200 orders that are already in permanent states, so once there are more than 200, new stragglers may never be reached (X9).
- **Fix:**
  - batch = all unlocked lines with `created_at < periodEnd + 1` (no lower bound);
  - default `periodEnd` to the last completed day;
  - lock exactly the line ids that were summed (return them from `week_payable`).

#### X6 — Roam-funded cancel pay is booked against the customer's money — **Medium**
- **Evidence:** `cancelOrder.ts:126,140` book courier and restaurant cancel pay against `order_clearing` whenever the order is a paid card order, even when the customer received a **full** refund.
- **Example:** in a customer cancel at "accepted" (full refund, Roam pays the courier half) or a courier-fault cancel after pickup (full refund, Roam pays the restaurant), Roam is the payer. `order_clearing` goes positive and stays non-zero (`v_order_clearing_stale` fires), and `platform_cost` is understated.
- **Fix:** fund from `order_clearing` only up to `captured − customerRefund`; the rest from `platform_cost`.

#### X7 — Chargeback outcome has no state guard — **Medium**
`POST /admin/rush-money/chargebacks/:id/outcome` (`routes.ts:379-444`) doesn't check the current status. Calling it "won" and later "lost" posts **both** journals (different idempotency keys), which drives `chargeback_reserve` negative and charges a party for a dispute that was won. It also has no money-moving role check. **Fix:** allow it only from `open`/`fighting`; require `finance_approver`/`dash_admin`.

#### X8 — Safe drop removed; protocol trusts the phone — **Medium (product, live)**
- **Safe drop:** "Leave at safe location → complete delivery" was **replaced** by "Can't deliver", which cancels. Customers who asked for a doorstep drop, or who are simply out, now get a cancelled order instead of their food: a refund (protocol skipped) or a charge with no food (protocol done).
- **Recommendation:** bring safe drop back as its own choice (delivered with photo + GPS), separate from "Can't deliver". This is an owner decision.
- **Trusting the phone:** the 5-minute wait is reported by the phone (`waitSeconds: 300` when the timer ends), and GPS only has to be **present**, not near the drop-off.
- **Fix:** compute the wait from server timestamps (`at` of the first contact to the photo) and require GPS within a set distance of `delivery_lat/lng`.

#### X9 — Small items — **Low**
- `courier_compensation_amount` (shown in courier History) still uses the old formula, while the ledger pays the quote; use `quote.courierReceivesJmd`.
- Recon settle catch-up: `limit(200)` over states that never change; filter to orders **without** a `settle:` journal instead.
- Debt over J$5,000 blocks cash but not card orders (`orderingAllowed` is ignored for card).
- `risk.scores` gains a row per debtor per day with no dedupe.
- `cancel-quote` reads cash from `payment_status`; `cancelOrder` reads `payment_method`.
- No return fee in the quote.
- `payments/index.ts` still starts with a BOM (harmless).

### R4.4 What to do next, in order

1. **X1:** make the self-report desk work (send the expected balance, `void` instead of `rejected`, show results, role check).
2. **X3:** select `items`; move to item pickers.
3. **X8:** decide on safe drop.
4. **Production gate:** confirm the six migrations are applied; run the R2.4 queries; resolve RD-2026-000001/000007 (**V15**); confirm `rush_money.v_order_clearing_stale` and `rush_money.v_provider_recon_exceptions` are empty after the first scheduled recon.
5. **Before `payout_export`:** X4 (support-route door, stored fault, net receivables), X5 (carry-forward, exact line lock), X7.
6. **Before cash orders / `wallet_live`:** X2 (residual rounding + one short-payment rule), X6.
7. Then X9 and the remaining Rev 1 §8 screens (customer wallet, refund tracker, merchant statements, dispute workbench).

---

## Part R3 — Second implementation pass (2026-10-04)

### R3.0 What was checked

Still uncommitted on `main`. Changes since R2:
- **two new migrations:** `20261004210000_rush_money_r2.sql`, `20261004220000_rush_money_week_and_backfill.sql`;
- **new files:** `delivery/rushMoney/cancelOrder.ts`, `_shared/rushMoney/protocol.ts`;
- **reworked files:** `routes.ts`, `settleOrder.ts`, `executeRefund.ts`, `journalLines.ts`, `walletRules.ts`, `refundEligibility.ts`, `payments/index.ts`, `financeRoutes.ts`, `merchantDebit.ts`;
- **every cancel caller** now goes through `cancelOrder()`;
- **UI changes** in the courier, customer, merchant and admin apps;
- **CI:** a new `ci.yml` step.

All of the above was read in full.

- **Tests:** `deno test _shared/rushMoney/` passes **10 of 10**. They now also run, **type-checked**, in `ci.yml` ("Deno test Rush money rules").
- **Type check:** back to the repo baseline. `courierConsumerRoutes.ts` is 130 (HEAD 129, R2 139; the dead code is gone). The new files add one implicit-`any` (`rushMoney/routes.ts:270`). The `Sb` mismatch reported at `admin/orderRoutes.ts:185` is a real bug, not noise; see **W1**.
- **Not checked:** live production data. The Supabase connection was still unavailable, so it remains **unverified whether the five `20261004*` migrations are applied** and whether the R2.4 gate queries return zero.

### R3.1 Verdict

**Large improvement.** Most of what R2 flagged is now fixed properly:
- **V1** wallet sign
- **V2/V3** refund state and eligibility
- **V7** guarded cash collection
- **V9** payment completion order and the live gate
- **V11** refund claim lock
- **V16** sweeper state
- **V17** encoding and dead code

There is now **one cancel service**, a real **cash settlement journal**, **refund unwinding after delivery**, **capture backfill**, and a **week-scoped payout batch** with a hold journal, role checks and an insert trigger.

**But the `cancelOrder()` rollout introduced two new live problems, and one R2 problem is still live:**
- **W1, live:** every ledger journal that `cancelOrder()` writes fails silently. It runs on a delivery-schema client, and `rush_post_journal` lives in `public`. Customer refunds still work; the merchant/courier/debt side of every cancel is missing from the books.
- **W2, live:** the cancel branches now return early, so the old after-cancel steps no longer run: freeing the courier, completing the stack leg, notifying the customer.
- **W5, live (was V4):** the server now enforces the failed-delivery protocol, but the courier app has no way to log the steps. Every post-pickup "customer unavailable" therefore becomes a 100% refund with the restaurant paid by Roam. The app also tells the courier "the customer was not refunded", which is the opposite of what happened.

**Answer to "did I do everything properly":** close, but not yet.
- Fix **W1 and W2 first**: they are small, mechanical, and affect every cancel today.
- Keep `payout_export` **off** until **W3** (the payout lock hides the other party's earnings) and **W4** (merchants charged twice on fault refunds) are fixed.
- Keep `wallet_live` / `DASH_ALLOW_CASH_ORDERS` **off** until the second half of **V5** (Layer A′ short collection) is closed.

### R3.2 Status of the R2 findings

| R2 | Status | Notes |
|---|---|---|
| V1 wallet sign | ✅ Fixed | Debit-positive end to end; one wallet account per customer (`component ''`); endpoint shows "Balance due" vs "credit" correctly; `codAllowed` also requires `wallet_live`. Residual: `cancelOrder` posts customer debt even when `wallet_live` is off (W8) |
| V2 duplicate refund marks order refunded | ✅ Fixed | `duplicateRefundKind` + `orderRefundState`: duplicate/late refunds never change the order's state |
| V3 eligibility pooled | ✅ Fixed | Eligibility by `transaction_id` |
| V4 courier abort → full refund | 🟡 Partial → see **W5** | Server runs `protocolReady` + `quoteCancel`; app can't satisfy the protocol |
| V5 cash settle double pay | 🟡 Half fixed | `cashSettleLines` books courier cash as `courier_cash_earned` (never payable) ✅. **Open:** `collectOnDelivery` still posts the **full** Layer A′ remittance on a short collection, so the courier owes Roam cash they never received while the customer is also in debt for it |
| V6 payout batches | 🟡 Partial → see **W3** | Week window, `payout_in_flight` hold journal, `finance_approver` role, preparer ≠ approver (in the route), INSERT trigger ✅. New defects in the lock |
| V7 `collect-cash` unguarded | ✅ Fixed | Cash-only, after pickup, one-shot, transitions through the function. Residual: fallback writes `money_state` directly (`awaiting_payment → awaiting_collection`) because cash orders are still created as `awaiting_payment` |
| V8 ledger history / refund unwind | 🟡 Partial → see **W4**, **W7** | Capture backfill (migration + recon) ✅, post-delivery refund unwinds payables ✅, settle is net of refunds ✅. Historical delivered orders still have no settle journal |
| V9 told "paid" on failure / live trap | ✅ Fixed | Order intents are completed only inside `complete_payment_intent`; a mismatch sets `review` + a recon exception; live intents refuse to **start** without `WIPAY_STATUS_URL` |
| V10 two merchant books | 🟡 Mostly fixed → see **W4** | Hand-typed payouts return 410 ✅; admin dispute uses `reverseSplit` ✅; fault debits now post `merchant_receivable` journals ✅ (still also written to `payments.merchant_adjustments`) |
| V11 refund claim lock | ✅ Fixed | Conditional claim; gives up after 8 attempts. Residual: a row stuck in `submitted` (crash mid-call) isn't retried or shown in `v_rush_refunds_stuck` |
| V12 attempt logging | ✅ Fixed | Owner check; protocol needs 2 contacts + 5-min wait + photo + GPS. Residual: GPS isn't compared with the drop-off pin |
| V13 self-report can't be confirmed | ❌ Open | No confirm/reject path |
| V14 enforcement | 🟡 Partial | Chargeback intake now posts a reserve journal ✅. Still no chargeback outcome, risk inputs are typed by the admin, and checkout doesn't apply COD eligibility |
| V15 RD-000001/000007 + guard | ❌ Open | Gate view `v_rush_multi_capture_orders` still can't reach zero |
| V16 sweeper | ✅ Fixed | 15-min grace; sets `money_state = 'voided'` |
| V17 encoding / dead code | ✅ Fixed | Mojibake and dead code gone; duplicate function removed. A harmless BOM remains at the top of `payments/index.ts` |
| V18 small notes | 🟡 | `canApproveFinance` now used ✅; `restaurant_closed` still labelled courier fault |

### R3.3 New findings (W-series)

#### W1 — Every journal `cancelOrder()` posts fails silently — **Critical (live)**
- **Evidence:** `cancelOrder` calls `sb.rpc("rush_post_journal", …)` (`delivery/rushMoney/cancelOrder.ts:91,105,124,142`) on the client its caller passes in. Every caller passes a client created with `{ db: { schema: "delivery" } }`: `delivery/index.ts:98-104` `getServiceSupabase`, `admin/merchantAdminShared.ts:37-43` `getDb`. supabase-js sends RPCs to that schema, but `rush_post_journal` exists only in `public`, so PostgREST returns "function not found". The return values are never checked.
- **Effect today:**
  - the failed-delivery `settle` (`cancel-keep`) never posts;
  - neither does courier cancel pay (`cancel-courier`), merchant food pay (`cancel-merchant`) or customer debt (`cancel-debt`).

  The customer refund still happens (it uses its own clients). So the books say nobody was paid for cancelled-but-compensated orders, and the next payout batch won't pay them.
- **Fix:** post through a `public` client (as `settleOrder.ts` already does with `publicDb()`). Check every `{ error }` and park failures in `recon_exceptions`. Add a test that runs `cancelOrder` with a schema-scoped fake and asserts the RPC target.

#### W2 — Cancel branches now skip the after-cancel steps — **High (live, operational)**
- **Evidence:** in `PUT /orders/:id/status` the device, courier and merchant branches now `return` straight after `cancelOrder()` (`delivery/index.ts:1233-1242, 1344-1354, 1452-1462`). The old blocks that ran afterwards are unreachable:
  - `clearCourierActiveOrderOnCancel`
  - `completeStackLeg`
  - `applyCancelCompensation`
  - `reverseOrderOutputTax`
  - `maybeClawbackGrowthGuarantee`
  - `notifyCustomerOrderStatus`
  - the event row with the staff member

  The post-pickup courier-abort branch (`courierConsumerRoutes.ts:971-997`) also returns before freeing the courier and closing the stack leg.

  `refundCardOnCancel` and the leftover `if (status === "cancelled")` blocks are now dead code.
- **Scenario:** a merchant cancels an order that already has a courier. The courier's `active_order_id` still points at it, so they get no new offers, and the customer gets no cancellation SMS.
- **Fix:** move those steps into `cancelOrder()` (one place, every caller), then delete the dead blocks.

#### W3 — The payout lock hides the other party's earnings and loses debts — **Critical (latent: `payout_export`)**
- **Evidence:** `rush_money.lock_week` (`…_week_and_backfill.sql:37-65`) sets `journals.period_id` on **whole journals**, and `week_payable` skips any journal with a `period_id`. A `settle_order` journal has **both** a `merchant_payable` line and a `courier_earnings` line.
- **Scenario 1:** finance prepares the merchant batch for the week. Every settle journal is locked. The courier batch for the same week then finds **nothing**, and those courier earnings can never be paid.
- **Scenario 2:** a merchant whose week nets to "owes Roam" (a fault adjustment larger than their sales) is excluded by `HAVING SUM < 0`, but their journals are still locked. The debt disappears from all future batches.
- **Also:** the database "preparer cannot approve" check (`…_r2.sql:20-25`) can never fail, because two distinct approvers always include someone other than the preparer. The route-level check is what actually enforces it.
- **Fix:**
  - lock **lines**, not journals (add `payout_batch_id` to `rush_money.lines`, or a line-level lock table);
  - carry negative balances forward instead of locking them;
  - in SQL, check `NOT EXISTS (approval WHERE actor_id = created_by)`.

#### W4 — Merchants are charged twice on merchant-fault refunds, and on every refund regardless of fault — **High (latent: `payout_export`)**
- **Evidence:** `postRefundJournal` (`executeRefund.ts:59-76`) unwinds a post-delivery refund using `reverseSplit`, which marks the food line `fundedBy: "merchant"` **regardless of fault**. So the merchant's payable falls by their food share even when the platform or the courier was at fault. For a merchant-fault refund, `applyMerchantFaultDebit` (`merchantDebit.ts`) **also** posts the same food amount to `merchant_receivable`.
- **Saving grace for now:** `week_payable` reads only `merchant_payable` and never nets `merchant_receivable`, so payouts see only the first charge. They charge it on every refund, though, and the moment receivables are netted (as Rev 1 §7.6 requires) the merchant pays twice.
- **Fix:**
  - pass the fault into the unwind;
  - only merchant-fault refunds charge the merchant's food share, and only **once**: either the unwind or the fault debit, not both;
  - net `merchant_receivable` in `week_payable`.

#### W5 — The failed-delivery protocol can't be completed from the courier app — **High (live)**
- **Evidence:** no app calls `POST /orders/:id/delivery-attempt`. `protocolReady` can never be true, so every post-pickup `customer_unavailable` / `wrong_address` takes the "steps not completed" branch: 100% refund, the restaurant paid by Roam, the courier paid nothing. No review case or risk signal is raised.
- **Also:** the courier app (`ConfirmHandoffPage`/`CourierHomePage` diff) shows "Sent for review — the customer was not refunded" and stays on the order. It ignores the response's `aborted` / `quote`, although the server has already cancelled and refunded.
- **Fix:**
  - build the "Can't deliver" screen from Rev 1 §8.2 (call/SMS buttons that log attempts, a 5-minute timer, photo, GPS);
  - show the server's `quote.summary` and move the courier off the order;
  - open a `risk.cases` row whenever the protocol was skipped.

#### W6 — Admin cancel issues a second refund call — **Medium**
- **Evidence:** `admin/orderRoutes.ts:185-255` calls `cancelOrder()` (which refunds per the quote) and then still calls `orchestrateOrderRefund({ amount: null })` with a different idempotency key, and writes a second `cancelled` event.
- **Effect:** usually no double money, because the second call finds nothing left to refund. But support staff see a refund error on a successful cancel, and if the quote was partial, the second call **refunds the remainder** and overrides the policy.
- **Fix:** delete the second refund and the duplicate event.

#### W7 — Pre-ledger delivered orders are invisible to payouts — **Medium**
- **Evidence:** the ledger migration back-filled delivered orders to `money_state = 'settled'` without writing settle journals. The backfill wrote only capture journals. The recon catch-up settles only orders still in `captured`/`collected`, and `/internal/rush-money/recon` isn't scheduled.
- **Effect:**
  - those orders' `order_clearing` stays non-zero, so `v_order_clearing_stale` always fires;
  - their merchant and courier earnings never reach `week_payable`. No payouts have ever been made, so this is money owed that the new engine doesn't know about.
  - recon now **writes** missing capture journals instead of only reporting them; record what it backfilled so it stays an audit trail.
- **Fix:** a one-off settle backfill for delivered orders (idempotency key `settle:{order}`), then schedule recon.

#### W8 — Cancel journals put the money in the wrong place — **Medium**
Once W1 is fixed, these become real:
- **Customer-funded compensation booked as a platform cost:** in a stage-2b customer cancel the customer funds the restaurant's food and the courier (withheld from the refund), yet the journals book both as `platform_cost`. Meanwhile `order_clearing` keeps the withheld amount for ever. Use `order_clearing` as the funding line when the customer paid.
- **Merchant-fault courier pay funded by Roam:** the quote says "the courier is paid by the restaurant", but the journal books it as `platform_cost`.
- **COD failed delivery doesn't pay the restaurant:** `cancel-merchant` only posts when `customerRefundJmd > 0`, so the restaurant is never credited for the food the quote says it gets.
- **Debt posted with the wallet off:** `cancel-debt` posts customer debt even when `wallet_live` is off; the `collect-cash` path respects the flag.

#### W9 — Small items — **Low**
- `cancel-quote` detects cash from `payment_status`, while `cancelOrder` uses `payment_method`; they can disagree.
- Cash orders are still created as `money_state = 'awaiting_payment'`. Set `awaiting_collection` at placement and remove the direct-write fallback in `collect-cash`.
- The quote has no return fee.
- `restaurant_closed` reported by a courier is still labelled courier fault.
- The handoff screen shows the "Cash received" box on card orders too.
- `payout_lines` insert errors are not checked.

### R3.4 What to do next, in order

1. **W1:** post `cancelOrder` journals through a `public` client and check errors. **W2:** move the after-cancel steps into `cancelOrder()` and delete the dead blocks. **W6:** remove the second admin refund.
2. **W5:** ship the courier "Can't deliver" screen that logs attempts; show the server's outcome; open a risk case when the protocol is skipped.
3. **Prove the gates in production:** confirm the migrations are applied; run the R2.4 gate queries; resolve RD-2026-000001/000007 (**V15**); schedule recon; run the **W7** settle backfill and confirm `rush_money.v_order_clearing_stale` is empty.
4. **Before `payout_export`:** fix **W3** (line-level lock, carry debts forward) and **W4** (fault-aware unwind, single merchant charge, net receivables).
5. **Before `wallet_live` / cash orders:** close the second half of **V5** (Layer A′ collects only what was received), **W8**, and enforce COD eligibility at checkout (**V14**).
6. Then the remaining R2 items: **V13**, **V14**, plus the residuals noted in R3.2.

---

## Part R2 — Implementation verification (2026-10-04)

### R2.0 What was checked

The implementation is **uncommitted** in the working tree on `main` (12 modified files, 18 new files, about 2,200 new lines). It was checked as follows:

- Read in full: the three new migrations (`20261004180000_rush_money_phase0.sql`, `20261004190000_rush_money_ledger.sql`, `20261004200000_rush_money_workflows.sql`), every file under `_shared/rushMoney/`, `delivery/rushMoney/`, `payments/providers/`, and the diff of every modified file.
- **Tests:** `deno test supabase/functions/_shared/rushMoney/` passes **9 of 9**, type-checked. They run in CI through `test-supabase-functions.yml` (`deno test supabase/functions/`, `--no-check`), but **not** through `ci.yml`.
- **Type check:** `deno check` on `delivery/index.ts` + `payments/index.ts`, compared per file against a `HEAD` copy. The new `rushMoney` files add **0** errors. `courierConsumerRoutes.ts` goes **129 → 139**, and **all +10 come from the dead code** left after the new `return 410` in `close-period` (TypeScript loses narrowing after an unconditional return). Deleting that dead body restores the baseline.
- **Not checked:** live production data. The Supabase connection was unavailable during this pass. It is therefore **unverified whether the three migrations have been applied** and whether the Phase 0 gate queries return zero. Run them (§10, Phase 0 gate, plus R2.4) before relying on this revision.

### R2.1 Verdict

**Phase 0 is substantially done and well built.** The core of the Critical findings is fixed:
- every cancel path now refunds;
- completing a payment is one row-locked SQL function with unique indexes;
- refunds retry by id and post to the ledger only after the provider confirms;
- the refund drain and the abandoned-order sweeper are scheduled.

The new ledger (`rush_money.post_journal`) faithfully follows the Layer A′ pattern: replay, then balance check, then deterministic locks, then append-only.

**Phases 1–6 are scaffolding, not finished workflows, and several of the scaffolds would move money wrongly the day their flag is turned on.**
- The wallet's sign convention is inverted between the ledger and the rules (customers in debt would be shown as having credit and allowed to pay cash).
- Payout batches would pay every party's all-time balance, every week.
- Cash-order settlement re-creates the courier double-pay that Rev 1 PAY-H4 removed.
- After pickup, the courier "abort" path now gives the customer a full refund with no evidence, even though the matrix written for it says the opposite.
- **None of the four apps call any of the new endpoints yet**, so the UI work in §8 has not started (two small admin/customer copy changes aside).

**Answer to "did I do everything properly":** Phase 0, yes, with the small fixes in R2.3. Everything after Phase 0, no, not yet. Keep `wallet_live`, `payout_export`, `DASH_ALLOW_CASH_ORDERS` and live WiPay **off** until the Critical/High items in R2.3 are closed. One more item, **V4**, is live **today** regardless of flags.

### R2.2 Scorecard against the Rev 1 findings

| Rev 1 | Status | Evidence / what's left |
|---|---|---|
| PAY-C1 cancels don't refund | ✅ **Fixed** | `refundCardOnCancel()` on device, merchant and courier paths (`delivery/index.ts:1163`), courier abort refunds (`courierConsumerRoutes.ts:1003`), one idempotency key `cancel:{order}`; backfill refunds in the Phase 0 migration. Caveat **V4** |
| PAY-C2 double capture / paid-over-cancelled | ✅ Mostly fixed | `payments.complete_payment_intent` refunds late/cancelled/expired captures and no longer overwrites `payment_status`. Caveats **V2**, **V15** |
| PAY-C3 no uniqueness / race | ✅ **Fixed** | Partial unique indexes on `(intent_id)` and `(provider, provider_transaction_id)`; intent row `FOR UPDATE` |
| PAY-C4 webhook trust | 🟡 Partial | Amount, currency, single `status == "success"`, live status re-query added. Still open: secret in the query string, no provider hash check, and **V9** |
| PAY-C5 refund lifecycle | ✅ **Fixed** | `executeRefundById` retries the same row; ledger only after success; amount validated; `rush-pending-refunds` cron every 15 min. Caveats **V3**, **V11** |
| PAY-H1 merchant debited the whole total | 🟡 Partial | Auto rules R1/R6 now debit only the merchant's food share via `reverseSplit`. The admin dispute path (`admin/financeRoutes.ts:254`) still debits the full refund amount |
| PAY-H2 refunds not decomposed | 🟡 Partial | `reverseSplit` exists but is used only for merchant debits. Refund journals are a single clearing line (**V8**); GCT still not reversed on partial refunds |
| PAY-H3 failed delivery = plain cancel | 🟡 Partial | Pre-pickup vehicle/accident now redispatches ✅. WF7 protocol is not wired into the abort path (**V4**, **V12**) |
| PAY-H4 courier self-closed payouts / COD double pay | 🟡 Moved | `close-period` returns 410 ✅. The same double pay reappears in ledger settlement for cash orders (**V5**) |
| PAY-H5 hand-typed merchant payouts | ❌ Open | `POST /admin/finance/payouts` still live alongside the new batch engine, which has **V6** |
| PAY-H6 merchant earnings wrong | 🟡 Partial | `completed` orders now included ✅. Refunds and adjustments still not netted; every cancelled order still listed as a refund |
| PAY-H7 COD collection implicit | 🟡 Partial | Courier can't mark a cash order delivered without `collect-cash` ✅. Layer A′ still collects the full remittance on a short payment (**V5**), and `collect-cash` is unguarded (**V7**) |
| PAY-H8 COD orders can't be refunded | ❌ Open | Wallet is off and not wired into refunds |
| PAY-M1 abandoned orders | ✅ Fixed | `delivery.void_abandoned_unpaid_orders()` hourly. Caveat **V16** |
| PAY-M2 blunt auto refunds | 🟡 Partial | Merchant share proportional; no item-level claims; per-customer budgets defined as constants but not enforced |
| PAY-M3 free-text dispute UI | 🟡 Partial | Status now validated against a list; still a prompt dialog with no evidence panel |
| PAY-M4 schema hygiene | 🟡 Acceptable | New tables use minor units, CHECKs and append-only triggers; `payments.*` left as-is (as recommended) |
| PAY-M5 card-on-file | ⏸ Not started | Expected (blocked on provider) |
| PAY-M6 risk controls | 🟡 Scaffold | Tables + a calculator; nothing computes signals or enforces controls (**V14**) |
| PAY-L1 go-live gate | ❌ Unsigned | — |

**Phase status:**

| Phase | Status |
|---|---|
| 0 | ✅ Done; gate unproven (see V15) |
| 1 | 🟡 Schema, journal function and state machine done; **no backfill or tie-out** (V8) |
| 2 | 🟡 Cancel *quote* only; matrix not executed by any cancel path; WF7 not wired |
| 3 | 🟡 Endpoints exist, flag off, sign bug (V1), not enforced at checkout |
| 4 | 🔴 Unsafe scaffold (V6) |
| 5 | 🟡 Internal recon + chargeback intake only |
| 6 | 🟡 Scaffold |
| §8 UI | ⏸ Not started |

### R2.3 New findings (V-series)

Severity: **Critical** = money moves wrongly once the named flag is on, or now. *Latent* = can't happen until a flag that is currently off is turned on.

#### V1 — Wallet sign is inverted between the ledger and the rules — **Critical (latent: `wallet_live`)**
- **Evidence:** the ledger is debit-positive. `codShortLines` posts customer debt as **+minor** (`journalLines.ts:54`), and `post_journal`'s cap treats a **positive** wallet balance as debt (`…_ledger.sql:364`). `walletDecision` treats **negative** as debt (`walletRules.ts:17-18`), the unit test asserts that (`rushMoney.test.ts:71-72`), and `GET /customer/wallet` passes `balance_minor / 100` straight through (`delivery/rushMoney/routes.ts:67-77`).
- **Scenario:** a customer short-pays J$300 cash. The ledger balance is +30,000 minor. The app shows **"Roam Rush credit J$300"**, `codAllowed = true`, and `applyCreditAtCheckout` would spend the debt as credit.
- **Fix:** pick one convention at the boundary. The wallet endpoint should present `credit = −balance`, `debt = +balance` explicitly. Add an integration test that posts `codShortLines` and then calls `walletDecision` on the stored balance.
- **Also:** wallet accounts are keyed by `component`, so a customer's `debt` and any future `credit` live in **separate accounts that never net**. `GET /customer/wallet` uses `.maybeSingle()` on `kind + party_id` and will error (and show J$0) once both exist. Use one wallet account per customer (component `''`) and put the reason on the line, not the account.

#### V2 — A duplicate-capture refund marks the whole order refunded — **High (live)**
- **Evidence:** `executeRefundById` decides full vs partial by comparing **all** of the order's completed refunds with the **refunded transaction's** amount (`executeRefund.ts:154-156`). For a duplicate capture, that transaction *is* the duplicate.
- **Scenario:** order paid J$2,622; a second capture of J$2,622 is auto-refunded. 2,622 ≥ 2,622, so the order becomes `payment_status = 'refunded'` and `money_state = 'refunded'` while it is still being delivered. The order then never settles (settlement requires `captured`), no later refund is possible (the status is no longer refundable), and merchant/courier are never credited in the ledger.
- **Fix:** duplicate and late-capture refunds must not touch the order's payment state. Compute the order's state from its **primary** capture only (`status = 'completed'`), and keep superseded-capture refunds on the superseded transaction.

#### V3 — Refund eligibility pools every refund on the order against one transaction — **High**
- **Evidence:** `queueAndExecuteRefund` loads refunds by `order_id` (`executeRefund.ts:205`) and subtracts them from one transaction's captured amount.
- **Scenario:** a duplicate-capture refund of J$2,622 is pending. Support later needs to refund the real capture, and eligible = 2,622 − 2,622 = 0, so the refund is refused.
- **Fix:** filter by `transaction_id`.

#### V4 — After pickup, a courier can trigger a full refund with no evidence — **High (live now)**
- **Evidence:** `courierConsumerRoutes.ts:1003-1012`. Any abort-class issue (`customer_unavailable`, `wrong_address`, `unsafe`, …) cancels and refunds 100%. The delivery-attempt protocol (`/orders/:id/delivery-attempt`) exists but is not required, and `quoteCancel` (which says *customer fault → no refund*) is not consulted. The merchant receives nothing for the food.
- **Scenario:** courier and customer collude. The courier picks up, marks "customer unavailable" and keeps the food; the customer is refunded. Rev 1 had the opposite error (customer never refunded). Both are wrong.
- **Fix:** after pickup, `customer_unavailable` / `wrong_address` must go through the WF7 flow:
  1. require the protocol (≥ 2 contact attempts, wait time, geofence);
  2. run `quoteCancel(... protocolValidated)`;
  3. post the merchant's food and the courier's delivery share;
  4. refund only what the quote says.

  Until that exists, route post-pickup aborts to **manual review** (no automatic refund) rather than an automatic full refund.

#### V5 — Cash-order settlement re-creates the courier double pay — **Critical (latent: `DASH_ALLOW_CASH_ORDERS` + payouts)**
- **Evidence:** `settleDeliveredOrder` runs for `collected` / `short_collected` orders (`settleOrder.ts:24`) using `settleLines`, which:
  - debits `order_clearing` by the full total, although cash orders never posted a capture into it, so `order_clearing` stays **+total forever** and `v_order_clearing_stale` always fires;
  - credits `courier_earnings` with the courier's delivery share and tip, which the courier **already kept in cash**, so the payout batch pays it again (Rev 1 PAY-H4, now inside the ledger).

  Separately, a short collection still posts the **full** Layer A′ remittance (`collectOnDelivery` is unchanged), so the courier owes Roam cash they never received **and** the customer owes the same shortfall.
- **Fix:** cash settlement needs its own journal: Dr `courier_remittance` (platform + merchant due, mirrored to Layer A′ with a shared correlation id) / Cr `merchant_payable`, `platform_revenue`; plus memo `courier_cash_earned` (never payable). On a short collection, Layer A′ collects only what was received, and the shortfall goes to the customer wallet.

#### V6 — Payout batches would pay every all-time balance, every week — **Critical (latent: `payout_export`)**
- **Evidence:** `POST /admin/rush-money/payout-batches` (`routes.ts:209-241`):
  - reads **lifetime** balances, ignoring `periodStart`/`periodEnd`;
  - applies `Math.abs()`, so a merchant who **owes** Roam (debit balance) is paid;
  - passes `receivableMinor: 0, reserveMinor: 0`;
  - posts **no** `payouts_in_flight` journal, so balances never fall and the next batch pays the same money again;
  - never sets `period_id`, so the period lock never engages.

  Also:
  - `/approve` has **no role check**, so any Dash admin, including `dash_ops`, can be one of the two approvers;
  - the person who prepared the batch can approve it;
  - the two-person trigger is `BEFORE UPDATE` only, so a batch inserted directly as `paid` bypasses it;
  - there is no export, paid or returned endpoint.
- **Fix:**
  - batch = sum of **journals in the period not yet in a batch**, signed (liability only);
  - preparing posts Dr payable / Cr `payouts_in_flight` and stamps `period_id`;
  - approve requires `finance_approver`, the approver must differ from the preparer, and the trigger also fires on INSERT;
  - net `merchant_receivable` (see V10).

#### V7 — `collect-cash` is unguarded and bypasses the state machine — **High**
- **Evidence:** `routes.ts:94-140`. It never checks `payment_method = 'cash'` or order status. It writes `money_state` directly instead of calling `rush_transition_money_state`. It can be called repeatedly (last write wins). A kept-change overpayment records no customer credit and no remittance adjustment.
- **Scenario:** a courier calls it on a **card** order with `amountReceived: 0`. The order becomes `short_collected`, and with the wallet live the customer is put in debt for the whole total.
- **Also:** new cash orders are still inserted with the default `money_state = 'awaiting_payment'` (`customerOrderRoutes.ts` unchanged), so the transition table's `awaiting_collection → …` path is never reachable.
- **Fix:**
  - assert COD, assert `picked_up`, assert the assigned courier;
  - make it one-shot (idempotent by order);
  - transition through the function;
  - set `money_state = 'awaiting_collection'` at order placement for cash.

#### V8 — Ledger has no history and refunds don't unwind settlement — **High**
- **Evidence:**
  - No capture journals were backfilled. `/internal/rush-money/recon` will therefore list **every pre-deploy completed transaction** as an exception: an alert that always fires, which Layer A′'s lesson warns against.
  - Orders captured before the deploy are backfilled to `money_state = 'captured'`, then settled with no capture behind them, leaving `order_clearing` non-zero.
  - Refund journals always debit `order_clearing` (`executeRefund.ts:44-45`). After settlement that account is already zero, so every post-delivery refund leaves it non-zero, and `merchant_payable` / `courier_earnings` are never reduced: the merchant is still paid for refunded food.
  - A partial refund before delivery followed by settlement posts the full split.
- **Fix:**
  - backfill capture (and, for delivered orders, settle) journals, then tie out per order (the Rev 1 Phase 1 gate);
  - refunds after settlement post the `reverseSplit` lines against the funding parties;
  - settlement posts the split of the **net** captured amount.

#### V9 — A rejected or failed completion leaves the customer told "paid" — **High (go-live trap)**
- **Evidence:** `completeWipayIntent` still marks the intent `completed` *before* the amount check and the RPC (`payments/index.ts`, the unchanged block above the new code). On an amount mismatch or an RPC error it returns early. The poll endpoint then reports `success: true` (intent completed), while the order stays `pending` and is later voided by the sweeper.
- **Also:** with `WIPAY_ENV=live` and `WIPAY_STATUS_URL` unset, every live capture is refused with 409 **after** WiPay has taken the money. There is no transaction row, so no refund can be raised, and the sweeper cancels the order. The status-query request shape is a guess, not the documented WiPay API.
- **Fix:**
  - mark the intent completed only inside `complete_payment_intent`;
  - on mismatch, set the intent to `review` and raise a recon exception;
  - make the live switch refuse to **start** intents when the status URL is missing (fail before charging, not after);
  - confirm the status API with WiPay in writing.

#### V10 — There are still two merchant money books — **Medium**
- **Evidence:**
  - Merchant fault debits still go to `payments.merchant_adjustments` (`merchantDebit.ts`), which the ledger and the batch engine never read.
  - Hand-typed `POST /admin/finance/payouts` is still live next to the batch engine.
  - The admin dispute path still debits the full refund amount.
- **Fix:**
  - post fault debits as journals (Dr `merchant_payable` / Cr …) with the existing idempotency key;
  - retire the manual payout route with a 410 that names its replacement (the house pattern);
  - use `reverseSplit` in `financeRoutes.ts`.

#### V11 — Refund execution has no claim lock and no retry cap — **Medium**
- **Evidence:** `executeRefundById` sets `submitted` without a conditional `WHERE status IN ('pending')` (`executeRefund.ts:84-88`). The 15-minute cron and an inline call can both reach WiPay. Whether WiPay honours `Idempotency-Key` is unconfirmed. `attempt_count` grows without bound while `WIPAY_REFUND_URL` is unset (the current state).
- **Fix:** claim with `update … where id = ? and status = 'pending' returning *` and proceed only if a row returned. Back off after N attempts and raise a recon exception.

#### V12 — Delivery-attempt logging is unauthenticated per order and doesn't validate — **Medium**
- **Evidence:** any courier can log attempts against **any** order id (`routes.ts:142-165`; no `courier_id` check). `protocolReady` counts only call/SMS ≥ 2 and ignores the wait time and the drop-off geofence that §7.5 specifies.
- **Fix:** assert the assigned courier; compute `protocolValidated` server-side from attempts + GPS + elapsed wait.

#### V13 — Courier self-reports can never be confirmed — **Medium**
- **Evidence:** `POST /courier/remittance/self-report` inserts `pending_confirmation` rows, but no admin endpoint or desk tab confirms or rejects them. They also bypass the `RMT-` reference sequence (`delivery.next_remittance_settlement_ref`).
- **Safe:** the balance is unaffected, since only events move it.
- **Fix:** a Remittance Desk "Pending confirmations" tab that calls the existing `settleRemittance` path with the self-report attached.

#### V14 — Wallet, COD eligibility, chargebacks and risk are not enforced anywhere — **Medium**
- **Evidence:**
  - `customerOrderRoutes.ts` is unchanged, so checkout never calls `walletDecision`, and debt and eligibility don't gate cash orders.
  - Chargebacks have insert-only intake: no reserve journal, outcome endpoint, evidence pack or deadline alerts.
  - `POST /admin/rush-money/risk/review` scores numbers **typed by the admin** in the request body. Nothing writes `risk.signals` or `risk.scores`, and nothing reads `risk.restrictions`.
- **Fix:** follow §7.5/§7.8.

#### V15 — The Phase 0 dedupe misses the two known duplicates — **Medium**
- **Evidence:** the migration de-duplicates by `intent_id` and by `provider_transaction_id`. RD-2026-000001 and RD-2026-000007 each had **two intents with different provider ids**, so neither is superseded and no duplicate refund is raised. `delivery.v_rush_multi_capture_orders` will keep listing them, and the Phase 0 gate can't pass.
- **Also:** `complete_payment_intent` has no "order already captured by another intent" guard. It is currently unreachable thanks to intent reuse + expiry, but it costs only one `EXISTS`.
- **Fix:** a one-off decision for those two orders (refund the later capture); add the guard.

#### V16 — Sweeper leaves `money_state` stale — **Low**
`void_abandoned_unpaid_orders` sets `payment_status = 'voided'` but not `money_state` (still `awaiting_payment`). It has no grace period after expiry, and an intent that failed seconds ago no longer counts as live, so an order can be voided while the customer is retrying.

#### V17 — Encoding damage and dead code — **Low**
- `payments/index.ts` was re-saved with a BOM and turned "—" into "â€”" throughout, including **user-facing error strings** (for example `WiPay callback secret not configured â€” set …`).
- The `close-period` body after `return 410` and the duplicate `close-period-retired` route are dead code; they cause all +10 new type errors.
- The ledger migration defines `post_journal` twice, with a misleading comment.

#### V18 — Small correctness/UX notes — **Low**
- `quoteCancel` labels a courier's `restaurant_closed` as **courier** fault.
- `canApproveFinance` is defined but unused.
- `rush_money` and `risk` were added to the PostgREST exposed schemas. This is safe as configured (RLS on, no grants to `anon`/`authenticated`) but unnecessary, because `public.rush_*` RPC wrappers exist. Prefer keeping ledger schemas unexposed.

### R2.4 What to do next, in order

1. **Close live issue V4** (route post-pickup aborts to manual review), plus **V2/V3** (refund state from the primary capture; eligibility per transaction).
2. **Prove Phase 0 in production:** apply the migrations if not yet applied; resolve RD-2026-000001/000007 (V15); confirm these return zero rows:
   ```sql
   select * from delivery.v_rush_cancelled_paid_unrefunded;
   select * from delivery.v_rush_multi_capture_orders;
   select * from payments.v_rush_refunds_stuck;
   select jobname, schedule from cron.job where jobname in ('rush-pending-refunds','rush-void-abandoned-orders');
   ```
3. **Finish Phase 1 properly (V8):** backfill capture/settle journals, tie out per order, make refunds unwind settlement through `reverseSplit`, then move fault debits into the ledger (V10).
4. **Fix V1, V5 and V7 before turning on `wallet_live` or `DASH_ALLOW_CASH_ORDERS`.**
5. **Rebuild the batch engine (V6)** before turning on `payout_export`, and retire the hand-typed payout route.
6. Build the single `cancelOrder()` service that **executes** `quoteCancel` on every path (Rev 1 §7.3). Today the quote is display-only.
7. Then the UI in §8. No app consumes the new endpoints yet.
8. Housekeeping: V9 before any live WiPay; V11–V13, V16–V18; wire the `rushMoney` tests into `ci.yml` with type checking (`deno test` without `--no-check`), because `test-supabase-functions.yml` strips types.

---

> **Rev 1 (2026-10-03) — original audit follows unchanged.**

**Date:** 2026-10-03
**Type:** Audit only. No code was changed while producing this document.
**Apps in scope:** Roam Rush (`apps/dash-customer`), Roam Rush Courier (`apps/dash-courier`), Roam Rush Partner (`apps/dash-merchant`), Roam Rush Admin (`packages/dash-admin`, hosted by `apps/rush-command` / `apps/admin`).
**Backend in scope:** `supabase/functions/payments`, `supabase/functions/delivery` (orders, disputes, remittance, finance admin), `supabase/functions/_shared` money modules, `packages/dash-pricing`, the `payments` / `delivery` schemas.
**Input design:** `Roam Architecture/ROAM RUSH - Payment, Risk & Fraud Operations Workflow.drawio`. It has 17 pages: Workflows 1–15, the Master Wallet Dashboard, and the Payment & Dispute Dashboard. All 479 nodes and 336 flow arrows were parsed and read.

---

## How to read this document

| If you want… | Read |
|---|---|
| The verdict in two minutes | §0 |
| What your diagram actually specifies | §2 |
| What Roam Rush does today, accurately | §3 |
| Workflow-by-workflow: built, partly built, missing | §4 |
| Where the diagram itself needs correcting before it is built | §5 |
| Bugs in today's code that must be fixed **before** building anything new | §6 |
| The target architecture, tailored to Roam Rush | §7 |
| Screen-level UI/UX for all four apps | §8 |
| Data model sketches | §9 |
| The build order, with gates | §10 |
| Decisions only you can make | §11 |
| Diagram fix list, file index, live evidence | Appendices |

Severity scale: **Critical** means money moves wrongly or is lost today. **High** means wrong money or a broken obligation as soon as volume arrives. **Medium** is a correctness or operations gap. **Low** is polish.

---

## 0. Executive summary

### 0.1 Verdict

Your diagram is a **good enterprise operating model**. It thinks about money from every party's side (customer, courier, merchant, platform, bank), and it names the exception paths most delivery start-ups discover only after losing money: no-change, short-drops, the float guarantee, split-tender forensics, and reverse disputes. As a *policy and operations* document it is ahead of the code.

It **cannot be built as drawn on top of today's Roam Rush**, for three reasons.

1. **The foundation has live money bugs (§6).** Several cancellation paths never refund a card customer. The payment webhook can capture twice for one order and can mark a cancelled order `paid`. The pending-refund retry would double-refund partial refunds and can never finish full ones. All three show up in **production data today** (Appendix C): order **RD-2026-000009** was cancelled by the courier, is still `paid`, and was refunded J$0. RD-2026-000001 and RD-2026-000007 each have **two captured transactions**. Four refunds are stuck `pending` and no job drains them.
2. **There is no shared accounting layer for Rush.** Money is recorded in five places that do not reconcile with each other: `payments.transactions` / `refunds` / `merchant_payouts` / `courier_payouts`, `payments.merchant_adjustments`, the `ledger.entries` dual-write mirror, `delivery.courier_remittance_*` (Layer A′ — the one part built correctly), and order columns. The diagram's "Shared Ledger Engine" (Master Wallet Dashboard) is exactly the missing piece. It needs to be built as **one double-entry ledger**, not three wallets.
3. **About a third of the diagram assumes a business Roam Rush does not run.** Workflows 2, 4, 14, 15, and parts of 9 and 10, assume **cash-only merchants** whom couriers pay in cash at pickup. Roam Rush pays every merchant digitally (Model B). Building courier float, merchant change funds and short/over-drop handling would add the largest fraud surface in the whole design for a merchant segment you don't serve yet. §5.1 recommends **not** building these unless a real business case appears.

### 0.2 What maps cleanly onto today's system

| Diagram | Roam Rush today | Status |
|---|---|---|
| WF1 Card customer → digital merchant | WiPay hosted checkout → `computeDashCaptureSplit` → merchant/courier/platform split | **Built**, needs hardening (§6) |
| WF3 Cash customer → digital merchant (driver remittance) | Layer A′ remittance ledger (`apply_remittance_event`), pause gate, Remittance Desk, write-off | **Built and sound.** Missing: explicit amount-collected capture and the short-payment path |
| WF6 Cancellation & refund matrix | Customer self-cancel only before prep (100%), courier cancel-compensation function | **About 20%** |
| WF7 Failed delivery | Courier "customer unavailable / wrong address" just cancels the order. No refund decision, merchant compensation or courier return fee | **Missing** (and currently harmful) |
| WF8 Chargebacks | Nothing. "Chargeback" appears in code only as a label for merchant fault debits | **Missing** |
| WF9 Internal cash disputes | Remittance Desk adjust/write-off/reverse exists. No dispute intake, evidence or courier self-report | **About 25%** |
| WF11 Fee disputes | Auto-dispute rules R1/R2/R5/R6 + support cases + admin resolve | **About 30%** |
| WF12 Payout disputes | Merchant payouts are hand-typed amounts. Courier payouts are self-created and never paid | **Missing** (no payout engine) |
| WF13 Customer cash debt & wallet | Nothing. COD orders cannot be refunded at all today | **Missing**, and **highest value** |
| WF5 / WF10 Split tender | Nothing | Missing (defer, §5.1) |
| WF2 / WF4 / WF14 / WF15 Cash-only merchants | Nothing | Missing (**don't build yet**, §5.1) |

### 0.3 The ten things that matter most

1. **Fix the five Critical bugs first (§6, Phase 0).** Every new workflow would inherit them.
2. **Route every cancellation through one `cancelOrder()` service** that applies a versioned **Cancellation & Refund Matrix** (WF6) and a **fault-funding table** (§7.4). Today there are six cancel paths and only two of them refund.
3. **Build one Rush Money Ledger (double-entry)** with a single mutation RPC modelled on `apply_remittance_event`. Layer A′ becomes one sub-ledger inside it, not a sibling.
4. **Separate the payment state from the kitchen state.** `orders.status` is the kitchen/delivery state. Add a server-owned `money_state` (unpaid → captured → partially_refunded → refunded; COD: awaiting_collection → collected / short / failed).
5. **Build the Customer Wallet (WF13) early.** It solves three problems at once: refunds for cash orders (impossible today), COD short-payment debt, and goodwill credits (WF11).
6. **Make COD collection explicit.** The courier confirms the amount actually received. Today "delivered" silently means "cash paid in full".
7. **Build a real payout engine.** Payouts should be derived from ledger balances, run as batches with maker-checker approval, and produce statements. Remove courier self-service period closing.
8. **Fault-correct merchant debits.** Today a merchant-fault refund debits the merchant the **whole customer total**, including the delivery fee, courier tip, service fee and GCT, which the merchant never received.
9. **Add a Chargeback Desk with manual intake (WF8)**, deadlines and a reserve. Do not try to "freeze the payout for this order ID": payouts are periodic, so by the time a chargeback lands the money has already left.
10. **Add risk controls in layers:** COD eligibility per customer, velocity limits, refund-abuse scoring and device linking. Bans, collections and credit-bureau reporting stay **human decisions** after legal review.

---

## 1. Scope and method

1. **The diagram.** The `.drawio` file is uncompressed XML with 17 pages. A parser rebuilt every page as lanes → nodes → labelled edges, and all 15 workflow pages, both dashboards and every exception-rules box were read.
2. **The code.** Read in full: `payments/index.ts`, `_shared/dashMoneySplit.ts`, `dash-pricing/src/codBalance.ts`, `delivery/admin/orderRefund.ts`, `delivery/disputeResolution/{processDispute,merchantDebit,notifications}.ts`, `delivery/admin/financeRoutes.ts`, `delivery/remittance/collectOnDelivery.ts`, `delivery/bankPayoutRoutes.ts`, `_shared/courierCancelCompensation.ts`. Also read: the order status state machine (`delivery/index.ts` `PUT /orders/:id/status`), customer order placement and cancel (`customerOrderRoutes.ts`), courier issue/earnings/payout routes (`courierConsumerRoutes.ts`), merchant earnings (`delivery/index.ts`), admin cancel (`admin/orderRoutes.ts`), the payments schema migration, and the Layer A′ design (`docs/CASH_ARCHITECTURE_ONBOARDING.md` Parts 5, 13, 19). The four apps' payment and checkout screens were spot-checked.
3. **Live data.** Read-only `SELECT` queries against the production project (Appendix C). Nothing was written.
4. **Prior decisions honoured.**
   - Layer A′ separation from Fleet Driver Settlements (CI-enforced).
   - The merchant leg is computed directly and **never** taken as the residual (`computeDashCaptureSplit`).
   - The "new fee must land in four places" rule.
   - Rush revenue projects into `fleet.trips`, never into a parallel revenue table.
   - "Don't add an eighth money engine": §7 builds **one** Rush ledger that absorbs the existing islands instead of adding another.

---

## 2. What the diagram specifies

### 2.1 Page index

| # | Page | Core idea | Key exception rules (from the page's rules box) |
|---|---|---|---|
| 1 | Card → Digital merchant | Auth & capture → escrow → split engine credits merchant (minus commission), driver (fee + tip), Roam (platform fee) | Cancel before accept = 100%; after pickup = partial (ingredients + driver fee); failed delivery → return, refund, driver return fee; chargebacks → PoD to gateway, escrow hold; missing items → partial refund from merchant ledger |
| 2 | Card → Cash-only merchant | Courier pays merchant cash from a **Lynk float**; platform reimburses courier digitally; merchant credit offset against cash advance | No-change, driver cash shortage → re-route to a driver with more float, merchant refuses cash, cancel after cash paid, failed delivery cash refund, Lynk outage → instant reimbursement |
| 3 | Cash customer → Digital merchant | Courier collects cash → remittance liability → Roam pays merchant digitally from platform revenue | Shortage pre-dispatch / partial cash, no-change overpayment → digital credit to customer and deduct from courier remittance, refused cash → cancel, merchant paid for food, courier return fee; refunds as wallet credit/ACH; courier non-remittance → deduct/collections/ban |
| 4 | Cash customer → Cash-only merchant | Courier pays merchant cash, collects full total, remits only the platform cut (**net settlement**) | Customer refuses after courier paid merchant → platform reimburses courier from escrow and flags the customer |
| 5 | Split tender (card + cash) | Capture card portion; courier collects cash portion; merchant gets **full** digital payout | Card decline → all-cash or cancel; cash refused → charge card on file; no-change; cancel → refund digital + reverse cash via remittance |
| 6 | Cancellation & refund matrix | 4 stages: Pre-Accept (100%), Pre-Pickup (partial + fee), Post-Pickup (no refund), Post-Delivery (dispute) | Refund method by tender: card → original method; cash → wallet credit or bank transfer; split → each to its own rail; cash remittance adjustment on refunds |
| 7 | Failed delivery & return | Contact protocol (≥2 attempts, 5 min wait) → validate GPS/calls → return or dispose → platform loss absorption | Fault matrix: customer → no refund; platform → 100% + credit; driver → 100% + dock/suspend; COD unreachable → platform absorbs |
| 8 | Chargeback & representment | Bank pulls funds → freeze payouts → gather evidence → accept or fight → arbitration → internal liability shifting | True fraud vs friendly fraud; missing-item partial; evidence failure = auto-lose + driver strike; 1% network threshold; collections |
| 9 | Internal cash & float disputes | Customer/driver dispute → freeze → investigate Lynk logs/GPS → adjudicate → ledger adjustment or uphold → repeat-offender detection | Customer claims cash paid; no-change kept by driver; Lynk outage → manual override + apology credit |
| 10 | Split-tender disputes | Dual-ledger forensic audit (gateway vs remittance) | Customer claims full cash and card charged; float reimbursement guarantee |
| 11 | Cancellation & fee disputes | Policy engine reviews logs → user wins / platform wins / app glitch → goodwill credit (marketing budget) | Glitch timestamps; driver left early → penalise driver; merchant cancel → void auth or refund + merchant rejection fee; merchant delay reverses driver penalty |
| 12 | Merchant & driver payout disputes | ACH trace, settlement ledger audit, reissue, overpayment clawback | Duplicate payout recovery; closed bank account → hold until updated; fake invoices → ban/legal |
| 13 | Customer cash debt & wallet recovery | Short-paid COD → **negative customer wallet** → COD disabled → debt added to next digital order → cash re-enabled | Immediate repayment; >90 days → collections; card decline on debt+order cancels both; overpayment → positive credit; new-account bypass → device/phone linking; disputed partial payment |
| 14 | Driver cash drop-off discrepancies | Short-drop → driver wallet negative → deduct earnings; over-drop → merchant change fund → credit back | Merchant miscount (POS/CCTV); unreported over-drop → 24h auto credit; repeat short-drops → ban |
| 15 | Merchant change fund | Merchant can't make change → negative change fund → instant float credit to driver → deduct merchant's next ACH | Merchant disputes; repeated till shortages → disable cash-only; driver falsely claims change owed; midnight till reconciliation |
| — | Master Wallet Dashboard | Customer / Driver / Merchant wallets → **one Shared Ledger Engine**; positive = platform liability, negative = party debt | Cross-ledger flows (reimbursement, recovery) automated |
| — | Payment & Dispute Dashboard | Index: Category 1 money movement (WF1–5), Category 2 exceptions (WF6–7), Category 3 disputes & risk (WF8–12) | — |

### 2.2 The diagram's implicit architecture

Reading across all pages, the design implies these components:

- **Payment gateway adapter** (auth, capture, refund, chargeback intake)
- **Order state machine** (WF6 lane is literally "ROAM RUSH PLATFORM (STATE MACHINE)")
- **Split payment engine** (exists today as `computeDashCaptureSplit`)
- **Escrow / clearing account**
- **Party ledgers:** customer wallet, courier float/remittance wallet, merchant payable + change fund
- **Remittance / cash reconciliation engine** (exists as Layer A′)
- **Net settlement engine** (WF4) and **hybrid settlement engine** (WF5)
- **Auto-deduction engine:** recover debts from future payouts
- **Policy engine:** cancellation matrix, fee rules, goodwill
- **Trust & Safety case system:** freeze, evidence, adjudication, repeat-offender detection
- **Collections:** write-off, external agency
- **Payout engine:** ACH, trace, reissue, clawback

---

## 3. Roam Rush payment architecture as built today

### 3.1 Component map

```
 Customer app (dash-customer)                 Courier app (dash-courier)           Partner app (dash-merchant)
  Checkout → POST /delivery/orders             Earnings / History                   Earnings page
  → POST /payments/intents (WiPay hosted)      POST /courier/payouts/close-period   GET /merchant/earnings
  → WiPay page → webhook                       Remittance card / paused screen      (orders 'delivered' − payouts)
  Cancel (placed/accepted only)                Report issue (abort = cancel)
  Report issue → processDispute                Collect cash = implicit on Delivered

                         ┌──────────────────────── supabase/functions ────────────────────────┐
                         │ payments/index.ts                                                   │
                         │   /intents  (reuse unexpired intent, else new)                      │
                         │   /webhooks/wipay (secret in query) → completeWipayIntent:          │
                         │        intent=completed → transactions.insert(split)                │
                         │        → ledger.entries dual-write → orders.payment_status='paid'    │
                         │   /refunds (admin) → refunds.insert(pending) → ledger dual-write     │
                         │        → WiPay refund only if WIPAY_REFUND_URL set (else 502)        │
                         │ delivery/                                                            │
                         │   PUT /orders/:id/status  (merchant, device, courier, admin paths)  │
                         │   customer cancel → orchestrateSystemOrderRefund (if paid)           │
                         │   admin cancel    → orchestrateOrderRefund (if paid)                 │
                         │   disputeResolution/processDispute (R1, R2, R5, R6 rules)            │
                         │   remittance/* (Layer A′: apply_remittance_event, settle, write-off) │
                         │   admin/financeRoutes (manual merchant payouts, adjustments, disputes)│
                         └──────────────────────────────────────────────────────────────────────┘
 Stores:  payments.{payment_intents, transactions, refunds, merchant_payouts, courier_payouts,
                    merchant_adjustments, customer_payment_methods}
          delivery.{orders (money columns + payment_status), order_events, order_disputes,
                    dispute_resolution_actions, merchant_performance_snapshots,
                    courier_remittance_accounts/events/settlements/exceptions}
          ledger.entries  (dual-write mirror via _shared/unifiedLedger/dualWriteDash.ts)
```

### 3.2 Money-in rails

| Rail | State | Notes |
|---|---|---|
| Card via **WiPay hosted checkout** (`method: credit_card_co`) | Soft-launch / demo. `docs/roam-rush-payment-golive-gate.md` is **unsigned** | It is a **sale** (immediate capture), not authorize-then-capture. There is no void, only refund. `fee_structure: merchant_absorb` |
| **Cash on delivery** | Behind `DASH_ALLOW_CASH_ORDERS=true` | Order created `payment_status='pending_collection'`. Marking it delivered flips it to `paid` automatically (`courierCashLedger.ts:198-203`) and posts a Layer A′ `collected` event for platform + merchant dues |
| Saved cards | Not real | `POST /payments/methods` stores token metadata only. The UI says "cards saved during checkout", but no tokenization exists. **No card-on-file charging is possible**, which WF5 and WF13 assume |
| Wallet / store credit | None | — |
| Split tender | None | — |
| Rush Pass subscription | WiPay intent with `purpose=rush_pass` | Separate activation path |

### 3.3 The money split (keep this — it is correct)

`computeDashCaptureSplit` (`_shared/dashMoneySplit.ts`) and `computeCodTrialBalance` (`dash-pricing/src/codBalance.ts`) are the trusted core:

- **Merchant** = discountedSubtotal − commission. Computed directly, never residual.
- **Courier** = delivery courier share + tip net + peak pay.
- **Platform** = service + processing + commission + signed delivery platform share + GCT + small-order fee − peak.
- COD: courier retains its share in cash and remits platform due + merchant due through Layer A′.

The diagram's "Split Payment Engine" **is** this function. Don't rebuild it. Extend it with a **reverse split** for refunds (§7.4), which does not exist today.

### 3.4 Order state machine today

`orders.status`: `placed → accepted → preparing → ready → assigned → picked_up → delivered → completed` (completed = the customer rated the order), plus `cancelled`.
`orders.payment_status` (free text): `pending | pending_collection | paid | refund_pending | partially_refunded | refunded`.

**Six different code paths can cancel an order**, and they behave differently:

| Path | Refunds a paid card order? | Courier compensation | Tax reversal | GG clawback |
|---|---|---|---|---|
| Customer self-cancel (`customerOrderRoutes.ts:780`, placed/accepted only) | **Yes** (full) | No (not called) | Yes | No |
| Merchant cancel/reject via `PUT /orders/:id/status` (JWT) (`index.ts:1403-1440`) | **No** | Yes | Yes | Yes |
| Merchant station device cancel (`index.ts:1225-1260`) | **No** | Yes | Yes | Yes |
| Courier status `cancelled` (`index.ts:1320-1364`) | **No** | Forced 0 | Yes | Yes |
| Courier "report issue" abort (`courierConsumerRoutes.ts:905-994`): customer_unavailable, wrong_address, unsafe, accident, vehicle_issue, restaurant_closed… | **No** | Forced 0 | **No** | **No** |
| Admin cancel (`admin/orderRoutes.ts:165-259`) | **Yes** (full) | No | Yes | Yes |

This table is the single most important finding of the audit. It is why the diagram's WF6 "state machine" lane matters.

### 3.5 Refunds today

- `orchestrateOrderRefund` (`admin/orderRefund.ts`) computes the eligible amount (paid − pending − completed refunds). It calls `POST /payments/refunds`, and if that fails it queues a `pending` row.
- `POST /payments/refunds` inserts a `pending` refund **and writes the ledger refund entry before calling WiPay**. If `WIPAY_REFUND_URL` is unset it returns 502 and the refund stays `pending`.
- `processPendingRefunds` (cron endpoint `/internal/disputes/process-pending-refunds`) re-runs the orchestrator **without referencing the pending row**. See §6, PAY-C5.
- A refund is a single amount. Nothing decides which party funds which component, and the courier's earnings are not adjusted. Tax is reversed only on full cancellation.
- **COD orders cannot be refunded at all.** The orchestrator requires a completed `payments.transactions` row, and COD orders never have one.

### 3.6 Disputes today

`processDispute` (`disputeResolution/processDispute.ts`):

| Rule | Behaviour |
|---|---|
| R1 forgotten order | Courier waited, order never fulfilled, card paid, total ≤ J$4,000 → auto full refund + **merchant debit of the full total** |
| R6 missing items with photo | Auto refund of **50% of order total** (capped) + merchant debit of the same amount |
| R2 never arrived | Urgent manual case |
| R5 courier unassign | Redispatch only |
| Default | Manual case |

Admin resolves in Finance → Disputes by typing a status string into a prompt dialog. Choosing `refunded` triggers a refund and, if fault = merchant, a merchant debit.

### 3.7 Payouts today

- **Merchant:** an admin types an amount into Finance → Payouts → Create (`financeRoutes.ts:72`). Nothing derives it from orders, adjustments or refunds. Hold/release exist. **No code path ever marks a payout `completed`/paid.**
- **Courier:** the **courier** calls `POST /courier/payouts/close-period` with any dates (`courierConsumerRoutes.ts:1145`). The amount is summed from delivered orders. Nothing ever pays it.
- No payout rail is integrated. `bankPayoutRoutes.ts` is a stub ("Stripe removed").
- Live: **0** merchant payouts, **0** courier payouts.

### 3.8 Layer A′ — the part that is already enterprise-grade

`delivery.courier_remittance_*` + `apply_remittance_event` give you: append-only events, row-locked balance mutation, deterministic idempotency keys, overdraw refusal **before** writing, a trial-balance CHECK, a generated pause flag, settlement receipts with methods including `lynk`, write-off and reversal, and drift views. **This is the template for everything in §7.** It also already implements the core of WF3 and the "Remittance Ledger" lane of WF9/WF10.

One structural limit: `balance_minor >= 0`. Layer A′ can only represent "courier owes Roam". It cannot represent "Roam owes courier", which is what the diagram's float reimbursement and float guarantee need. That is deliberate and correct for a remittance account. It means courier earnings and reimbursements need their **own** account, not a negative remittance balance (§7.2).

### 3.9 Risk and fraud today

Essentially none on the Rush side:
- no device linking
- no velocity limits on orders, refunds or issues
- no refund-abuse scoring
- no COD eligibility per customer
- no courier trust score

The only control is a manual `account_status='suspended'` check on payment intents. The auto-dispute cap is an env var (`DASH_AUTO_DISPUTE_MAX_REFUND_JMD`, default 4000).

---

## 4. Gap analysis — diagram vs Roam Rush, workflow by workflow

Legend: ✅ exists and is sound · 🟡 partial or unsafe · ❌ missing · ⛔ recommend **not** building yet.

### WF1 — Card customer → digital merchant

| Diagram step | Today | Gap and what to do |
|---|---|---|
| Auth & capture | ✅ WiPay sale via webhook | Harden the webhook (PAY-C2, C3, C4). WiPay hosted checkout has no separate auth, so drop "auth" language or design around refunds |
| Auth fail → prompt alternate payment | 🟡 Intent marked `failed`; the order stays `placed`/`pending` forever (live: 3 such orders) | Add intent expiry + order auto-void sweeper; "Payment didn't go through → try again / pay cash (if eligible)" UI |
| Hold in escrow | ❌ (funds sit in Roam's WiPay merchant account) | Model as a **clearing liability account** in the ledger (§7.2). Don't call it escrow (§5.2) |
| Create order / dispatch to merchant | ✅ Merchant queue hides unpaid card orders (`index.ts:1629`) | — |
| Split payment engine | ✅ `computeDashCaptureSplit` | Add reverse-split for refunds |
| Credit merchant / driver / Roam | 🟡 Written as ledger mirror rows at **capture** time, not at delivery | Recognise party payables at **delivery** (settlement trigger), not capture. Today a merchant is "credited" for a paid order that is later cancelled |
| Receives digital payout | ❌ No payout engine | §7.6 |
| Exceptions box (cancel, failed delivery, chargeback, missing items) | 🟡 / ❌ | WF6, WF7, WF8 below |

### WF2 — Card customer → cash-only merchant (courier float) ⛔

Not applicable today. Roam Rush has no cash-only merchants: every merchant is paid digitally. See §5.1 for when and how to build it if ever.

### WF3 — Cash customer → digital merchant (driver remittance)

| Diagram step | Today | Gap |
|---|---|---|
| Flags COD, escrow liability created | 🟡 `payment_status='pending_collection'`; no ledger entry until delivery | Post an *expected receivable* at dispatch (memo, not balance) so exposure is visible pre-delivery |
| Assign cash-collection task | 🟡 Courier sees cash order; pause gate blocks accept when over threshold | Pre-dispatch check: does this courier's remaining headroom cover this order's remittance? (diagram exception 1) |
| Courier collects cash | 🟡 **Implicit**: tapping Delivered = full cash collected | **Explicit "Collect J$X" step** with amount entry, change calculator, "customer short / refused" branch (feeds WF13) |
| Confirms cash collected → remittance liability | ✅ Layer A′ `collected` event, idempotent per order | — |
| Digital payout to merchant from platform revenue | 🟡 Merchant earnings include COD orders; no payout engine | Payout engine; decide whether merchant is paid before courier remits (credit risk on Roam, §11 Q4) |
| Remits via Lynk / deducted from future earnings | ✅ Settle on desk incl. `lynk`. ❌ Netting deferred (Q1). ❌ Courier self-report (Q5) | Implement Q5 self-report (big UX win for paused couriers); netting as explicit `payout_offset` (§7.6) |
| Exceptions: no-change overpayment → customer digital credit, deduct from remittance | ❌ | Needs customer wallet (WF13) + remittance `adjustment` with correlation id |
| Exceptions: customer refuses cash → cancel; merchant paid; courier return fee | ❌ | Failed-delivery service (WF7) |
| Refunds for cash as wallet credit / bank transfer | ❌ **COD refunds impossible today** | Customer wallet (WF13) |
| Driver negative balance → collections / ban | ✅ write-off; ❌ ban workflow | Risk case + human decision |

### WF4 — Cash customer → cash-only merchant (net settlement) ⛔
Not applicable (no cash-only merchants). See §5.1.

### WF5 — Split tender ⛔ (defer)
Not built. Requires card-on-file tokenization (doesn't exist) and explicit cash collection (doesn't exist). The diagram's own WF10 shows how much forensic work split tender creates. Recommendation in §5.1: replace it with **"Wallet credit + card"** (digital split), which gives customers the flexibility without a cash leg.

### WF6 — Cancellation & refund matrix

| Diagram | Today | Gap |
|---|---|---|
| Single state machine decides stage | ❌ Six cancel paths, inconsistent (§3.4) | **One `cancelOrder(actor, reason, evidence)` service** |
| Stage 1 Pre-Accept: 100% | ✅ customer self-cancel `placed` | Also must apply to merchant reject (today: **no refund**) |
| Stage 2 Pre-Pickup: partial + cancel fee; merchant gets ingredient cost; driver show-up fee | 🟡 Customer can cancel at `accepted` (100%) but **not** at `preparing`/`ready`; courier comp = 50% delivery fee exists but is unfunded in the ledger | Matrix row with fee config; merchant prep compensation; courier comp ledgered |
| Stage 3 Post-Pickup: no refund, full payouts | ❌ Customer must contact support | Matrix row |
| Stage 4 Post-Delivery: dispute / evidence | 🟡 processDispute rules | WF11 |
| Refund method by tender | 🟡 Card only; cash impossible | Customer wallet; bank-transfer option |
| Cash remittance adjustment on refund | ❌ | Layer A′ `adjustment` event with correlation id |
| Notify merchant & driver | 🟡 SMS to customer only | Push to merchant/courier with money impact ("You'll still be paid J$X for this order") |

### WF7 — Failed delivery & return to merchant

| Diagram | Today | Gap |
|---|---|---|
| Contact protocol (≥2 attempts, 5 min wait) | ❌ Courier can abort instantly with "customer unavailable" | Guided protocol in courier app with timer + in-app call/SMS logging (§8.2) |
| Validate GPS, call logs, wait time | ❌ | Server validation: geofence radius at drop-off, wait ≥ policy, ≥2 contact events |
| Authorize return / disposal | ❌ | Ops decision or rule (perishable → dispose; high-value/sealed → return) |
| Merchant compensated for food | ❌ Order cancelled → merchant gets **nothing** for food made | Matrix: merchant gets merchant-net |
| Courier return fee + base | ❌ Forced J$0 | Matrix: courier full delivery share + return fee if returning |
| Customer refund by fault | ❌ No decision; card customer silently keeps being charged (customer-fault outcome by accident; platform/courier-fault cases wrongly unrefunded) | Fault matrix §7.4 |
| COD unreachable | ❌ | Customer wallet debt (WF13) for at least the non-food portion, **not** blanket platform absorption (§5.3) |

### WF8 — Chargeback & representment ❌
Nothing exists: no intake, no reserve, no evidence pack, no deadline tracking, no internal liability shifting. WiPay acts as your acquirer/facilitator. Confirm with WiPay how disputes are notified (email/portal/API) and what the response window is. Build a manual-intake **Chargeback Desk** first (§7.7).

### WF9 — Internal cash & float disputes
🟡 Remittance Desk can adjust, write off and reverse. ❌ No dispute intake from courier or customer, no evidence upload, no freeze semantics, no repeat-offender scoring. Float items ⛔ (no float).

### WF10 — Split-tender disputes ⛔ (follows WF5)

### WF11 — Cancellation & fee disputes
🟡 Support cases, auto rules, admin resolve. ❌ Fee-level disputes (there are no cancellation fees yet), courier penalty appeals (there are no penalties yet), merchant rejection fee, goodwill credit (no wallet), policy-abuse detection.

### WF12 — Merchant & driver payout disputes
❌ Depends on a payout engine. Note: "ACH trace R01–R09" is US NACHA vocabulary and doesn't apply to Jamaican rails (§5.2).

### WF13 — Customer cash debt & wallet recovery ❌ (highest-value build)
Nothing exists. It also unlocks: COD refunds, no-change overpayment credits, goodwill credits, fault-based partial refunds as instant credit, and COD eligibility control.

### WF14 / WF15 — Driver cash drop-off / merchant change fund ⛔
Only meaningful with cash-only merchants.

### Master Wallet Dashboard
🟡 Concept is right. Implementation must be **one double-entry ledger with party accounts**, not three wallets with automated "cross-ledger flows" (§5.4, §7.2).

---

## 5. Where the diagram itself should change before it is built

Being the architect here means telling you where the design is risky, inconsistent, or built on assumptions that don't hold in Jamaica or on WiPay.

### 5.1 Scope: don't build the cash-only-merchant branch (WF2, WF4, WF14, WF15) now

**Why.**
- Roam Rush pays every merchant digitally today. That is also what makes Model B's merchant protection work.
- Couriers paying merchants in cash creates a **three-party cash chain**: customer → courier → merchant. Every hop can be short, over or disputed. WF14 and WF15 exist only to clean up that chain.
- It requires Roam to **advance credit to couriers (float)**, which is a lending exposure.
- It requires a Lynk integration that may not exist programmatically. Nothing in the codebase calls a Lynk API; `lynk` is only a settlement *method label*.

**Recommendation.** Make "merchant accepts Roam digital payouts" an **onboarding requirement** (already partly enforced by `merchants.payout_ready`). Revisit only if a large, specific merchant segment (for example cookshops/street food) proves it will not onboard without cash. If that day comes, build it as a separate merchant `settlement_mode = 'cash_at_pickup'` with:
- float advanced only to couriers with trust score ≥ X and capped per order and per day
- the Layer A′ pattern for a `courier_float` account
- merchant change fund as a merchant sub-account
- WF14/WF15 implemented exactly as drawn

**WF5 split tender: replace it with "wallet credit + card".** A cash leg on a card order forces WF10 forensic audits forever. "Use J$800 credit + pay the rest by card" gives most of the benefit with zero cash forensics. If a cash+card split is still wanted later, the prerequisites are explicit cash collection (§7.5) and card-on-file tokenization.

### 5.2 Terms and rails that don't fit Roam Rush / Jamaica as drawn

| Diagram term | Problem | Use instead |
|---|---|---|
| "Auth & Capture", "void pending auth" (WF1, WF11 #3) | WiPay hosted checkout (`credit_card_co`) is an immediate **sale**. There is no separate authorization to void | "Capture" + "refund". If a future provider supports auth/capture, capture at merchant-accept to cut refund volume |
| "Escrow" (everywhere) | Roam does not hold funds in a legal escrow; they settle into Roam's WiPay merchant account. Calling it escrow in customer-facing copy may create obligations. **Holding funds owed to third parties (merchants, couriers, customer wallet balances) may engage Bank of Jamaica payment-services / e-money rules. Get legal advice before launching stored-value wallets** | Ledger account **"Order Clearing (liability)"**; customer copy: "Roam is holding this payment until delivery" only after legal sign-off |
| "ACH Trace R01–R09 return codes" (WF12) | NACHA R-codes are a US convention | Whatever return/trace references your actual payout rail provides (bank transfer, WiPay disbursement, or the Jamaican ACH) |
| "Visa/Mastercard fines at 1% chargeback ratio" (WF8 #5) | Network monitoring programmes and thresholds are applied through your acquirer (WiPay) and change over time | "Chargeback ratio monitored against WiPay's/network thresholds"; get the exact numbers from WiPay in writing |
| "Credit bureau", "gig-economy blacklist", "legal action", "debt sold to collections" (WF9, 13, 14) | Jamaica's Credit Reporting Act and Data Protection Act 2020 constrain who can report and what data is shared. A cross-platform "blacklist" is high legal risk | Internal ban + write-off + referral to a licensed agency after legal review. **Never automate** these outcomes |
| "Device ID matching to link accounts" (WF13 #5) | Personal data processing; needs a lawful basis and privacy-notice disclosure | Keep it, but disclose it, minimise it (hash device ids) and use it as a **signal** for review, not an auto-ban |
| "Driver's pay is docked / strike" (WF7, WF8) | Deductions from contractor pay must be covered by the courier agreement and be transparent and appealable | Courier ToS clause + "Deductions" screen with appeal (§8.2) |

### 5.3 Internal contradictions in the diagram

1. **WF6 arrows are cross-wired** (the text box is right, the arrows are wrong):
   - *Stage 2 Pre-Pickup* → arrow points to **"Full Reversal (100% to Customer)"**. It should be the partial reversal.
   - *Stage 3 Post-Pickup (No Refund)* → arrow points to **"Partial Reversal"**. It should be "No reversal".
   - *Stage 4* → "No Reversal". It should be "Dispute outcome (0–100%)".
   - *Stage 1* → "Escrow Ledger State". It should be "Full Reversal".
2. **WF7 merchant compensation**: the node says "Credit Merchant (**Full Amount**)", while rule 2 says "FULL order amount (**minus commission**)". Use merchant-net (discountedSubtotal − commission), consistent with Model B.
3. **WF7 rule 5 vs WF13**: for an unreachable COD customer, WF7 says "platform absorbs". WF13 says short-paid COD creates **customer debt**. Make it consistent: customer-fault COD failure creates a customer debt (at minimum delivery fee + service fee; optionally food), and the platform absorbs only what can't be recovered.
4. **WF1 rule 1 vs WF6 Stage 3**: WF1 says "after pickup → partial refund (ingredient cost + driver fee)", while WF6 says "Post-Pickup → No Refund". Pick WF6.
5. **WF3 "Digital Payout to Merchant (From Platform Revenue)"**: the merchant should be paid from the **order's** merchant due (funded by the courier's remittance), not from platform revenue. Platform revenue only fronts it if the merchant is paid before remittance. That is a credit decision (§11 Q4).
6. **WF8 "Freeze Merchant & Driver Payouts for this Order ID"**: chargebacks arrive weeks later, after periodic payouts have gone. The real mechanism is a **chargeback reserve + negative adjustment on the next payout**, which the diagram already has as "Internal Liability Shifting".
7. **WF10 rule 1 logic**: "If the driver remitted the full amount, the customer is lying". Remittance today is **computed from the order**, not from what the courier physically received, so it proves nothing. The rule only works once couriers record the actual amount collected (§7.5).
8. **Master Wallet Dashboard edges**: "Customer Ledger →(Debt Recovery)→ Driver Ledger" and "Driver Ledger →(Reimbursement)→ Merchant Ledger". In double-entry terms every cross-party flow is one balanced journal touching two or more accounts. Recovering a customer's debt doesn't move money into the driver ledger unless the driver was the one who was short-paid. Specify each flow as a journal (§9.2).
9. **Sign conventions**: the dashboard says "positive = platform liability, negative = party debt". Layer A′ stores the **opposite** (positive = courier owes Roam). Fine, if every UI shows balances from the *party's* point of view with words, not signs ("You owe J$X" / "Roam owes you J$X").

### 5.4 What the diagram is missing (enterprise needs it doesn't draw)

- Payment-intent expiry and abandoned-order cleanup.
- Webhook authenticity, amount verification, idempotency and replay.
- Daily **provider reconciliation**: WiPay settlement report vs `transactions` vs ledger (go-live gate item 6).
- **Tax (GCT) on refunds**: partial refunds must reverse a proportional share of output tax. Today only full cancellation reverses tax.
- Promotions and subsidies on refund: Rush Pass free-delivery budget, promo free-delivery budget, Growth Guarantee clawback (exists for cancel and full refund only).
- **Tips on refunds**: a tip belongs to the courier and must never be clawed back unless the courier is at fault.
- Peak pay on cancellation.
- The tier-2 fleet-owner split. Rush deliveries project into `fleet.trips`, so refunds and adjustments that change courier earnings must re-project (see the Rush→Fleet integration docs).
- **Maker-checker** (two-person approval) for refunds/adjustments above a threshold and for every payout batch.
- **Period locks**: once a payout batch is paid, its orders' money is immutable. Later changes become next-period adjustments.
- Payout KYC: verified bank account owner name vs merchant/courier legal name.
- Audit trail requirements: who, what, why, evidence, before/after.
- Customer communications for every money event (receipt, refund issued, refund completed, credit added, debt notice).
- Rush Pass refunds/cancellations.

---

## 6. Findings register — current code (fix before building new workflows)

Each finding has: ID, severity, evidence, failure scenario, recommendation.

### PAY-C1 — Merchant, courier, device and courier-abort cancellations never refund a paid card order — **Critical**
- **Evidence:** `delivery/index.ts:1225-1260` (device), `:1320-1364` (courier), `:1403-1440` (merchant JWT), `courierConsumerRoutes.ts:964-994` (issue abort). None of them calls `orchestrateSystemOrderRefund`. Only customer cancel (`customerOrderRoutes.ts:865`) and admin cancel (`admin/orderRoutes.ts:237`) do. Nothing scheduled or in the database catches `cancelled AND payment_status='paid'`.
- **Live:** **RD-2026-000009**: `cancelled_by=courier`, `payment_status=paid`, refunded **J$0** of J$2,002.16.
- **Scenario:** a merchant rejects a paid order because an item is out of stock. The customer was charged and is never refunded. Ops only finds out from a complaint.
- **Fix:** one `cancelOrder()` service called by every path (§7.3). Interim: a nightly check plus an alert on `status='cancelled' AND payment_status='paid' AND no completed refund`.

### PAY-C2 — The webhook can capture a second payment for one order and marks cancelled orders `paid` — **Critical**
- **Evidence:** `payments/index.ts:413-431` reuses an intent only while `expires_at > now` (30 min); after that it creates a **new** intent and a new WiPay checkout, but the old checkout can still be completed. `completeWipayIntent` (`:181-305`) never checks order status, never checks for an existing completed intent on the order, and unconditionally sets `orders.payment_status='paid'` (`:301-305`). That overwrites `refund_pending`/`refunded` and ignores `cancelled`.
- **Live:** RD-2026-000001 and RD-2026-000007: 2 intents, **2 completed transactions** each, one refund each, status `cancelled` + `paid`.
- **Scenario:** the customer abandons checkout, comes back 40 minutes later, pays again on the new link, then pays the old tab too. Roam has captured twice and the order shows one payment.
- **Fix:**
  - The money state machine refuses `captured` on any order whose money_state is not `awaiting_payment`.
  - A second capture on the same order auto-creates a **duplicate-capture refund**.
  - Expire old intents with WiPay where supported, and always reject completing an intent that isn't the order's current one (or auto-refund it).

### PAY-C3 — No database uniqueness on captures; check-then-act race — **Critical**
- **Evidence:** `payments.transactions` has no unique constraint on `intent_id` or `(provider, provider_transaction_id)` (migration `20260511150000_payments_schema.sql:25-43`). `alreadyPaid` is read and then updated (`payments/index.ts:189-200`). The ledger mirror idempotency key is `dash_payments:${txn.id}` (`dualWriteDash.ts:199`), so a duplicate row produces duplicate ledger entries.
- **Scenario:** WiPay retries the callback and two isolates process it concurrently. Two transactions and two sets of ledger split entries get recorded.
- **Fix:** `UNIQUE (intent_id)` and `UNIQUE (provider, provider_transaction_id)` on transactions. Move completion into one SQL function (`complete_payment_intent`) that locks the intent row, the same pattern as `apply_remittance_event`.

### PAY-C4 — Webhook trust: no amount check, secret in URL, loose status parsing — **Critical before live card**
- **Evidence:** `payments/index.ts:613-628`. The callback's amount/currency is never compared with `intent.amount`. The shared secret travels as a URL query parameter (`responseUrl.searchParams.set("secret", …)`, `:555-556`), so it appears in provider logs and any intermediary. `wipaySuccess` accepts eight aliases ("1", "true", "ok"…) (`:103-106`). Go-live gate items 1, 2 and 5 are unchecked.
- **Fix:**
  - Verify WiPay's signed hash per their current documentation, if the API provides one.
  - Assert total = intent amount and currency = JMD.
  - Pin one status field and value.
  - Move the secret to a header if WiPay supports it; otherwise rotate it and treat the query secret as a routing token, not authentication.
  - Server-to-server **status re-query** to WiPay before marking captured.

### PAY-C5 — The refund lifecycle is wrong at three points — **Critical**
1. **Ledger written before the provider confirms.** `payments/index.ts:782-814` inserts the `pending` refund and dual-writes `order_refund` **before** calling WiPay. When the provider fails or isn't configured (502), the ledger already says refunded.
2. **The pending retry duplicates partial refunds and never finishes full ones.** `processPendingRefunds` (`notifications.ts:84-98`) calls the orchestrator with the pending row's amount but **not its id**. The orchestrator counts that same pending row as already refunded (`orderRefund.ts:78-88`).
   - Full refund pending → eligible = 0 → "no remaining refundable amount". It is **stuck forever**.
   - Partial refund ≤ 50% pending → eligible ≥ amount → a **second** refund row (and second ledger entry) is created. The customer can be refunded twice.
3. **The drain isn't scheduled.** No migration or `cron.job` calls `/internal/disputes/process-pending-refunds`.
- **Also:** `POST /payments/refunds` doesn't validate the body. `amount` can exceed the captured amount when called directly (the orchestrator validates; the endpoint doesn't).
- **Live:** 4 refunds `pending`; 2 orders `refund_pending`; 0 refund cron jobs.
- **Fix:** refund state machine (`requested → submitted → succeeded | failed → retried(same row)`). The ledger posts only on `succeeded`. Retry by refund id with an idempotency key sent to the provider. Validate amount ≤ captured − succeeded − in-flight. Schedule the drain.

### PAY-H1 — Merchant fault debit charges the merchant for money it never received — **High**
- **Evidence:** `processDispute.ts:164-171` (R1) debits `refundAmount = order.total`. `:260-267` (R6) debits the partial cap. `financeRoutes.ts:254` debits the admin refund amount. `order.total` includes the courier's delivery share and tip, the service fee, the small-order fee, the processing fee and GCT.
- **Scenario:** J$2,622 order, J$1,800 food, 15% commission → merchant received J$1,530. R1 debits J$2,622. The merchant loses J$1,092 they never had.
- **Also:**
  - Idempotency key `fault_debit:${orderId}` (`merchantDebit.ts:25`) allows **one** debit per order, so a legitimate second fault debit is silently dropped.
  - `chargeback_balance` is updated by read-modify-write, which races.
  - The labels say "Chargeback", which collides with real card chargebacks (WF8).
- **Fix:** the fault-funding matrix (§7.4) computes the merchant's share from the **reverse split** (food component net of commission, plus proportional food GCT where the merchant collects it). Key the debit by `(order, dispute/refund id)`. Rename to "Merchant fault adjustment".

### PAY-H2 — Refunds aren't decomposed; courier and platform legs never reverse — **High**
- **Evidence:** the refund dual-write is a single `order_refund` entry attributed to the merchant (`dualWriteDash.ts:180`). Courier earnings come from order columns and ignore refunds (`courierConsumerRoutes.ts:1024-1055`). Partial refunds don't reverse GCT.
- **Fix:** a reverse split per refund that produces component lines (food, commission, delivery-courier, delivery-platform, service, small-order, tip, GCT food, GCT platform), each assigned to a funding party by the matrix.

### PAY-H3 — Courier "failed delivery" is a plain cancel — **High**
- **Evidence:** `courierConsumerRoutes.ts:905-994`. `customer_unavailable` / `wrong_address` cancel immediately. Courier compensation is forced to 0. There is no tax reversal and no GG clawback. Nothing validates wait time or GPS. The food is neither returned nor accounted for. The merchant gets nothing for the food. The customer decision is accidental.
- **Also:** `vehicle_issue` / `accident` *before pickup* cancel the whole order instead of **redispatching**, even though the redispatch path exists (`/orders/:id/unassign`, R5).
- **Fix:** WF7 service (§7.5). Pre-pickup courier problems redispatch.

### PAY-H4 — Couriers create their own payout periods; COD courier share is double-counted — **High** (Critical once payouts are automated)
- **Evidence:** `courierConsumerRoutes.ts:1145-1234`.
  - Any courier can post arbitrary `periodStart`/`periodEnd`. Uniqueness covers only the exact date pair (migration `20260809120000`), so overlapping periods double-claim the same deliveries.
  - The sum includes **COD orders, where the courier already kept its share in cash** (`courierRetainedJmd`), so it is paid twice.
  - Cancel compensation is excluded, even though the History screen shows it as earnings.
  - There is no approval, no statement, and no `paid` transition.
- **Fix:** payout engine (§7.6). Earnings come from ledger postings; COD-retained earnings post as *earned and already received in cash*. Periods are system-defined and locked. No courier-callable close.

### PAY-H5 — Merchant payouts are hand-typed and disconnected from what is owed — **High**
- **Evidence:** `financeRoutes.ts:72-111`. Amount, order_count and period are free-form. `merchant_adjustments` (fault debits, admin credits/debits) are **never netted** into payouts or the merchant balance. Nothing ever sets `completed`. `release` after `hold` doesn't re-post the ledger mirror that `hold` reversed (`:113-153`), so the ledger understates payables.
- **Fix:** payout batches computed from the merchant payable account (§7.6), with maker-checker and statements.

### PAY-H6 — The merchant earnings screen is wrong — **High** (trust)
- **Evidence:** `delivery/index.ts:2264-2354`.
  - It counts only `status='delivered'`. When a customer rates an order it becomes `completed` and **disappears from the merchant's balance**.
  - It ignores refunds and adjustments.
  - It lists **every** cancelled order as "Refund − subtotal", including orders cancelled before acceptance that were never credited.
  - `pending` payouts are subtracted from the balance even though no payout ever completes.
  - Weekly bars bucket by `placed_at`, not by the delivery/settlement date.
- **Fix:** the screen reads the merchant ledger account (§8.3).

### PAY-H7 — COD "collection" is implicit; short or refused payment cannot be recorded — **High** (when cash is enabled)
- **Evidence:** `courierCashLedger.ts:198-203`. Delivered ⇒ `paid`. Layer A′ posts the full remittance.
- **Scenario:** the customer pays J$2,200 on a J$2,500 order. The courier either marks Delivered (and owes Roam J$300 they never got) or aborts (and the food is lost). The diagram's WF13 has nowhere to start.
- **Fix:** explicit collection step (§7.5).

### PAY-H8 — COD orders cannot be refunded, credited or disputed for money — **High**
- **Evidence:** `orderRefund.ts:64-75` requires a completed `payments.transactions` row. Auto rules R1 and R6 call it and silently fall through to manual review.
- **Fix:** customer wallet (WF13) as the refund rail for cash, plus a bank-transfer refund option.

### PAY-M1 — Abandoned unpaid orders live forever — **Medium**
Live: 3 orders `placed` / `pending` with expired intents. They pollute analytics, the customer's Orders list and idempotency mappings. **Fix:** a sweeper voids `awaiting_payment` orders after intent expiry + grace, and notifies the customer.

### PAY-M2 — Auto-refund rules are blunt and abusable — **Medium**
R6 refunds **50% of the order total** for "missing items + photo", regardless of which items. R1 refunds the full total including the tip. Nothing limits how often a customer can trigger them. **Fix:** item-level missing-item claims (refund = item price + proportional GCT); a per-customer auto-refund budget (count and J$ per 30 days); risk score gating (§7.8).

### PAY-M3 — Admin dispute UX is free text — **Medium**
`FinancePage.tsx:88-112`. The status is typed by hand ("open | investigating | resolved | refunded | denied"), there is no evidence panel, and nothing shows who funds the refund. **Fix:** the Dispute Workbench (§8.4).

### PAY-M4 — Schema hygiene in `payments.*` — **Medium**
Amounts are `numeric` major units (Layer A′ uses `bigint` minor units). Statuses are free text with no CHECK. `merchant_payouts.merchant_id` has no FK. There are no append-only guards. **Fix:** new ledger tables use minor units, CHECK enums, FKs with `ON DELETE RESTRICT`, and append-only triggers. Leave `payments.*` as provider-facing records.

### PAY-M5 — No card-on-file — **Medium** (blocks WF5 and WF13 "charge card on file")
The saved-cards UI implies tokenization that doesn't exist. **Fix:** decide the provider first (go-live gate). Until then, debt recovery happens at the **next checkout**, not by background charge.

### PAY-M6 — No risk controls — **Medium** (High once COD is on at scale)
See §3.9 and §7.8.

### PAY-L1 — Payment go-live gate unsigned — **Low** (process)
`docs/roam-rush-payment-golive-gate.md`. Fold its eight items into Phase 0 and Phase 5 of §10.

---

## 7. Target architecture — tailored to Roam Rush

### 7.1 Principles (taken from what already worked in this codebase)

1. **One door per money fact.** Every money movement posts through one SQL function. There are no direct table writes (the Layer A′ lesson; the Fleet `ledger.entries` lesson of ~12 writer doors).
2. **Make broken states unrepresentable.** Use CHECK constraints for balanced journals, sign rules, generated columns for derived flags, and FKs with RESTRICT.
3. **Refuse before the irreversible step.** Validate everything before calling WiPay or posting.
4. **The merchant leg is never residual.** Reverse splits compute each party's share directly.
5. **A new fee lands in every place it must.** Extend the four-places rule to a fifth: the reverse split.
6. **Keep separations that CI enforces.** COD stays Roam↔courier (Layer A′); Fleet only observes.
7. **Don't add an eighth engine.** The Rush Money Ledger *replaces* the scattered Rush money stores as the authority. `payments.*` stays as the provider record; `ledger.entries` becomes a projection of it.
8. **Policy is data, versioned.** Store the cancellation matrix, fault funding, fees and caps in the pricing profile with a version stamp on each order (`pricing_profile_version` already exists).

### 7.2 The Rush Money Ledger (the diagram's "Shared Ledger Engine")

**Double-entry, minor units, append-only.** Every business event is a **journal** of two or more **postings** that sum to zero.

**Chart of accounts:**

| Account | Type | Meaning | Diagram equivalent |
|---|---|---|---|
| `gateway_clearing:wipay` | asset | Captured card money not yet settled by WiPay to Roam's bank | "Escrow" |
| `order_clearing:{order}` | liability | Customer money held for an order until settlement | "Holds funds in escrow" |
| `merchant_payable:{merchant}` | liability | Roam owes merchant | Merchant ledger (+) |
| `merchant_receivable:{merchant}` | asset | Merchant owes Roam (fault debits exceeding payable, fees) | Merchant ledger (−) |
| `courier_earnings:{courier}` | liability | Roam owes courier (digital earnings, compensation, return fees, reimbursements) | Driver ledger (+), float reimbursement |
| `courier_remittance:{courier}` | asset | Courier owes Roam (COD). **This is Layer A′**, kept as is | Driver remittance ledger |
| `courier_cash_earned:{courier}` | memo/contra | Courier share retained from COD cash (earned + already received) | — |
| `customer_wallet:{customer}` | liability (+) / asset (−) | Credit owed to customer / customer debt | Customer ledger |
| `platform_revenue:{component}` | revenue | service, commission, delivery-platform, small-order, cancel fees | Credit Roam Rush |
| `platform_cost:{kind}` | expense | delivery subsidy, peak pay, loss absorption, write-offs | Platform loss absorption |
| `marketing_goodwill` | expense | goodwill credits with a budget | WF11 marketing budget |
| `gct_output_payable` | liability | GCT collected | — |
| `refunds_in_flight` | liability | Refund submitted to provider, not yet confirmed | — |
| `chargeback_reserve` | liability/contra | Disputed funds pulled by the bank | WF8 |
| `payouts_in_flight` | liability | Payout batch sent, not confirmed | WF12 |
| `bank:operating` | asset | Roam bank | — |

**How it relates to what exists:**
- **Layer A′ stays as is.** `courier_remittance:{courier}` *is* `delivery.courier_remittance_accounts`. The ledger journal and the remittance event share a **correlation id**, written in one transaction. That preserves Layer A′'s CI separation and its trusted invariants.
- `payments.transactions` / `refunds` / `payouts` remain provider-facing records. Each successful provider event posts exactly one journal (idempotency key = provider object id).
- `ledger.entries` dual-write (`dualWriteDash.ts`) becomes a **projection from journals**, not a parallel computation, so the platform-wide unified ledger stays fed without forking.
- `fleet.trips` projection (Rush → Fleet) keeps reading courier earnings, now from `courier_earnings` postings.

**The single mutation function**, modelled on `apply_remittance_event`:

```
rush_money.post_journal(
  p_idempotency_key text,          -- deterministic, e.g. 'capture:v1:{provider_txn_id}'
  p_event_type text,               -- capture | settle_order | refund_succeeded | cancel_settle | ...
  p_order_id uuid, p_correlation_id uuid,
  p_lines jsonb,                   -- [{account, party_id, amount_minor, component}]
  p_actor_id uuid, p_actor_type text, p_reason text, p_evidence jsonb,
  p_policy_version text
) returns rush_money.journals
```
1. Replay → return the original.
2. Assert Σ amount_minor = 0, components valid, and sign rules per account type.
3. Lock touched party balances `FOR UPDATE` in a deterministic order (no deadlocks).
4. Refuse overdraws where an account forbids them (for example `customer_wallet` debt beyond the cap without an override).
5. Insert the journal + lines, update balances, return.

### 7.3 Order Money State Machine (WF6's "State Machine" lane)

Keep `orders.status` for kitchen and delivery. Add `orders.money_state` with a server-only transition table and one function `rush_money.transition(order, to_state, event)`.

```
CARD:   awaiting_payment ─capture→ captured ─settle(on delivered)→ settled
           │ expire                  │ refund(partial)→ partially_refunded ─…→ refunded
           ▼                         │ cancel(matrix)→ cancel_settled
        voided                       └ chargeback→ disputed → (won → settled | lost → charged_back)
COD:    awaiting_collection ─collected(full)→ collected → settled
                             ─collected(short)→ short_collected (customer debt posted) → settled
                             ─collection_failed→ failed_delivery (matrix)
WALLET+CARD: wallet portion reserved at checkout; released on void/cancel
```

**Rules:**
- A capture on any state other than `awaiting_payment` triggers an automatic duplicate-capture refund. This closes PAY-C2.
- **Settlement happens at delivery**, not capture. `settle_order` posts merchant payable, courier earnings and platform revenue out of `order_clearing`. Cancellations before settlement never credited anyone, so there is nothing to claw back.
- Every cancel path calls `cancelOrder()`, which reads the **stage** from `orders.status` and the **fault** from actor + reason + evidence, then evaluates the matrix (§7.4), then posts one journal and one refund request. This closes PAY-C1.

### 7.4 Cancellation, refund and fault-funding matrix (policy as data)

**Stages** (from `orders.status` plus timestamps):

| Stage | Order status at cancel |
|---|---|
| S1 Pre-accept | `placed` |
| S2a Accepted, not started | `accepted` |
| S2b In preparation | `preparing`, `ready`, `assigned` (no pickup) |
| S3 Post-pickup | `picked_up` |
| S4 Post-delivery | `delivered`, `completed` → dispute only |

**Fault:** customer · merchant · courier · platform · external (weather, unsafe) · undetermined.

**Recommended default policy** (all J$ amounts and % configurable; *italics* = owner decision, see §11):

| Scenario | Customer gets back | Merchant receives | Courier receives | Platform |
|---|---|---|---|---|
| S1 any actor | 100% | 0 | 0 | 0 |
| S2a customer cancels | 100% (keep today's generous rule) | 0 | 50% delivery share if assigned (existing `courierCancelCompensation`), platform-funded | absorbs courier comp |
| S2b customer cancels | Total − *cancel fee* (= merchant-net of food + courier comp + *fixed fee J$X*) | merchant-net of food | 50% (or 100% if at merchant) delivery share | keeps *fixed fee* |
| S2/S3 merchant cancels / rejects | 100% | 0 (and *rejection fee* after N in 30 days) | delivery share if assigned, **merchant-funded** if merchant fault | — |
| S2 courier problem (vehicle, accident) pre-pickup | **No cancel: redispatch** | — | 0 for that courier | — |
| S3 courier problem post-pickup | 100% | merchant-net (food was made) | 0 (+ *safety exception* if accident) | absorbs |
| S3 customer unreachable (protocol validated) | Card: 0 (*or refund food? decision*). COD: **wallet debt** for delivery + service (+ *food?*) | merchant-net | full delivery share + *return fee* if returned | absorbs only unrecoverable |
| S3 customer unreachable, protocol **not** validated | 100% | merchant-net | 0 + review | absorbs |
| Platform fault (app/GPS) | 100% + *goodwill credit* (marketing budget) | merchant-net | full delivery share | absorbs |
| S4 missing/wrong item, merchant fault | item price + its GCT (wallet instant or card) | − item merchant-net | unchanged (tip untouched) | forgoes commission on item |
| S4 never arrived, courier fault proven | 100% | merchant-net | − delivery share, tip reversed, strike per policy | absorbs remainder |
| S4 quality | goodwill credit per policy | unchanged (or merchant-funded if repeated) | unchanged | marketing budget |

**The reverse split** computes component lines from the order's stored fee fields (the same fields `computeDashCaptureSplit` reads). Each line is then assigned to a funding party by this table. The journal is balanced by construction. **Tips are never reversed unless fault = courier.** GCT reverses proportionally on each component refunded.

### 7.5 Workflow implementations, tailored

#### WF1 hardened card flow (Phase 0–1)
- `complete_payment_intent` SQL function: lock the intent, assert order money_state, assert the amount, insert the transaction (unique), post the `capture` journal (Dr gateway_clearing / Cr order_clearing), and move to `captured`, all in one transaction.
- Webhook: verify the provider hash or secret, re-query status, pin the field contract. The customer return page only polls (already true).
- Intent expiry: an expired intent can no longer complete. A late success auto-refunds.
- Sweeper: void `awaiting_payment` orders 45 min after the last intent expires.
- Settlement at `delivered`: one `settle_order` journal.

#### WF3 COD, made explicit (Phase 3)
1. **Pre-dispatch:** offer the order only to couriers whose `remaining_headroom = pause_threshold − remittance_balance ≥ order remit amount`. This fixes diagram exception 1 *before* dispatch, not after.
2. **At the door:** the courier app shows **Collect J$2,500**. The courier enters the amount received. The app computes change due ("Give back J$500"). Branches:
   - **Full** → Layer A′ `collected` (as today) + journal.
   - **Overpaid, no change** → the courier records "Kept J$X change for customer". Post customer wallet credit X and Layer A′ collected (remit + X) with the same correlation id. The courier owes the extra to Roam and the customer gets credit. This is diagram WF3 #2.
   - **Short** → amount entered < due. Post customer wallet **debt** of the shortfall (WF13). Layer A′ collects only what was received (merchant still paid in full by Roam; platform carries the receivable on the customer).
   - **Refused / no cash** → go to the failed-delivery flow with fault = customer.
3. Every branch requires a photo or customer confirmation above a threshold (risk-configurable).

#### WF6 cancellation (Phase 2)
- `cancelOrder()` service (§7.3) + matrix (§7.4).
- **Customer cancel UX:** before confirming, show the exact refund and fee from a dry-run endpoint `GET /orders/:id/cancel-quote`.
- Merchant reject: requires a reason. The customer is refunded 100% automatically; the merchant sees the consequence ("This counts toward your rejection rate").

#### WF7 failed delivery (Phase 2)
1. The courier taps **"Can't deliver"**. The app runs the protocol: in-app call/SMS buttons log `contact_attempt` events; a visible wait timer (policy 5 min); the app checks the geofence.
2. Only when the protocol is satisfied (or ops overrides) does the courier get **"Mark undeliverable"**, with a required photo.
3. Server validates (GPS within N m of drop-off for ≥ wait time, ≥ 2 contact attempts). Outcome: `validated` or `needs_review`.
4. Disposition rule: return to merchant if `return_eligible` (merchant flag + distance) else dispose. The courier gets navigation back if returning.
5. Matrix posts the journal: customer outcome by fault, merchant-net to merchant, courier delivery share + return fee.

#### WF8 chargebacks (Phase 5)
- **Chargeback Desk** with manual intake (WiPay notice): order lookup, reason code, amount, **response deadline**, status.
- On intake: Dr `chargeback_reserve` / Cr `gateway_clearing` (funds pulled).
- **Evidence pack auto-assembled:** GPS trail, delivery photo, order events timeline, chat, customer account age, prior orders with the same card/device. Export as PDF for WiPay.
- Decision accept/fight. Outcome won → reverse the reserve. Lost → **liability shifting** by the §7.4 fault table: merchant fault → merchant receivable; courier fault (proven) → courier deduction with appeal; else platform loss.
- Metrics: chargeback count and ratio per month vs WiPay's threshold; alert at 50% of threshold.

#### WF9 internal cash disputes (Phase 3/6), on top of Layer A′
- **Courier self-report remittance (Layer A′ Q5):** "I paid J$X via Lynk, ref ___ + screenshot" → `courier_remittance_settlements.status='pending_confirmation'` → admin confirms → `settled` event. This removes the paused-courier dead end.
- **Dispute intake** from customer ("I paid cash, courier says I didn't") or courier ("deduction is wrong") creates a Trust & Safety case linked to the order, the remittance events and the wallet postings.
- Freeze semantics: **hold the specific amount** (a `held` posting) rather than freezing the whole account. Couriers keep working and getting paid for undisputed work. This is fairer than the diagram's account-wide freeze and better for churn.
- Adjudication posts a correcting journal (reversal + new posting), never edits.

#### WF11 fee disputes (Phase 2/6)
- Customers dispute cancel fees or failed-delivery charges from the order screen. Auto-check against the evidence the matrix used (timestamps, protocol validation). If evidence says glitch → auto-refund fee + goodwill credit (budget-capped).
- Merchant rejection-fee and courier penalty appeals go through the same case system.

#### WF12 payout disputes (Phase 4)
- Requires the payout engine. Each payout line links to the journals it pays. Merchants and couriers dispute a **line**, not a vague total.
- Bank account changes are held for 48–72 h with notification to the old contact (anti-takeover). A failed or returned payout reverses `payouts_in_flight` back to payable and holds it until the account is updated.
- Overpayment recovery = a negative adjustment on the next batch (never a silent offset).

#### WF13 customer wallet (Phase 3): **build this early**
- `customer_wallet:{customer}` balance (minor units, signed). Positive = credit; negative = debt.
- **Credits:** refunds for cash orders, no-change overpayments, goodwill, optional instant refunds for card orders ("Get J$X credit now, or refund to card in 3–5 days").
- **Debt:** COD short payment, customer-fault COD failed delivery.
- Rules:
  - Debt > 0 → COD disabled (server-enforced at order placement).
  - Checkout shows a **"Previous balance J$300"** line. Debt is captured with the next card payment as a separate component, not GCT-able again.
  - Credit auto-applies (with toggle).
  - Debt older than 90 days → T&S review → write-off (posted to `platform_cost:bad_debt`) → collections referral only after legal review.
- Linked-account detection (phone, hashed device id, card fingerprint where the provider gives one) creates a **review case**. Debt transfer needs human approval.

#### Master dashboards → Admin "Money Ops" console (§8.4)

### 7.6 Payout engine (Phase 4)

- **Periods:** system-defined (weekly, Monday–Sunday, Jamaica time). Batches are created by a cron job, never by a party.
- **Merchant payout** = merchant_payable balance for settled journals ≤ period end − merchant_receivable offsets (fault adjustments, rejection fees) − reserve (new merchants: hold X% for N weeks; chargeback reserve).
- **Courier payout** = courier_earnings balance (delivery shares on card orders, compensation, return fees, reimbursements, peak) − approved deductions. **COD-retained shares are posted as already received in cash** (`courier_cash_earned`), so they are never paid twice (closes PAY-H4). **Netting COD remittance against payouts** (Layer A′ Q1): if approved, do it as an explicit `payout_offset` settlement that writes one event in each ledger with a shared correlation id. That is the method Layer A′ already reserved.
- **Maker-checker:** the batch is prepared by the system, reviewed by finance, approved by a second person, then exported (bank file / WiPay disbursement) and marked paid on bank confirmation.
- **Period lock:** once a batch is approved, its journals are locked. Later corrections go to the next period as adjustments.
- **Statements:** a PDF/CSV per party per batch, listing every order and adjustment line.
- KYC: bank account holder name must match the legal name; changes trigger a hold.

### 7.7 Payment provider layer (go-live gate)

- `payments/providers/wipay.ts` adapter: `createIntent`, `verifyWebhook`, `queryStatus`, `refund`, `parseSettlementReport`.
- A provider-agnostic `payments` core so a provider switch doesn't rewrite checkout (gate item 3).
- **Daily reconciliation job** (gate item 6): WiPay settlement report ↔ `payments.transactions` ↔ `gateway_clearing` postings. Mismatches go to an exceptions queue that must sit at zero (the same discipline as `courier_remittance_exceptions`).
- Explicit env enum `live | sandbox` that fails closed (gate item 5).
- Refund idempotency key sent to the provider.

### 7.8 Risk & fraud layer (Phase 6, with early pieces in Phases 2–3)

**Signals** (`risk.signals`, append-only): account age, orders count, COD history, short-collection count, refund count and J$ (30d), issue reports (30d), cancellations after prep, failed deliveries (customer fault), device/phone/card links to other accounts, chargebacks, courier short-remittance history, courier abort rate, protocol-validation failure rate, merchant rejection rate, merchant forgotten-order rate.

**Scores** (recomputed nightly + on event): `customer_trust`, `courier_trust`, `merchant_reliability`. Store the score, its inputs and its version.

**Controls** (automatic and reversible):

| Control | Trigger example | Effect |
|---|---|---|
| COD eligibility | debt > 0, or < 3 completed card orders, or trust < X | COD hidden at checkout |
| COD order cap | trust band | max J$ per COD order |
| Auto-refund budget | > 2 auto refunds or > J$5,000 in 30d | route to manual review |
| Issue velocity | > N issues / 7d | manual review + evidence required |
| Courier COD headroom | trust band | lower pause threshold (Layer A′ per-courier override already exists) |
| Merchant rejection rate | > X% / 30d | warning → rejection fee → listing demotion |
| Linked-account | new account shares device/phone with banned or indebted account | review case |

**Human-only actions:** permanent bans, debt transfer between accounts, collections referral, any external reporting. The diagram's "shadow ban" should be a **documented restriction** with a reason code, not hidden behaviour: it is hard to defend in a dispute and erodes trust when discovered.

### 7.9 Observability and controls

Invariant views, all of which must return zero rows (alerts in `finance-recon`):
- `v_rush_cancelled_paid_unrefunded`: catches PAY-C1 regressions.
- `v_rush_multi_capture_orders`: catches PAY-C2.
- `v_rush_journal_imbalance`: Σ lines ≠ 0 (should be impossible by CHECK).
- `v_rush_order_clearing_stale`: order_clearing ≠ 0 for orders terminal > 24 h.
- `v_rush_refunds_stuck`: `submitted` > 48 h.
- `v_rush_wallet_drift`: wallet balance ≠ Σ postings.
- `v_rush_provider_recon_exceptions`: unresolved.
- Layer A′ views (existing).

Remember the lesson from Layer A′: **an alert that always fires kills the ones that matter.** Each view must be expected-empty.

---

## 8. UI/UX recommendations per app

Design rule across all four apps: **money is shown from the viewer's side, in words, with a reason and a timeline.** No bare negative numbers. Every money line links to the order or event that caused it.

### 8.1 Roam Rush (customer, `apps/dash-customer`)

| Screen | Change |
|---|---|
| **Checkout** (`CheckoutPage.tsx`) | Payment selector: Card (WiPay) · Cash (only if eligible; otherwise greyed out with "Cash unavailable — you have a J$300 balance to settle" or "Cash unlocks after 3 card orders") · Wallet credit toggle ("Use J$800 credit"). Show a **"Previous balance"** line when in debt. One "Pay J$X" button; no silent extras |
| **Payment pending** (`PaymentPendingBanner.tsx`, `PaymentCallbackPage.tsx`) | "We're confirming your payment — don't pay again" with live polling (gate item 4). If the order is already paid, never show a pay button. If the order was voided: "This payment window expired. Nothing was charged" (or "…was charged; refund started" when a late capture auto-refunds) |
| **Cancel order** | Bottom sheet with a **cancel quote**: "Restaurant has started preparing. If you cancel you'll get **J$1,850** back. J$772 covers food already made and your courier." Buttons: Keep order / Cancel and get J$1,850 |
| **Order details** | A **Money timeline**: Paid J$2,622 (card •••• 4242) → Refund J$1,850 started → Refund completed (or "Credited to wallet instantly") |
| **Report issue** (`ReportIssuePage.tsx`) | Item-level picker for missing/wrong items (checkboxes with prices), photo required, **choice of refund rail** for card orders: "Instant wallet credit" or "Back to card (3–5 business days)". Show the decision immediately for auto-resolved claims |
| **Wallet (new)** | Balance card ("Roam Rush credit J$800" / "Balance due J$300 — Pay now"), history with reasons, a pay-now flow for debt, and a bank-transfer refund request for cash-order refunds above a threshold |
| **Receipts** | A receipt per money event (payment, refund, credit), with GCT breakdown. Important for Jamaica GCT compliance |
| **My Issues** (`MyIssuesPage.tsx`) | Case status with an SLA ("We'll reply by 5 pm today"), evidence you submitted, outcome and money impact |

### 8.2 Roam Rush Courier (`apps/dash-courier`)

| Screen | Change |
|---|---|
| **Offer card** | For COD orders: "Collect J$2,500 cash" badge + "Your cash limit: J$6,200 left". Offers that exceed headroom are not shown (explain this on the Remittance card) |
| **Collect cash (new, at drop-off)** | Big amount due; keypad for amount received; auto change calculator; quick-tap bills (J$5,000 / J$2,000 / J$1,000); branches "Customer paid less", "Customer refused", "I don't have change". Confirmation summary before "Complete delivery" |
| **Can't deliver (replaces abort for customer issues)** (`ReportIssuePage.tsx`) | Guided protocol: ① Call customer (logged) ② Text customer (logged) ③ Wait timer 5:00 with progress ④ Photo of location ⑤ "Mark undeliverable" unlocks. Then "Return to restaurant" navigation or "Dispose" instructions. Show earnings protection: "You'll still earn J$450 + J$150 return fee" |
| **Vehicle/accident before pickup** | "Hand off this order" (redispatch) instead of cancel. Customer and merchant unaffected |
| **Earnings** (`EarningsPage.tsx`) | Ledger-backed: delivery pay, tips, peak, compensation, return fees, reimbursements, deductions (with "Why?" and **Appeal** buttons). Separate "Cash you kept from COD orders" line so couriers understand why their payout is lower than their gross |
| **Payouts** (`PayoutHistoryPage.tsx`) | Remove "close period". Show the system batch: "Week of Sep 29 · J$18,450 · Approved · Paid Oct 7", with a downloadable statement |
| **Remittance** (`RemittanceCard.tsx`, `RemittancePausedScreen.tsx`) | Add **"I've paid"**: amount, method (Lynk / bank / cash office), reference, screenshot → pending confirmation, with "Typically confirmed within 2 hours". The paused screen shows exactly what unlocks them ("Pay J$3,800 to go back online") |
| **Deductions & disputes (new)** | List of deductions with evidence and a 7-day appeal window |

### 8.3 Roam Rush Partner (`apps/dash-merchant`)

| Screen | Change |
|---|---|
| **Earnings** (`EarningsPage.tsx`) | Read from the merchant ledger: **Available to pay out**, **Pending (delivered, not yet in a batch)**, **Held (disputes/reserve)**. Lines: Order sales (net of commission), Refund adjustments (only merchant-funded portions), Fault adjustments (with "View dispute"), Wasted-food compensation (failed deliveries), Payouts. Fixes PAY-H6 |
| **Payout detail** (`PayoutDetailView.tsx`) | Statement with every order line and adjustment; status timeline Prepared → Approved → Sent → Paid; bank reference; Dispute a line |
| **Reject order** (`RejectOrderSheet.tsx`) | Show the consequence before confirming: "Customer will be fully refunded. Rejections this month: 2 of 5 before a fee applies." Offer "Mark item unavailable / suggest substitute" as an alternative (substitution exists in the backend) |
| **Disputes inbox** (`MerchantIssuesInbox.tsx`) | For every fault adjustment: claim, customer evidence, amount charged **to you** (merchant-net, not the customer total), 72 h to respond with prep photos / notes |
| **Order detail (failed delivery)** | "Courier is returning this order — expected 12:40" or "Order disposed. You've been paid J$1,530 for this order" |

### 8.4 Roam Rush Admin (`packages/dash-admin`): the "Money Ops" console

Replace Finance's three free-form tabs with these screens:

1. **Order Money Inspector** (inside `orders/OrderDetailPage.tsx`): money_state, every journal with lines (who funded what), provider objects (intent, transaction, refunds), Layer A′ events, wallet postings and invariant badges. "Refund / Credit / Adjust" actions open the composer.
2. **Refund & Adjustment Composer:** pick scenario → the matrix pre-fills component lines and funding parties → editable within policy → preview of each party's impact → reason + evidence required → maker-checker above threshold (e.g. J$10,000).
3. **Dispute Workbench** (replaces the prompt dialog): queue with SLA timers. The case view shows the evidence panel (map with GPS trail, wait time, contact attempts, photos, chat, event timeline, account risk cards for customer, courier and merchant). Decision buttons are typed (fault × outcome) and post through the composer.
4. **Chargeback Desk** (§7.5 WF8): intake form, deadline countdown, evidence pack export, outcome logging, monthly ratio gauge.
5. **Payout Batches:** weekly batches per party type, exceptions (missing bank details, negative balance, held), approve (second approver), export, mark paid with bank reference, returned-payout handling.
6. **Wallets Explorer:** customer, courier and merchant accounts. Search by phone or order; balances in words; history; manual adjustment through the composer only.
7. **Remittance Desk** (exists): add a **Pending confirmations** tab for courier self-reports.
8. **Risk Queue:** cases raised by rules (linked accounts, velocity, abuse). Actions: restrict, require evidence, lift, ban (two-person approval), with reason codes.
9. **Reconciliation:** WiPay recon status, invariant views (§7.9) with zero-expected counters, exceptions drill-down.
10. **Policy:** versioned matrix, fees, caps and auto-refund budgets under Pricing (the same publish/version pattern as pricing profiles), with a diff view and effective date.

RBAC: reuse the existing Dash roles (`dash_ops` cannot move money; `dash_admin` / `platform_*` can). Add a `finance_approver` capability for second approval.

---

## 9. Data model sketches

These are design sketches, not migrations. Use minor units (`bigint`), CHECK enums, `ON DELETE RESTRICT`, and append-only triggers throughout.

### 9.1 Ledger core (`rush_money` schema)

```sql
CREATE TABLE rush_money.accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          text NOT NULL CHECK (kind IN ('gateway_clearing','order_clearing','merchant_payable',
                  'merchant_receivable','courier_earnings','courier_cash_earned','customer_wallet',
                  'platform_revenue','platform_cost','marketing_goodwill','gct_output_payable',
                  'refunds_in_flight','chargeback_reserve','payouts_in_flight','bank')),
  party_type    text CHECK (party_type IN ('customer','courier','merchant','order','platform')),
  party_id      uuid,
  component     text,                       -- e.g. platform_revenue:service_fee
  balance_minor bigint NOT NULL DEFAULT 0,
  currency      text NOT NULL DEFAULT 'JMD',
  UNIQUE (kind, party_type, party_id, component)
);

CREATE TABLE rush_money.journals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  event_type      text NOT NULL,            -- capture | settle_order | cancel_settle | refund_succeeded |
                                            -- wallet_credit | wallet_debt | cod_collected | payout_sent | ...
  order_id        uuid REFERENCES delivery.orders(id) ON DELETE RESTRICT,
  correlation_id  uuid,                     -- shared with Layer A′ event / provider object
  policy_version  text,
  reason          text,
  evidence        jsonb NOT NULL DEFAULT '{}',
  actor_id        uuid, actor_type text NOT NULL,
  reverses        uuid REFERENCES rush_money.journals(id),
  period_id       uuid,                     -- set when locked into a payout period
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rush_money.lines (
  journal_id   uuid NOT NULL REFERENCES rush_money.journals(id) ON DELETE RESTRICT,
  account_id   uuid NOT NULL REFERENCES rush_money.accounts(id) ON DELETE RESTRICT,
  component    text NOT NULL,               -- food | commission | delivery_courier | delivery_platform |
                                            -- service | small_order | processing | tip | peak | gct_food |
                                            -- gct_platform | cancel_fee | return_fee | goodwill | debt | ...
  amount_minor bigint NOT NULL CHECK (amount_minor <> 0),
  PRIMARY KEY (journal_id, account_id, component)
);
-- Deferred constraint trigger: SUM(amount_minor) per journal_id = 0.
-- Append-only trigger on journals + lines.
```

### 9.2 Example journals (J$, shown as major units for readability)

**Card order captured** (total 2,622):
`Dr gateway_clearing 2,622 / Cr order_clearing:{order} 2,622`

**Delivered → settle** (food 1,800, commission 270, delivery courier 450, delivery platform 50, service 150, tip 100, GCT 252 split per order fields — illustrative):
`Dr order_clearing 2,622 / Cr merchant_payable 1,530 / Cr courier_earnings 550 / Cr platform_revenue:commission 270 / Cr platform_revenue:service 150 / Cr platform_revenue:delivery 50 / Cr gct_output_payable 72` (sums to zero; real amounts come from `computeDashCaptureSplit`)

**COD short collection** (due 2,500, received 2,200): Layer A′ `collected` for the remit portion of 2,200 **plus** journal `Dr customer_wallet:{c} 300 (debt) / Cr order_clearing 300`, same correlation id.

**No-change overpayment** (courier kept 500 change owed): Layer A′ adjustment +500 owed by courier; journal `Dr courier_remittance 500 / Cr customer_wallet 500 (credit)`.

**Missing item, merchant fault** (item 600 + GCT 90; commission 15%): `Dr merchant_payable 510 / Dr platform_revenue:commission 90 / Dr gct_output_payable 90 / Cr refunds_in_flight 690` → on provider success `Dr refunds_in_flight 690 / Cr gateway_clearing 690` (or `Cr customer_wallet 690` for instant credit).

### 9.3 Supporting tables

- `delivery.orders` add: `money_state text CHECK (...)`, `cash_collected_minor bigint`, `cash_change_kept_minor bigint`, `failed_delivery_outcome text`, `cancel_stage text`, `fault text`, `policy_version text`.
- `delivery.delivery_attempts`: order, courier, attempt type (call/sms/knock), timestamp, GPS, wait seconds, photo.
- `rush_money.refund_requests`: lifecycle `requested → submitted → succeeded | failed`, provider id, idempotency key, attempt count. Replaces the "pending row counted as refunded" pattern.
- `rush_money.payout_periods`, `payout_batches`, `payout_lines` (line → journal ids), `payout_approvals` (maker, checker).
- `risk.signals`, `risk.scores`, `risk.cases`, `risk.restrictions` (reason code, expiry, actor).
- `support.chargebacks`: order, provider ref, reason code, amount, deadline, status, outcome, evidence_pack_url.
- `payments.transactions`: add `UNIQUE (intent_id)`, `UNIQUE (provider, provider_transaction_id)`.

---

## 10. Implementation roadmap (phased, gated)

Each phase ends with a **gate**: live checks that must pass before the next phase starts. Keep the habit from previous audits: characterisation tests first, verify by running real engines into real splits, gate on `tsc` (not vitest alone), and dry-run migrations before apply. A migration referencing a nonexistent column has shipped twice before with green unit tests.

### Phase 0 — Stop the bleeding (1–2 weeks)
- PAY-C1 interim: `v_rush_cancelled_paid_unrefunded` + daily alert. Route merchant, device, courier and courier-abort cancels through the existing refund orchestrator as a stop-gap.
- PAY-C2/C3: unique constraints (dedupe existing rows first; RD-2026-000001 and 000007 need a duplicate-capture refund decision), and `complete_payment_intent` SQL function with row lock + order-state assertion. Stop overwriting `payment_status` on cancelled/refunded orders.
- PAY-C4: amount assertion, status contract, provider status re-query.
- PAY-C5: refund retry by id; ledger post only on success; validate amount; schedule the drain.
- PAY-H3 quick win: pre-pickup vehicle/accident → redispatch instead of cancel.
- PAY-M1: abandoned-order sweeper.
- **Gate:** these return zero rows in production:
  ```sql
  -- paid + cancelled without a completed refund covering the capture
  select o.id from delivery.orders o
  where o.status='cancelled' and o.payment_status='paid'
    and coalesce((select sum(amount) from payments.refunds r where r.order_id=o.id and r.status='completed'),0)
        < (select coalesce(sum(amount),0) from payments.transactions t where t.order_id=o.id and t.status='completed');
  -- more than one completed capture per order
  select order_id from payments.transactions where status='completed' group by 1 having count(*)>1;
  -- refunds pending > 48h
  select id from payments.refunds where status='pending' and created_at < now()-interval '48 hours';
  ```

### Phase 1 — Ledger foundation + money state machine (3–4 weeks)
- `rush_money` schema, `post_journal`, chart of accounts, invariant views.
- `money_state` + transition function; capture and settle journals; `ledger.entries` projection from journals (retire the computation in `dualWriteDash`).
- Backfill journals for historical orders (small dataset) and tie out against `payments.transactions`.
- **Gate:** Σ journal lines = 0 everywhere; order_clearing = 0 for all settled/cancelled orders; per-order tie-out = 100%.

### Phase 2 — Cancellation matrix, failed delivery, fault-correct refunds (3–4 weeks)
- `cancelOrder()` service; all six paths migrated; `cancel-quote` endpoint.
- Reverse split + fault-funding matrix (versioned policy).
- WF7 protocol (courier app) + server validation + disposition.
- Fix PAY-H1 (merchant-net fault adjustments), PAY-H2 (component refunds, proportional GCT, tip protection), PAY-M2 (item-level missing items).
- UI: customer cancel quote, courier Can't-deliver flow, merchant reject consequences, admin composer.
- **Gate:** scenario test suite: every row of §7.4 × card/COD produces the expected journals, with each party's balance asserted. Zero cancelled+paid+unrefunded.

### Phase 3 — Customer wallet + explicit COD (3 weeks)
- `customer_wallet` accounts, credit/debt rules, checkout integration, COD eligibility.
- Courier Collect-cash screen (full / short / overpaid / refused) + Layer A′ correlation.
- Pre-dispatch COD headroom filter.
- Courier remittance self-report (Layer A′ Q5).
- COD refunds via wallet or bank-transfer request.
- **Gate:** `v_rush_wallet_drift` empty; every COD order has `cash_collected_minor`; every short collection has a matching wallet debt.

### Phase 4 — Payout engine (3–4 weeks; requires a payout rail decision)
- Periods, batches, maker-checker, statements, period locks; merchant/courier earnings screens read the ledger (fixes PAY-H4/H5/H6); remove courier close-period.
- Netting decision (Q1) implemented as `payout_offset` if approved.
- WF12 payout dispute lines; bank change holds; returned payouts.
- **Gate:** one dry-run batch tied to the cent against ledger balances; two-person approval enforced in the database.

### Phase 5 — Provider hardening + Chargeback Desk (2–3 weeks)
- Provider adapter, webhook signature, daily WiPay reconciliation, env enum, refund idempotency; sign the go-live gate.
- Chargeback Desk, reserve postings, evidence pack, liability shifting, ratio monitor.
- **Gate:** 14 consecutive days of zero recon exceptions in sandbox/live soft-launch.

### Phase 6 — Risk & fraud engine (ongoing; 3 weeks for v1)
- Signals, scores, controls table (§7.8), Risk Queue, linked-account detection (with privacy notice update), abuse budgets, merchant/courier reliability scoring.
- **Gate:** each control has a reason code, an owner, an appeal path, and a false-positive review cadence.

### Phase 7 — Optional: wallet + card split tender
Only after Phase 3. Cash+card split (WF5/WF10) only with an explicit business case.

### Phase 8 — Conditional: cash-only merchants (WF2/4/14/15)
Only with a validated merchant segment, legal review of courier float, and a Lynk integration path. Build as `settlement_mode='cash_at_pickup'` on the Phase 1 ledger.

---

## 11. Decisions only you can make

| # | Decision | Recommendation |
|---|---|---|
| Q1 | Net courier COD remittance against earnings payouts? | Yes, as an explicit `payout_offset` with a statement line (big UX win), after Phase 4 |
| Q2 | Stage-2 cancel fee: fixed J$, % of food, or merchant-net only? | Merchant-net of food + courier comp + small fixed fee (J$150–250); preview always shown |
| Q3 | Customer-fault failed delivery on a card order: refund food or not? | No refund of food; refund nothing else either; but cap at 2 per 90 days before review |
| Q4 | Pay merchants for COD orders before the courier remits? | Yes (Roam carries courier credit risk; that's what the pause threshold is for). Keeps merchants whole, matches WF3 |
| Q5 | Instant wallet credit as a default refund option? | Offer it as a choice, never force it; legal check on stored value first (§5.2) |
| Q6 | Wallet credit expiry? | No expiry on refund credit; goodwill/promo credit may expire (disclosed) |
| Q7 | Customer debt threshold for blocking all ordering vs just COD? | Debt blocks COD immediately; all ordering only if debt > J$5,000 or > 30 days |
| Q8 | Merchant rejection fee? | Warning first; fee after 5 rejections in 30 days; waived for verified stock-outs with substitution offered |
| Q9 | Courier deductions for proven fault? | Only for proven fault with evidence, capped per week, always appealable; needs courier ToS update |
| Q10 | Build cash-only merchants at all? | Not now (§5.1) |
| Q11 | Payout rail | WiPay disbursement vs bank file vs Lynk business; decide before Phase 4 |
| Q12 | Auto-dispute J$ caps and per-customer budgets | Keep J$4,000 per claim; add 2 claims / J$5,000 per 30 days before manual review |
| Q13 | Legal review | Stored-value wallet, debt collection, device linking, courier deductions, chargeback ToS language. Book it before Phase 3 |

---

## Appendix A — Corrections to make in the draw.io file

1. WF6: rewire Stage 1 → Full Reversal; Stage 2 → Partial Reversal; Stage 3 → No Reversal; Stage 4 → Dispute Outcome (new node).
2. WF7: change "Credit Merchant (Full Amount)" to "Credit Merchant (Food net of commission)"; align rule 5 (COD unreachable) with WF13 (customer debt).
3. WF1 exception 1: change "after pickup → partial refund" to match WF6 Stage 3.
4. WF3: "Digital Payout to Merchant (From Platform Revenue)" → "(From order merchant-due; Roam fronts if before remittance)".
5. WF8: replace "Freeze Merchant & Driver Payouts for this Order ID" with "Post chargeback reserve; shift liability via next-payout adjustment".
6. WF10 rule 1: add the prerequisite "courier recorded actual cash collected".
7. WF12: replace "ACH Trace (R01–R09)" with "Payout trace (rail-specific return reason)".
8. WF8 #5: "1% Visa/Mastercard threshold" → "Acquirer (WiPay) / network threshold".
9. Everywhere: "Escrow" → "Order Clearing account"; "Auth & Capture" → "Capture (WiPay sale)".
10. Master Wallet Dashboard: model cross-ledger flows as journals, and add the Order Clearing, Platform Revenue and GCT accounts so the picture balances.
11. Add pages for: Payment intent lifecycle (expiry/void/late capture), Provider reconciliation, Payout batch lifecycle (maker-checker, lock), Risk controls.
12. Mark WF2, WF4, WF14 and WF15 (and the float parts of WF9/WF10) as "Future: cash-only merchant mode".

## Appendix B — File reference index

| Area | File |
|---|---|
| Card payments, webhook, refunds, saved methods | `supabase/functions/payments/index.ts` |
| Card split | `supabase/functions/_shared/dashMoneySplit.ts` |
| COD split | `packages/dash-pricing/src/codBalance.ts` |
| Order placement, customer cancel, issues | `supabase/functions/delivery/customerOrderRoutes.ts` |
| Order status state machine (merchant/device/courier) | `supabase/functions/delivery/index.ts` (`PUT /orders/:id/status`, ~1185–1490) |
| Merchant earnings | `supabase/functions/delivery/index.ts` (`GET /merchant/earnings`, ~2247) |
| Courier issues, earnings, payouts, cancel compensation | `supabase/functions/delivery/courierConsumerRoutes.ts` |
| Cancel compensation policy | `supabase/functions/_shared/courierCancelCompensation.ts` |
| Refund orchestrator | `supabase/functions/delivery/admin/orderRefund.ts` |
| Dispute engine / merchant debit / pending refunds | `supabase/functions/delivery/disputeResolution/{processDispute,merchantDebit,notifications}.ts` |
| Admin finance (payouts, adjustments, disputes) | `supabase/functions/delivery/admin/financeRoutes.ts` |
| Admin cancel | `supabase/functions/delivery/admin/orderRoutes.ts` |
| COD collection hook | `supabase/functions/delivery/courierCashLedger.ts`, `delivery/remittance/collectOnDelivery.ts` |
| Layer A′ design | `docs/CASH_ARCHITECTURE_ONBOARDING.md` Parts 5, 11–34 |
| Ledger mirror | `supabase/functions/_shared/unifiedLedger/dualWriteDash.ts` |
| Payments schema | `supabase/migrations/20260511150000_payments_schema.sql` |
| Go-live gate | `docs/roam-rush-payment-golive-gate.md` |
| Admin finance UI | `packages/dash-admin/src/pages/finance/FinancePage.tsx` |
| Customer checkout / payment | `apps/dash-customer/src/pages/{CheckoutPage,PaymentCallbackPage,PaymentMethodsPage,ReportIssuePage}.tsx` |
| Courier issue / earnings / payouts / remittance | `apps/dash-courier/src/pages/{delivery/ReportIssuePage,earnings/EarningsPage,profile/PayoutHistoryPage,remittance/*}.tsx` |
| Merchant earnings / reject | `apps/dash-merchant/src/pages/EarningsPage.tsx`, `src/components/RejectOrderSheet.tsx` |

## Appendix C — Live evidence (read-only queries, production, 2026-10-03)

Most rows are soft-launch / WiPay demo-mode data. The **code paths** that produced them are the production code paths.

| Fact | Value |
|---|---|
| Card (wipay) orders | 10 total: 3 `paid/cancelled`, 2 `refund_pending/cancelled`, 1 `paid/completed`, 1 `paid/delivered`, 3 `pending/placed` (abandoned) |
| COD orders | 0 (cash gated off) |
| `payments.transactions` completed | 9 for 7 paid orders |
| Orders with 2 captures | RD-2026-000001 (one live + one demo capture, 2 intents), RD-2026-000007 (2 intents) → PAY-C2/C3 |
| Cancelled by courier, still paid, refunded J$0 | RD-2026-000009 (J$2,002.16) → PAY-C1 |
| Refunds | 4, all `pending` → PAY-C5 |
| Scheduled cron jobs touching refunds/disputes/payouts/remittance | 0 |
| Merchant payouts / courier payouts | 0 / 0 |
| Order disputes | 0 |
| Courier remittance accounts | 1 (zero balance) |

---

*End of audit. Nothing in the codebase was modified. This file is the only artefact produced.*
