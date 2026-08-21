# Roam Rush — In-App Chat System Audit

**Scope:** `@roam/dash-customer` (Roam Rush), `@roam/dash-courier` (Roam Rush Courier), `@roam/dash-merchant` (Roam Rush Partner), and `@roam/rush-command` (internal ops/dispatch).
**Type:** Read-only architecture audit. No application code was changed to produce this document.
**Author framing:** Written as a systems architecture review, using this codebase's existing conventions (Supabase Postgres + RLS + Realtime + Hono edge functions, monorepo shared packages) plus patterns borrowed from DoorDash/Uber Eats where they materially improve on what's here.

---

## 1. Executive summary

Rush currently has **no chat system** in any of the three apps. However, the codebase already contains a working, production-grade precedent for exactly this problem: `packages/ride-chat` + `supabase/functions/rides/rideChat.ts`, built for the rides-passenger/driver vertical. That implementation already solves the hard parts — windowed access, three-party (booker/passenger/driver) role resolution, RLS-backed reads, server-validated writes, realtime with polling fallback, and audit logging. It is the right template to clone and adapt, not reinvent.

The core design problem you named — "we don't want them talking to each other at times when they shouldn't" — is a **state-machine access control problem**, not a chat-UI problem. The chat UI is the easy 20%. The window logic, enforced identically on the client (for UX) and the server (for security), is the 80%.

Rush has **three pairwise relationships**, not one:

| Pair | Needed for | Precedent pattern |
|---|---|---|
| Customer ↔ Courier | "Where are you," gate codes, handoff instructions | Closest analog to `ride-chat` |
| Customer ↔ Merchant | Item substitutions, prep delays, order accuracy | New — no direct precedent in repo |
| Merchant ↔ Courier | "I'm outside," "order isn't ready yet," wrong pickup | New — no direct precedent in repo |

Plus a **fourth, non-pairwise surface**: `rush-command` needs read (and in some cases write-in, i.e. support takeover) access into any active thread for disputes, safety escalations, and support tickets — this is the DoorDash/Uber Eats "support can see the chat" pattern, and it's easy to miss if you design only for the three consumer-facing apps.

Recommendation in one sentence: **one `order_messages` table, keyed by `order_id` and `sender_role ∈ {customer, merchant, courier, support}`, with per-pair visibility rules and per-pair open/close windows derived from `OrderStatus`, writes enforced exclusively in a shared edge-function module, reads via RLS + Realtime, and a shared `@roam/rush-chat` package used by all three consumer apps** — mirroring `ride-chat` almost exactly.

---

## 2. What already exists (and why it matters)

### 2.1 The `ride-chat` precedent

- **Data:** `rides.ride_messages` table — `id, ride_request_id, sender_user_id, sender_role, body, created_at`. RLS restricts `SELECT` to ride participants only ([supabase/migrations/20260603120000_ride_messages.sql](supabase/migrations/20260603120000_ride_messages.sql)). There is **no client-facing INSERT policy** — all writes go through the edge function using the service role. This is a deliberate and correct pattern: **read access is delegated to Postgres RLS (cheap, realtime-compatible), write access is delegated to application code (because window/role logic is too complex to express safely in a `WITH CHECK` clause).**
- **Window enforcement, server-side:** [supabase/functions/rides/rideChat.ts](supabase/functions/rides/rideChat.ts) — `RIDE_CHAT_ACTIVE_STATUSES = [driver_assigned, driver_en_route_pickup, driver_arrived_pickup, on_trip]`. Every GET and POST re-checks `assertRideChatAccess()`, which checks (a) participant identity via `canChatOnRide()` and (b) current ride status against the whitelist — **on every request**, not just at chat-open time. This is important: a ride can transition out of the active window while the chat sheet is still open on a stale client, and the next send attempt is still blocked with `chat_not_available`.
- **Window enforcement, client-side (UX only):** [packages/ride-chat/src/RideChatHost.tsx](packages/ride-chat/src/RideChatHost.tsx) calls `isRideChatEnabled(rideStatus)` purely to decide whether to show the chat entry point / toast a "Messaging is only available during an active trip" message. It is **not** trusted as the access boundary — it just prevents a bad UX of opening a chat sheet that then fails to send.
- **Delivery mechanism:** Supabase Realtime `postgres_changes` subscription on `INSERT`, scoped by `ride_request_id`, with a **polling fallback** (2.5s while chat is open, 5s while backgrounded) if the realtime channel errors out or times out ([packages/ride-chat/src/useRideChat.ts](packages/ride-chat/src/useRideChat.ts)). This dual-path approach is correct and should be reused as-is — realtime alone is not reliable enough for a paid product surface.
- **Unread tracking:** last-read message ID stored in `localStorage`, keyed by ride ID, compared against the participant's own messages filtered out.
- **Multi-party role resolution:** `getRideParticipantRole()` maps a `user_id` to `driver | booker | passenger | none`, and handles the "delegated booking" case (someone books a ride for someone else — a shadow-booker who isn't the rider). This is a good model for Rush's own delegated-order case (see §4).
- **Audit trail:** every send calls `deps.audit(rideId, userId, "ride_message_sent", {...})` — there's already an audit-log convention in this codebase to hook into rather than invent a new one.
- **A real gap in the precedent, worth naming so Rush doesn't inherit it:** `sendRideNotification` is imported into `rideChat.ts` but is **not called** on message insert — there's no push notification when a new chat message arrives while the recipient's app is backgrounded. For rides this is a minor gap (trips are short, app is usually foregrounded). **For Rush it would not be a minor gap** — a courier is very unlikely to have Rush Courier foregrounded while driving, and delivery windows (20–60 min) are much longer than the realtime-connection lifetime of a backgrounded tab/app. Rush's chat design should close this gap from day one (see §6.4).

### 2.2 What Rush-specific infrastructure already exists to build on

- **Order lifecycle:** `OrderStatus` in [packages/types/src/delivery.ts:304](packages/types/src/delivery.ts#L304) — `placed → accepted → preparing → ready → assigned → picked_up → in_transit → delivered → completed`, plus `cancelled`. This is the state machine every chat window should be derived from.
- **Edge function surface:** `supabase/functions/delivery/*` already has per-role route modules — `customerOrderRoutes.ts`, `merchantRestaurantRoutes.ts`, `courierConsumerRoutes.ts`, etc. An `orderChat.ts` module in this same folder, registered into all three route sets, is the natural home — exactly parallel to how `rideChat.ts` lives inside `supabase/functions/rides/`.
- **Push infra already built:** `supabase/functions/notifications/index.ts` has a real multi-channel push pipeline (`web | fcm | apns`, via `sendFcmPush`) with a subscriptions table keyed by channel/endpoint. Rush chat should call into this on every message insert rather than building a parallel notification path.
- **Ops/dispatch app:** `@roam/rush-command` exists as a separate app — this is your support/ops console and the natural home for a "view any active order's chat thread" tool.
- **Merchant-specific push:** a separate `merchant-push` edge function exists, suggesting merchant devices are already treated as a distinct push audience — relevant because merchants are often on a tablet/POS device rather than a phone, which affects notification UX (see §6.4).

---

## 3. The full communication matrix (including scenarios you didn't list)

You named three pairs. Auditing the order lifecycle and the app set surfaces **five more scenarios** worth deciding on explicitly, rather than discovering them mid-implementation.

### 3.1 The three pairs you identified

| Pair | Why they talk | DoorDash/Uber Eats equivalent |
|---|---|---|
| Customer ↔ Courier | Delivery handoff: gate codes, "leave at door," "which building," "I'm the one in the blue jacket" | Yes — opens near pickup, closes shortly after drop-off |
| Customer ↔ Merchant | Order accuracy: "can you substitute X," "how much longer," missing/wrong items | Partial — DoorDash routes most of this through support/refund flow, not live chat, once dispatched |
| Merchant ↔ Courier | Pickup logistics: "order isn't ready," "I'm here," "this isn't the courier I dispatched to" | Yes — this exists in both DoorDash and Uber Eats merchant apps |

### 3.2 Scenarios worth deciding on now (missed if not addressed)

1. **Pre-assignment gap for Customer↔Courier.** Between `placed` and `assigned` there is no courier yet — obviously no chat is possible, but the UI needs to *explain* this state ("a courier will be assigned soon") rather than just hiding the entry point, matching the `RideChatHost` pattern of a toast instead of a silently missing button.
2. **Delegated / gift orders.** A customer can place an order for delivery to someone else (a different name at the door, a gift, a "deliver to my parent" scenario) — this is structurally identical to the ride-chat "delegated booking / shadow booker" case already solved in `rideAccess.ts`. If Rush orders support a delivery recipient who differs from the payer/account holder, you need the same three-role split (`booker`/`recipient`/`courier`) rather than assuming the account holder is always the one who should be chatting with the courier at the door.
3. **Post-delivery grace window.** DoorDash and Uber Eats keep chat open for a short grace period (roughly 30–60 minutes, or until the order is rated/closed) after `delivered`, because "you forgot my drink" or "this is the wrong order" issues surface *after* handoff, not during it. If the window closes exactly at `delivered`, you will generate support tickets for things that should have been a 10-second chat message. Recommend a `delivered + N minutes` trailing window before hard-close, separate for Customer↔Courier (short, ~15–30 min, since the courier has moved on) and Customer↔Merchant (longer, since merchant-side issues like refund requests take more back-and-forth).
4. **Cancelled-order teardown.** When an order is cancelled mid-flight (customer cancels after courier is en route, merchant cancels after accepting, courier cancels/reassigns), all chat windows for that order need a defined close point too — and the *reason* for cancellation should probably be visible in the closed thread (was it the merchant, courier, customer, or system that cancelled) so support doesn't have to reconstruct it from logs.
5. **Reassignment / courier swap.** If a courier cancels or is reassigned mid-delivery (unassigned → new courier assigned), the *old* courier's access to that order's chat must be revoked immediately, and the *new* courier should not see the old courier's message history with the customer (privacy: the previous courier's messages, e.g. "I'm 2 minutes away," shouldn't leak to the new one, and the new courier shouldn't inherit a relationship the customer had with someone else). This argues for either (a) scoping messages to `(order_id, courier_user_id)` rather than just `order_id` for the courier-facing thread, or (b) hard-severing and visibly marking "courier reassigned" in the thread. Decide explicitly — this is the kind of bug that's invisible in testing (single courier, happy path) and shows up as a real privacy complaint in production.
6. **Merchant↔Courier window is easy to get backwards.** The natural instinct is "open at `assigned`, close at `picked_up`" — but in practice couriers message merchants *after* `picked_up` too ("you gave me the wrong bag," "missing item 3"), and merchants sometimes need to reach a courier who already left ("come back, forgot the drinks"). Recommend keeping Merchant↔Courier open through a short window past `picked_up` as well, not strictly closed at handoff.
7. **Batched/multi-order couriers.** `DeliveryOrder.courierId` is a single field per order (confirmed in `packages/types/src/delivery.ts`), meaning today's model is one courier per order rather than a courier carrying multiple orders at once. If batched/multi-stop delivery is on the Rush roadmap (very likely at scale — this is standard in DoorDash/Uber Eats), the chat data model needs to key threads by `(order_id, courier_id)` pairs from day one, because a courier with 3 stacked orders needs 3 *separate* customer threads, not one thread that leaks cross-order context. Worth confirming with product/roadmap before finalizing the schema, since retrofitting this later is a migration, not a config change.
8. **Support/ops visibility (`rush-command`).** Not one of your three pairs, but structurally required: when a customer disputes a delivery, files a safety report, or a courier reports an unsafe merchant location, support needs to **read** the full thread (all parties, no RLS restriction) and in some flows needs to **inject a message as "Roam Support"** into an existing thread (a fourth `sender_role`). This is the DoorDash/Uber Eats "support joins the chat" pattern. Needs its own RLS policy (`rush-command` service role or a support-role claim, not per-participant `auth.uid()` matching) and its own audit trail, since support access to private conversations is itself a sensitive action worth logging.
9. **Safety / SOS escalation.** If Rush has (or plans) an in-trip safety button (common on the courier side especially — solo delivery, unfamiliar addresses, night hours), the chat system is the natural place to hang a "report a problem with this order" affordance that opens a `support` thread pre-populated with order context, distinct from the normal customer/courier/merchant channels. Worth deciding whether this is v1 or a fast-follow, but it should be designed for now rather than bolted on.
10. **Abuse, rate-limiting, and moderation.** None of these exist yet even for ride-chat (no visible rate limit, no profanity/PII filter, no block/report-user affordance in the reviewed code). For Rush this is more exposed than rides because it's three-party and higher message volume (item substitutions can turn into multi-message negotiations). At minimum: per-user send rate limit at the edge-function layer, a "report this message" action that notifies `rush-command`, and — borrowing directly from DoorDash/Uber Eats — **canned/quick-reply templates** ("Leave at door," "I'm outside," "5 minutes away," "Item unavailable, substitute?") that reduce free-text volume, reduce PII exposure risk, and are trivially translatable.
11. **Phone number / real contact masking.** Neither this audit nor the ride-chat precedent shows a proxy-calling layer — chat is text-only. DoorDash and Uber Eats both mask real phone numbers behind a relay number/extension specifically so customer, courier, and merchant phone numbers are never exchanged directly (safety and privacy, and it's what stops the relationship from continuing outside the app after the order closes). If Rush ever adds in-app calling, or if real phone numbers currently get exchanged via chat text, this needs its own design track — not just chat text, but a masked-calling layer. Worth flagging even though it's adjacent to "chat" strictly speaking, because if the answer is "customers will just text their phone number," you don't actually need most of this window-close design.
12. **Data retention / deletion.** Delivery chat messages containing addresses, gate codes, and building access info are more sensitive at rest than casual ride-chat banter. Needs an explicit retention policy (e.g., purge/anonymize N days after order completion, excluding threads flagged for an active dispute) — not addressed anywhere in the current `ride_messages` design either, so this is a gap to fix in the new system rather than copy forward.
13. **Language.** If Rush operates in multi-language markets, canned quick-replies (see #10) are also your cheapest localization path for the highest-frequency messages, versus building real-time translation for free text.

---

## 4. Recommended data model

One shared table, not three, mirroring the `ride_messages` shape but with a `pair` discriminator so RLS and the UI can distinguish which relationship a message belongs to without needing three separate tables/edge-function modules to keep in sync.

```
order_messages
  id                uuid primary key
  order_id          uuid references delivery.orders(id) on delete cascade
  pair              text check (pair in ('customer_courier','customer_merchant','merchant_courier','support'))
  sender_user_id    uuid references auth.users(id)
  sender_role       text check (sender_role in ('customer','merchant','courier','support'))
  body              text check (char_length(body) between 1 and 500)
  quick_reply_key   text null          -- set when sent via canned template, for analytics/localization
  created_at        timestamptz default now()

  index (order_id, pair, created_at)
```

Why one table with a `pair` column instead of three tables:
- A single edge-function module (`orderChat.ts`, parallel to `rideChat.ts`) can own all window logic in one place, keyed off `OrderStatus`, instead of three modules that will drift out of sync over time.
- `rush-command` support access is one RLS policy against one table instead of three.
- If/when batching (item 7 above) requires `(order_id, courier_id)` scoping, that's one column addition, not a schema fork across three tables.

RLS mirrors the `ride_messages` pattern exactly: `SELECT` allowed for the order's `customer_user_id`, `merchant_user_id` (or authorized staff — see `merchantTeam.ts`, which already exists for multi-staff merchant accounts), and `assigned_courier_user_id`, each **filtered further by `pair`** so a courier can't `SELECT` rows from the `customer_merchant` pair even though they're a participant on the order. No client-facing `INSERT` policy — same as ride-chat, writes go through the edge function only, because the window check can't be safely expressed as a `WITH CHECK`.

---

## 5. Window design, mapped to `OrderStatus`

This is the direct answer to "the proper window for each to have access to talk to each other," expressed as concrete status ranges so it's implementable as a lookup table (exactly like `RIDE_CHAT_ACTIVE_STATUSES`), not prose.

| Pair | Opens at | Closes at | Grace window after close | Rationale |
|---|---|---|---|---|
| Customer ↔ Merchant | `accepted` (merchant has acknowledged the order exists) | `delivered` | +30–60 min, or until rated/closed | Substitution/accuracy conversations can legitimately continue after handoff; closing at `accepted` would block "how much longer" questions during `preparing` |
| Merchant ↔ Courier | `assigned` | `picked_up` | +10–15 min | Covers "I'm here" / "not ready yet" before pickup and "you forgot an item" immediately after — see §3.2 item 6 |
| Customer ↔ Courier | `assigned` | `delivered` | +15–30 min | Direct analog of `RIDE_CHAT_ACTIVE_STATUSES`; grace window covers "you left it at the wrong door" |
| Any pair | — | `cancelled` (from any state) | 0, immediate close, thread remains readable | Matches ride-chat's implicit behavior — cancelled isn't in the active-status whitelist so chat stops accepting new messages, but existing messages stay visible for dispute resolution |
| Support ↔ Any | Opens on report/dispute creation | Closes on ticket resolution (ops-controlled, not status-derived) | N/A — support-controlled | Independent of order status entirely; this is the one window that isn't derived from `OrderStatus` |

Enforcement should be **identical in shape to `assertRideChatAccess()`**: a pure function `assertOrderChatAccess(order, pair, userId, now)` that checks participant identity, pair-specific status range (including the grace window, which means comparing `now()` against `delivered_at + grace_minutes` rather than just checking current `status`), called on **every** GET and POST — not cached from chat-open time, for the same stale-client reason called out in §2.1.

---

## 6. Cross-cutting architecture recommendations

### 6.1 Enforcement layering (defense in depth, same as ride-chat)
1. **Client (`@roam/rush-chat`, new shared package mirroring `ride-chat`):** UX gating only — hide/disable the entry point, show an explanatory toast. Never trusted as the security boundary.
2. **Edge function (source of truth):** re-validates participant identity + status/grace-window on every request, not just at open time.
3. **RLS (defense in depth for reads):** restricts `SELECT` to actual participants of the specific `pair`, independent of the edge function, so a bug in the edge function's read path can't leak another order's or another pair's messages via direct Realtime/PostgREST access.

### 6.2 Shared package structure
Extract `packages/rush-chat`, parallel to `packages/ride-chat`, used by all three consumer apps (`dash-customer`, `dash-courier`, `dash-merchant`) rather than each app rebuilding its own chat sheet. Given three apps instead of two, and three-plus roles instead of two, this reuse matters more here than it did for ride-chat (which only had two consumer apps to share between). Same `useXChat` hook shape, same realtime-with-polling-fallback strategy, same unread-tracking approach — genuinely reusable, only the `pair`/`sender_role` vocabulary changes.

### 6.3 Edge function structure
`supabase/functions/delivery/orderChat.ts`, registered into the existing `customerOrderRoutes.ts`, `merchantRestaurantRoutes.ts`/`merchantVenueOps.ts`, and `courierConsumerRoutes.ts` route sets — same shape as how `rideChat.ts` is a standalone module consumed by the `rides` function's route table. Keeps the window logic in exactly one place regardless of which app is calling it.

### 6.4 Close the push-notification gap from §2.1
Every message insert should call into the existing `notifications` edge function pipeline (`sendFcmPush` / web push / APNs), not just rely on an open Realtime channel. This matters more for Rush than it did for rides: couriers are driving (app very likely backgrounded), and merchants are often on a fixed tablet/POS device rather than carrying a phone — both of which already have a distinct push path in this codebase (`merchant-push`) worth reusing rather than duplicating.

### 6.5 `rush-command` (ops) access
- A distinct RLS policy branch (service-role or a `support` JWT claim) granting `SELECT` across all pairs for a given order, independent of the participant-matching policy.
- A distinct, explicitly logged path for support to **write** into a thread as `sender_role = 'support'` — this should never reuse the customer/merchant/courier auth path, and every support-initiated read of a private thread (not just writes) is worth audit-logging given it's access to a private conversation between other parties.

### 6.6 Reuse the existing audit-log convention
Every send (`order_message_sent`) and every support read of another party's thread (`order_chat_support_viewed`) should call the same `audit()` convention already used by `rideChat.ts`, rather than introducing a new logging path.

### 6.7 Rate limiting, canned replies, and masking
Treat these as v1 requirements, not fast-follows, given Rush's higher party-count and message volume relative to ride-chat:
- Per-user send rate limit enforced in the edge function.
- Canned/quick-reply templates per pair (also solves localization cheaply — §3.2 item 13).
- If real phone numbers are otherwise exchanged in delivery instructions today, evaluate a proxy-calling layer alongside chat — chat alone doesn't stop the underlying privacy/safety problem if the phone number just gets typed into a text box instead.

### 6.8 Retention
Define and implement a retention/anonymization policy for `order_messages` (e.g., N days post-completion, excluding disputed/flagged threads) as part of the initial rollout — this is a gap in the ride-chat precedent worth not carrying forward.

---

## 7. Suggested rollout sequencing

1. **Customer ↔ Courier** first — closest precedent (`ride-chat`), highest immediate value (handoff friction is the most common complaint DoorDash/Uber Eats chat solves), lowest design risk.
2. **Merchant ↔ Courier** second — smaller party count, well-understood window (pickup logistics), and validates the shared-package/edge-function structure works for a second pair before adding the third.
3. **Customer ↔ Merchant** third — highest message-volume risk (item substitution negotiations can sprawl) and the one most likely to need canned replies/rate-limiting from day one; sequencing it last means those controls exist before this pair goes live.
4. **`rush-command` support visibility** should land alongside pair #1, not after all three — you want dispute/safety visibility as soon as any chat exists in production, not retrofitted once complaints start.
5. Feature-flag each pair independently (this codebase already leans heavily on per-feature flags — e.g. the toll system's `disputeRefundTripSyncEnabled` pattern) so each relationship can be enabled/disabled/rolled back without touching the others.

---

## 8. Open decisions for product/you (not answerable from the codebase alone)

- Is delegated/gift delivery (recipient ≠ account holder) a real Rush scenario today? Determines whether the three-role split from §3.2 item 2 is needed at launch or can wait.
- Is batched/multi-order courier assignment on the near-term roadmap? Determines whether `order_messages` needs `(order_id, courier_id)` scoping now versus later (§3.2 item 7) — this is the one decision that's expensive to change after the fact.
- Grace-window lengths in §5 are reasonable defaults, not measured — worth confirming against actual support-ticket data if it exists (how often do post-delivery issues get reported, and how long after `delivered`?).
- Whether in-app masked calling is in scope alongside chat, given §3.2 item 11.
- Who owns support-side chat takeover in `rush-command` from a permissions standpoint — is this all support staff, or a restricted "trust & safety" tier?
