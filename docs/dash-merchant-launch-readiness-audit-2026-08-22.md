# Roam Rush Partner — First-Restaurant Launch Readiness Audit

**Date:** 2026-08-22
**Question this answers:** "Is there anything needed before I let my first real restaurant sign up and we launch?"
**Scope:** the full merchant journey — signup → verification → payouts setup → menu build → go-live → first live order → get paid.
**Type:** Read-only audit. No application code was changed.
**Method:** four parallel deep-dives (onboarding/verification, live order flow, menu/payouts/store availability, cross-cutting production readiness) traced end-to-end through UI, edge functions, and migrations, then cross-checked against the launch-tracking docs already in this repo (`docs/dash-launch-ops-secrets-checklist.md`, `docs/dash-launch-compliance-checklist.md`, `docs/dash-launch-phase4-gono-go.md`) and the prior `docs/dash-merchant-production-readiness-audit.md` (2026-07-29). Where that prior audit's claims were checked against current code and found stale, that's called out explicitly below — don't re-fix what's already fixed.

---

## Bottom line

**Do not onboard a real restaurant yet.** Not because the app is unfinished — the core experience (menu, live orders, dispatch, hours/pause, analytics) is genuinely well-built and mostly real, not stubbed. The reason is narrower and sharper: **the path from "restaurant signs up" to "restaurant actually gets paid" has a hole in it that nothing in the product stops a restaurant from falling into.** A merchant can complete onboarding, get admin-approved, flip the go-live toggle, and start taking real paid orders — all without ever finishing Stripe Connect payout setup. Nothing blocks it, nothing warns the owner, and nothing alerts Roam. Money comes in from customers with no verified path back out to the restaurant. For a first real launch, that single gap is worth stopping for on its own.

Everything else below is real but secondary to that one. Your team has already written the checklists that track most of this (`docs/dash-launch-ops-secrets-checklist.md`, `docs/dash-launch-phase4-gono-go.md`, `docs/dash-launch-compliance-checklist.md`) — as of this audit, **every box on all three is still unchecked**. This document explains, with code-level evidence, exactly which of those unchecked boxes represent real gaps vs. which just need a verification pass, and adds a handful of things those checklists don't currently cover.

---

## Part 1 — Hard blockers (fix or verify before restaurant #1)

### 1. A restaurant can go live and take paid orders with payouts never configured

This is the headline finding. Three independent facts combine into a real hole:

- **Stripe Connect onboarding status is never checked anywhere except the Connect routes themselves.** `stripeConnectRoutes.ts` correctly implements Express account creation and correctly surfaces `charges_enabled`/`payouts_enabled` from Stripe (`supabase/functions/delivery/stripeConnectRoutes.ts:83-88`) — but grep across the rest of `supabase/functions/delivery` shows those fields are referenced nowhere else. No order-placement check, no admin-approval requirement, no go-live gate.
- **The go-live gate explicitly excludes payout completeness.** `missingSetupLabels` in `supabase/functions/delivery/admin/merchantSetupProgress.ts:141-152` has a literal `if (key === "bankComplete") return false;`, and the client-side `canGoLive`/`handleGoLive` in `apps/dash-merchant/src/pages/OnboardingCompletePage.tsx:63-65` checks profile/documents/hours/menu completeness only — no Stripe or bank check.
- **A stricter check exists in the codebase but isn't wired up.** `isVerticalGoLiveReady` in `apps/dash-merchant/src/lib/go-live.ts:81-90` does include `c.bankComplete` in its readiness calculation — but it's dead code, never imported or called anywhere in `apps/dash-merchant/src`. Someone on the team already identified this exact problem and wrote the fix; it just never got connected to the actual go-live button.

Net effect: a restaurant owner who skips or abandons Stripe Connect onboarding (an easy thing to do mid-signup — it's a separate step, not enforced inline) can still reach "accepting orders" and take real customer payments. Your own launch-ops checklist already flags related items as unchecked (`docs/dash-launch-ops-secrets-checklist.md:26-30` — sandbox transfer test, legal/KYC sign-off) but doesn't specifically call out that go-live isn't gated on this at all.

**Fix shape:** wire `isVerticalGoLiveReady`'s bank/Connect check into `canGoLive` in `OnboardingCompletePage.tsx`, and add a server-side check (not just client) at the `PUT /merchants/:id` route that flips `is_accepting_orders` — the same defense-in-depth pattern (client gate + server gate) already used correctly elsewhere in this codebase (see the Team Members and chat-window audits).

### 2. No restaurant agreement / terms-of-service acceptance in onboarding

`packages/business-config/src/legalUrls.ts` defines `termsOfServiceUrl`/`privacyPolicyUrl`, and the courier app (`dash-courier`) wires this into its onboarding (`SignUpPage.tsx`, `DocumentsPage.tsx`). The merchant onboarding wizard has no equivalent — no "terms"/"agreement" reference anywhere in `apps/dash-merchant/src/components/onboarding/**`, and `partnerOnboarding.ts` has no `tos_accepted` field. A restaurant can complete all 7 onboarding steps and reach `AccountPendingPage` without ever agreeing to a partner/merchant agreement.

This isn't just a nice-to-have before a real business relationship starts — it's the thing that would normally define commission rate, liability for order errors, and dispute handling in writing. Worth having legal confirm whether verbal/offline agreement is currently substituting for this, because nothing in the product does.

### 3. Push notifications for a backgrounded/asleep device are not proven to fire

The client-side infrastructure is real: a service worker handles push events (`apps/dash-merchant/src/sw.ts:59-97`) and `merchant-push` edge function can send web-push/FCM/APNs. But **nothing in the order-placement code path calls it.** `POST /orders` has zero reference to `merchant-push` or `notifications`. The intended trigger is a **Supabase Dashboard Database Webhook** (`delivery.orders` INSERT → `merchant-push`) — which is infrastructure-as-clicking, not infrastructure-as-code. It isn't in any migration, and `docs/dash-launch-ops-secrets-checklist.md:16` has this as an unchecked box today.

In practice: if the restaurant's tablet/phone has the dashboard open and foregrounded, realtime + the in-app alert sound works (confirmed real, see Part 3). If the screen is asleep or the tab is backgrounded, the fallback poll is **disabled while the tab is hidden** (`apps/dash-merchant/src/lib/merchant-orders-sync-policy.ts:14,26` — `TAB_HIDDEN_POLL_MS = false`), so push is the only remaining path to wake them up — and that path depends on a manual dashboard click that may or may not have been done on your actual production project. **This needs a literal smoke test before launch**: put the tablet to sleep, place a test order, confirm a notification arrives. Don't take this on faith from the code.

### 4. No auto-reject/timeout if the merchant never responds to an order

`NewOrderAlertView.tsx` shows a 270-second countdown to the merchant, but it's cosmetic — nothing calls an `onExpire` handler, and there's no server-side cron auto-cancelling stale orders (confirmed by searching `supabase/functions/delivery` and `supabase/functions/matching` — only ride-hailing has an equivalent timeout policy). If a restaurant's tablet is off, or someone forgets to check it, **a paid order sits in `placed` forever** with no auto-cancel and no customer-facing fallback or refund.

For a first restaurant this is a real risk precisely because it's early days — the owner is still learning the workflow and is the most likely person to miss a notification. Recommend at minimum a manual ops alert (something in `rush-command`) for orders stuck in `placed` past N minutes, even if a full auto-cancel-and-refund flow isn't ready for day one.

### 5. No automatic refund when the merchant cancels a paid order after accepting

Customer-initiated cancellation before prep auto-queues a refund (`customerOrderRoutes.ts:652-686` — this direction is solid). The reverse isn't: merchant-initiated cancellation post-accept only clears courier compensation server-side (`supabase/functions/delivery/index.ts:1038-1042`); the actual refund requires a **manual** admin action via `admin/orderRefund.ts`. For a first restaurant still learning menu availability and prep timing, merchant-side cancellations after accept are a near-certainty in week one — each one currently requires a human at Roam to notice and manually refund, or the customer is out the money with no automatic recourse.

### 6. Refunds and partial refunds on delivered orders are invisible to the merchant

Refunds are admin-only (no merchant-facing trigger, which is reasonable), but merchant-side visibility only covers orders that reach `status: 'cancelled'` (`DashboardPage.tsx:380-391`, `index.ts:1926-1945`). The actual refund path for a delivered order sets `payment_status: 'refunded'/'partially_refunded'` while `status` stays `'delivered'` — and there are zero references to `payment_status` or refund state anywhere in `apps/dash-merchant/src/components/order-detail` or the orders views. A restaurant can have money clawed back from a completed order with no explanation ever surfaced in their dashboard. This will read as "money randomly missing" to a new partner and generate a support call every time it happens.

### 7. No global kill switch if launch day goes wrong

`dash-merchant` has no `maintenanceMode` equivalent to what `apps/fleet` already has (`apps/fleet/src/App.tsx:205-218`, backed by `packages/platform-settings`) — grep across `apps/dash-merchant` for `maintenanceMode` returns nothing. The only lever that exists is the per-merchant `is_accepting_orders` toggle, which is scoped to one restaurant, not a platform-wide "pause everything" switch. For a first launch specifically — the highest-risk moment, by definition — there's no single button to pull if something goes badly wrong across the board (a bad deploy, a payment integration failure, etc.) short of pulling it merchant-by-merchant or pushing a hotfix.

### 8. Dispatch re-dispatch cron — status unverified

Your own checklist (`docs/dash-launch-ops-secrets-checklist.md:32-35`) requires a scheduled job calling `POST /courier/offers/redispatch` every 1–2 minutes so a `ready` order that gets no courier response doesn't strand. Courier matching itself is real and functional (`courierConsumerRoutes.ts:181-245`, proximity-radius dispatch, explicitly labeled "soft-launch" in a code comment at line 220) — but whether the redispatch cron is actually scheduled in production is an infra question this audit can't answer from source code. This is exactly the kind of unchecked checklist box worth confirming before a real order can get stuck with "ready, no courier, forever."

---

## Part 2 — Should verify soon, not necessarily day-one blockers

- **Stripe Terminal / in-person POS card payment has no real reader integration** — confirmed still true (the prior 2026-07-29 audit flagged this and it's independently corroborated by today's findings: `VITE_STRIPE_TERMINAL_SIMULATED` must be unset in prod per the ops checklist, and the UI doesn't check the backend's `mockMode` flag). **This only matters if restaurant #1 plans to use in-person/counter card payment through Rush's POS.** If the launch is online-order-only (customer pays in the Rush Partner customer app, not card-present at the counter), this is not a blocker — just don't enable that surface for the pilot restaurant.
- **No merchant-side item substitution / price-adjustment flow.** Only a courier-initiated substitution flow exists (`courierConsumerRoutes.ts:1047-1106`), built for grocery shopping-in-store. A restaurant that's out of an ingredient mid-shift has no way to flag it except cancelling the whole order outright (compounding gap #5 above). Fine for a soft launch if you brief the pilot restaurant to just call/cancel, but worth a fast-follow.
- **Team Members feature** — already covered in the separate [Team Members audit](dash-merchant/TEAM_MEMBERS_AUDIT.md). Nothing there blocks a single-owner-operator restaurant from launching; the issues found (role-hint copy bug, an unreachable permission-validation mismatch, optimistic form reset) only matter once the restaurant starts adding staff.
- **Admin approval checklist is manual, with a bypass.** `POST /admin/merchants/:id/status` requires checkbox-style manual verification (`id_verified`, `business_proof_verified`, etc.) unless an admin passes `force: true`, which skips the checklist entirely for anyone with `dash_admin`/`platform` role (`merchantRoutes.ts:504-513`). For a first restaurant you're personally onboarding, this is probably fine — just be aware `force` exists and don't let it become the default habit once you're approving restaurant #20 at speed.
- **Owner access isn't gated by verification status the way team-member access is** (`merchantAuth.ts:47-57` vs. `:68`) — an owner can hit orders/menu/payout endpoints while still `pending`. Low risk for a single hand-picked pilot restaurant; worth tightening before self-serve signup opens to the public.
- **Bank-account `is_verified` field is decorative** — set `false` on insert, never set `true` by any code path. Not dangerous on its own (Stripe Connect is the actual payout rail — see blocker #1), but if anyone on the team is trusting this field as a signal, it's not one.
- **Payout execution is a manual, admin-triggered ledger entry, not an automated transfer.** `POST /admin/finance/payouts` creates a bookkeeping row (`amount - fee = net_amount`, `status: pending`) — it does not itself call Stripe's transfer API. Your compliance checklist already says "no instant payout at launch" and a weekly manual schedule is expected (`docs/dash-launch-compliance-checklist.md:20`), so this may be intentional for a small pilot — just confirm someone owns actually running that process weekly, since nothing automated will do it.

---

## Part 3 — Corrections to the prior (2026-07-29) audit — don't re-fix these

The existing `docs/dash-merchant-production-readiness-audit.md` flagged three headline blockers. I checked all three against current code directly rather than trusting the old doc, since it's three weeks stale:

1. **"Payout creation targets a table that doesn't exist"** — **fixed.** `payments.merchant_payouts` exists (`supabase/migrations/20260511150000_payments_schema.sql`) and `admin/financeRoutes.ts` correctly targets it. Not a current issue.
2. **"ReadyOrderDetail shows a hardcoded fake courier identity with a permanently-disabled Confirm Pickup button"** — **fixed.** Current `apps/dash-merchant/src/components/order-detail/ReadyOrderDetail.tsx:28-34` pulls real fields (`order.courier_id`, `order.courier.display_name/vehicle_type/phone`) and the Confirm Pickup button is conditionally gated (`courierAssigned && checklistComplete && !isSubmitting`), not permanently disabled. Not a current issue.
3. **"In-store POS card payment has no real terminal integration"** — **still true**, see Part 2. This is the one surviving headline item from the prior audit.

Worth a general note: your team's own launch-tracking docs are good and the codebase is clearly under active iteration — two of three previously-flagged blockers were already fixed by the time of this audit. Treat any audit (including this one) as a snapshot, and re-verify against current code before acting on anything that isn't a same-day fix.

---

## Part 4 — What's genuinely solid (real reasons for confidence)

- **Live order alerting while the app is foregrounded is real**: Supabase Realtime subscription on order INSERT/UPDATE, sound + haptic + full-screen alert, with a 15s poll fallback if realtime drops (`useMerchantOrdersRealtime.ts`, `merchant-orders-sync-policy.ts`).
- **Order status progression and courier dispatch trigger correctly**: accept → preparing → ready automatically fans out courier offers (`index.ts:1049-1051`), and the dispatch logic is a real proximity-radius matcher, not a stub.
- **Store hours, holiday closures, and the one-tap pause toggle are enforced server-side**, not just cosmetic — `merchantOpenCheck.ts` blocks order placement against actual hours/pause state, and this is respected on the customer-browse side too.
- **Menu 86'ing (marking an item unavailable) is real and enforced at order placement** — a customer literally cannot order an item the restaurant has marked out.
- **Menu CRUD, categories, modifiers, and photo upload (with magic-byte content validation) are fully functional**, not placeholder UI.
- **Analytics/earnings dashboards compute from real order data**, not mocked or padded.
- **Error monitoring (Sentry) is wired up for dash-merchant** with the same setup as `rush-command` — assuming `VITE_SENTRY_DSN` is actually set in the production build (verify this specifically; it's a silent no-op if blank).
- **Document upload has real content-type/magic-byte validation and malware scanning** before storage.
- **A real, non-trivial Playwright e2e suite exists** (`e2e/rush-partner-ui-*.spec.ts`, ~15 files covering auth/orders/menu/hours/bank/earnings/team/pause/promotions) against a seeded test merchant — this isn't aspirational tooling, it's a real harness you can and should run as part of go/no-go.

---

## Recommended sequence before restaurant #1

1. **Fix or hand-verify blocker #1 (payout gate) first** — this is the one that risks real money changing hands with no way back to the restaurant. Either wire `isVerticalGoLiveReady`'s bank check into the real go-live gate, or manually confirm Stripe Connect is fully onboarded for this specific pilot restaurant before you personally flip them live.
2. **Run the smoke tests your own checklists already specify** — `docs/dash-launch-ops-secrets-checklist.md` (SMS, push, Terminal, Connect, redispatch cron, migrations) and the `docs/dash-launch-phase4-gono-go.md` go/no-go list — before this pilot, not after. Every box is currently unchecked; most of them are a single manual test, not an engineering task.
3. **Decide on #2 (ToS) and #4/#5 (order timeout / auto-refund) explicitly** — for a single hand-picked pilot restaurant you may reasonably choose to handle these manually/offline for now (a signed paper agreement, you personally watching the order queue) rather than building the automation before launch — but make that a conscious choice, not a gap you didn't know was there.
4. **Confirm the push-notification path with an actual sleep-the-tablet test** (#3) — this is the fastest, cheapest verification on this list and directly determines whether your pilot restaurant will miss orders.
5. **Get legal sign-off from `docs/dash-launch-compliance-checklist.md` moving** in parallel — money-transmission licensing questions have long lead times and shouldn't be discovered after you're already processing real payouts.
