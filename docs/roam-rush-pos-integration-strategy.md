# Roam Rush — POS Integration Strategy

**Date:** 2026-08-21
**Context:** Roam Rush Partner App currently runs the manual "tablet workflow." This doc captures the full discussion on what it would take to move to an automated, integrated order workflow — the options, what's already built, and what Jamaica's market specifically requires.

---

## 1. Where you are today: the tablet workflow

The Partner App (`apps/dash-merchant`) is architecturally identical to the DoorDash Order Manager / Uber Eats WebRD tablet model — just running as Roam's own PWA instead of a third-party one.

| Manual step | Where it lives in the code |
|---|---|
| Chime/alert on new order | [`partner-order-alert.ts`](../apps/dash-merchant/src/lib/partner-order-alert.ts) — plays a sound + haptic buzz |
| Manual accept, estimate prep time | [`OrderAcceptedSheet.tsx`](../apps/dash-merchant/src/components/OrderAcceptedSheet.tsx) / [`RejectOrderSheet.tsx`](../apps/dash-merchant/src/components/RejectOrderSheet.tsx) |
| Manual "86" an item | [`AvailabilityToggle.tsx`](../apps/dash-merchant/src/components/menu/AvailabilityToggle.tsx), [`PauseOrdersSheet.tsx`](../apps/dash-merchant/src/components/PauseOrdersSheet.tsx) |
| Order delivery to the tablet | [`merchant-orders-sync-policy.ts`](../apps/dash-merchant/src/lib/merchant-orders-sync-policy.ts) — Supabase realtime with a polling fallback |

There is no re-keying into a POS today because there's nothing to re-key into — orders live only in Roam's own order table, and staff act on them from the tablet screen. No printer integration, no external POS calls exist anywhere in the repo.

---

## 2. The three options

### Option 1 — Stay on the tablet workflow (status quo)
What you have now. Zero additional build. Fine as a baseline / fallback for any merchant tier you haven't built automation for yet.

### Option 2 — Integrate directly into the merchant's existing POS
Orders get pushed straight into whatever system the restaurant already runs (their existing register, kitchen printer, KDS) — no separate Roam tablet needed at all. This is what mature delivery platforms (DoorDash, Uber Eats) offer larger/established merchants.

**Nothing for this exists in the codebase yet** — no vendor SDKs, no OAuth flow, no menu-mapping layer.

### Option 3 — Roam Rush Command becomes the merchant's full POS
Instead of bridging to an external system, Roam **replaces** the merchant's register/KDS entirely. This path is **already substantially built** in `apps/rush-command` (a separate, further-along app from `dash-merchant`):

| Piece | File |
|---|---|
| Owner turns on POS/Kitchen/Bar/Expo/Drive-thru stations | [`OperationsHub.tsx`](../apps/rush-command/src/components/venue-ops/OperationsHub.tsx), [`StationToggles.tsx`](../apps/rush-command/src/components/venue-ops/StationToggles.tsx) |
| Kitchen ticket routes to the right station automatically | [`PrepStationsPanel.tsx`](../apps/rush-command/src/components/venue-ops/PrepStationsPanel.tsx) + `prep_station_id` routing in [`staff-ops-order-filters.ts`](../apps/dash-merchant/src/lib/staff-ops-order-filters.ts) |
| Register / cart / checkout | [`PosMenuPanel.tsx`](../apps/rush-command/src/components/restaurant-mgmt/pos/PosMenuPanel.tsx), [`PosActiveCart.tsx`](../apps/rush-command/src/components/restaurant-mgmt/pos/PosActiveCart.tsx) |
| Card-present payment | [`stripe-terminal.ts`](../apps/rush-command/src/lib/stripe-terminal.ts) + `@stripe/terminal-js` (physical Stripe reader hardware) |
| Multiple iPads become dedicated Kitchen/Bar/Dispatch/Register stations | [`StoreTabletFlow.tsx`](../apps/rush-command/src/components/store-tablet/StoreTabletFlow.tsx), `StationKioskFlow.tsx` |

Since order, menu, register, and kitchen ticket all live in one Roam-owned system, "Direct Feed," "Automatic Printing/KDS routing," and "Synced Menus" (per the tablet-vs-integrated reference doc) are solved automatically — there's no second system to keep in sync with.

**The catch:** this only removes tablet hell for merchants willing to **replace** their existing register with Roam's. It does nothing for a merchant already running Square/Toast/Clover/Aloha/RPE who won't switch — that's still Option 2, untouched.

**Status:** appears to be staged behind feature flags (`venueOpsV2`, `staffOperationsV1`) — verify how close to production-ready these flows actually are (pair a tablet, place a test order end-to-end, confirm prep-station ticket routing and Stripe reader flow all work) before calling it shippable.

### Which one, when
- Small/no-POS merchants → Option 3 (Rush Command) is very likely enough, and it's the fastest path since most of it already exists.
- Merchants already invested in Square/Toast/Clover/Aloha/RPE and unwilling to switch registers → only Option 2 solves their tablet hell. This is genuinely separate, additional work — not something Option 3 grows into.

---

## 3. Option 2, scoped for the Jamaican market

The Jamaican restaurant POS landscape splits into three tiers, each needing a different integration approach.

### Tier 1 — Local heavyweights (enterprise / legacy)
Large fast-food chains and multi-location franchises (Island Grill, Juici Patties, major pizza chains).

- **Systems:** NCR Aloha (managed locally by Touchpoint Hospitality), Restaurant Pro Express / RPE (managed by High-Tech Jamaica Srv Limited).
- **Integration shape:** Apply for Aloha POS developer API access, or build a file-drop integration — Roam writes standardized transaction files to a local server directory that Aloha/RPE polls and injects into the kitchen queue.
- **Reality check:** the file-drop approach is old-style EDI integration — real, but it's as much a **business-development task** as an engineering one. Touchpoint Hospitality / High-Tech Jamaica need to agree to build and support their side of the poller, per restaurant. Don't scope this as pure API work, and don't treat it as a v1 blocker — track it as a separate partner-negotiation workstream.

### Tier 2 — Cloud-based players
Trendy cafés, mid-tier restaurants, newer bars (Kingston, Montego Bay, Portmore).

- **Systems:** SawaPOS (local, GCT/TAJ-aware), Square for Restaurants, Lightspeed.
- **Integration shape:** Standard REST webhook — Roam listens for a new order, POSTs a payload (menu item IDs, quantities, customer notes, payment-confirmed flag) to the POS's order API.
- This is the most approachable tier and the best place to pilot Option 2 first.

### Tier 3 — Middleware / aggregator shortcut (recommended starting point)
Rather than building and maintaining direct connectors to Aloha, SawaPOS, Square, and RPE separately, use a **POS aggregator middleware** — HubRise, Deliverect, or ItsaCheckmate. You build one connection to the middleware; they already maintain the individual POS connectors and translate/route orders into whatever the restaurant runs.

- **This meaningfully shrinks Option 2's scope** — from N vendor integrations down to one.
- **Unverified assumption to close out before committing engineering time:** confirm with the aggregator's sales team whether they already have live connectors for **SawaPOS** and for the **Touchpoint Hospitality-managed Aloha** / **High-Tech Jamaica RPE** deployments specifically. These vendors are built primarily around US/UK/EU-market POS (Square, Toast, Clover, Lightspeed) — Jamaica-specific systems may not be covered out of the box.
- **Recommended sequencing:** confirm middleware Jamaica coverage → pilot Tier 2 through one aggregator → run Tier 1 (Aloha/RPE) as its own partner-negotiation track in parallel, not gated on the aggregator pilot.

---

## 4. What the integration payload must handle, regardless of route

1. **Order injection** — item details, modifiers (e.g. "jerk sauce on the side"), totals, routed straight to the kitchen ticket printer/KDS.
2. **Menu syncing** — pull the restaurant's menu items, pricing, and active modifiers from their POS so you're not maintaining menus manually in two places. (Note: today, Roam's own menu system — [`useMerchantMenu.ts`](../apps/dash-merchant/src/hooks/useMerchantMenu.ts), `MenuManagementView.tsx` — has zero linkage to any external POS catalog. This mapping layer doesn't exist yet and is required infrastructure for Option 2 regardless of which tier or vendor.)
3. **GCT & tax mapping** — Jamaica's 15% General Consumption Tax must be categorized correctly in the payload so the restaurant's accounting stays TAJ-compliant. This is a Jamaica-specific requirement not covered by generic POS-integration guides and should be part of the payload spec from day one, not bolted on later.

---

## 5. Summary decision table

| | Tablet hell (Option 1) | Integrate into existing POS (Option 2) | Rush Command as full POS (Option 3) |
|---|---|---|---|
| Build required | None | Large — vendor partner access, menu mapping, order-push adapters, webhook receivers, GCT tax mapping | Mostly done — finish/validate what's behind feature flags |
| Who it helps | Everyone (fallback) | Merchants who already run Square/Toast/Clover/Aloha/RPE and won't switch | Small/no-POS merchants willing to adopt Roam as their register |
| Fastest way in | — | Start with a middleware aggregator (Deliverect/HubRise/ItsaCheckmate) for Tier 2 cloud POS | Pair a tablet, run an end-to-end test order today |
| Jamaica-specific work | None | Confirm aggregator coverage of SawaPOS/Aloha/RPE; GCT tax field mapping; Tier 1 is a partner-negotiation track, not pure engineering | None beyond your existing rollout |

**Bottom line:** these are not sequential steps you must complete in order — they're parallel tracks solving different merchant segments. Ship Option 3 to merchants without an existing POS now; scope Option 2 (starting with a middleware aggregator for Tier 2) as a separate project for merchants who won't give up their existing system; keep Option 1 as the fallback for anyone not yet covered by either.
