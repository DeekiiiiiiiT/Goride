# GCT Centralization Audit — Dominion → Roam Rush

Status: audit only, no code changed. Scope: Roam Rush apps only
(`dash-customer`, `dash-merchant`, `rush-command`, `dash-admin`/Pricing Hub),
sourcing General Consumption Tax (GCT) config from Dominion (`apps/admin`).
Fleet/Enterprise/Rides/Driver/Haul are out of scope for this pass, per your
instruction — but the recommended storage location is chosen so they can
plug in later without a rebuild (see §4).

## 1. Why this matters now

I read the General Consumption Tax Act you provided and then checked how
GCT is actually computed in the codebase today. The two don't match up
cleanly, and — more urgently — **the codebase disagrees with itself**: I
found three independent, drifted implementations of the tax calculation
across three different Roam Rush apps, one of which silently charges **$0
GCT** if a caller forgets to pass a rate. That's a live compliance risk
independent of whether you centralize anything. Details in §3.

## 2. What the Act actually requires (grounded in the PDF you sent)

- **Standard rate is 16.5%**, not 15% (s.4(1)(a): "sixteen and one-half *per
  centum*"). Your codebase already defaults to 16.5 in one place
  (`packages/dash-pricing`) — that part is correct. Good to confirm this
  explicitly since a previous pass of mine (before I'd read the Act) was
  working off an assumed 15% for the *service fee*, which is a different,
  non-statutory number you set — the two happening to look similar is worth
  keeping straight in your own head too.
- **GCT is charged on taxable supplies by *registered* taxpayers** (s.3(1),
  s.18). It is not a platform-wide flat tax — it's per-entity liability. A
  merchant who isn't GCT-registered (below the registration threshold —
  s.26, s.27, s.29) is legally not supposed to charge GCT on their sales at
  all. **Your marketplace has no concept of merchant GCT-registration
  status anywhere** (confirmed by grep — no `gct_registered`, `is_gct`,
  `tax_exempt`, or `zero_rated` field exists in the repo). Every merchant is
  taxed identically today, which is the biggest functional gap, not just an
  architecture problem.
- **Restaurant/bar/hotel meal sales are explicitly a taxable supply of
  services** (Fourth Schedule, para 1(e): "the supply of drinks or meals in
  the operation of a bar, canteen, club, hotel, restaurant or other place of
  business similar thereto"). This confirms prepared restaurant food is
  correctly taxable at the standard rate — it is *not* covered by the
  raw-foodstuff exemption in Third Schedule item 6 (that exemption is for
  unprocessed groceries, not prepared meals).
- **Roam Rush's own service fee and delivery fee are, on their face, a
  separate taxable supply of services** — by Roam Rush itself, as the
  registered taxpayer collecting that fee (s.3(1)(a), s.18(1)(c)). Right now
  the pricing engine only ever taxes the food subtotal (`discountedSubtotal
  * taxRate` in `engine.ts:213`) — service fee, delivery fee, and tip are
  never taxed. That may be correct if Roam Rush's platform fee is exempt or
  zero-rated under some provision I don't have visibility into, or it may
  be a real under-collection. **This is a question for your accountant, not
  something to silently change in code** — flagging it rather than fixing
  it.
- **Value of supply excludes the GCT itself** (s.7(1)(a)) — tax is added on
  top of a tax-exclusive price. The current `discountedSubtotal * taxRate`
  calculation is consistent with this.
- **Tax invoices/receipts must show the GCT amount separately** to ordinary
  consumers (s.22(b)), unless it's "clearly displayed on the supply
  concerned." Worth a quick UI check (not done in this pass) that
  dash-customer's order confirmation and rush-command's POS receipt both
  show GCT as its own line rather than folding it into a bundled total.
- **The rate itself is not fixed forever** — the Minister can amend it by
  order (s.4(2)), which is exactly how Jamaica's GCT rate has moved over the
  years (it has not always been 16.5%). Anywhere the rate is hardcoded in
  app code instead of read from config is a future incident waiting to
  happen the next time the rate changes.
- **Zero-rated and exempt categories exist** (First Schedule Part II,
  Third Schedule) — raw groceries, medicines, sanitary products, baby
  formula, school supplies, and more are exempt or zero-rated. Not urgent
  for a restaurant-only Roam Rush today, but if Roam Rush ever adds
  grocery/pharmacy merchants on the same checkout rails, a flat
  16.5%-on-everything model will overcharge customers on items that are
  legally exempt. Flagging as a scope note for the architecture (§4), not
  something to build now.

## 3. What's actually in the codebase today

I checked four places that compute or configure the tax rate:

| File | What it does | Problem |
|---|---|---|
| `packages/dash-pricing/src/engine.ts:178` | `taxRate = input.taxRatePercent ?? input.rules.taxRatePercent ?? 16.5` — reads per-market rate, correct 16.5 fallback | This is the "good" one, but it's **per-market config edited in dash-admin's Pricing Hub**, not centralized anywhere — every market row carries its own copy of `taxRatePercent`, and nothing in Dominion touches it. |
| `apps/dash-customer/src/lib/orderPricing.ts:3` | `export const TAX_RATE_PERCENT = 16.5;` — a hardcoded module constant, used directly in the cart total (`orderPricing.ts:143`) | **Completely disconnected** from the per-market rate above. If ops changes the rate in Pricing Hub — or the Minister amends the statutory rate — dash-customer's cart keeps charging the old hardcoded number until someone remembers to edit this file and redeploy. |
| `apps/dash-merchant/src/lib/order-pricing.ts:16` | `taxRate = (input.taxRatePercent ?? 0) / 100` | **Defaults to 0%, not 16.5%**, if no caller supplies a rate. |
| `apps/rush-command/src/lib/order-pricing.ts:16` | Identical `?? 0` fallback | Same problem — this one is more concerning because `rush-command` is the in-store POS (`PosRegisterPage.tsx`); a code path that reaches `buildOrder`-equivalent logic without an explicit tax rate produces a receipt with **zero GCT collected**, which is a real under-remittance risk for a registered merchant, not just a display bug. |

I didn't trace every call site to confirm whether the `?? 0` fallback is
ever actually hit in production today — that's worth someone verifying
directly — but the mere existence of a silent-zero-tax code path in a
merchant-facing POS is worth fixing regardless of the centralization
timeline below.

**Net effect:** there are three independent sources of truth for a number
that Jamaican tax law defines exactly once. That's the architectural
problem "put it in Dominion" actually solves — but centralizing a rate
without also fixing the missing merchant-registration flag just makes the
*wrong* number easier to change in one place, so I'm recommending both.

## 4. Recommended architecture

Roam Rush already has exactly the mechanism this needs: the segmented
platform-settings system (`packages/platform-settings`, KV key
`platform:settings:{segment}`, edited from Dominion at `apps/admin`,
resolved per-request via the `X-Roam-Settings-Segment` header — see
`docs/platform/SETTINGS_ARCHITECTURE.md`). This is the same pattern
Dominion already uses for Global Settings, Fleet Settings, Enterprise
Settings, etc. GCT config should be one more entry in that system, not a
new mechanism.

**Where to store it — one decision to make:**

- **`platform:settings:global`** (recommended). GCT isn't actually a
  Roam-Rush-specific concept — it's Jamaica tax law, and any future vertical
  that invoices for taxable goods/services (Fleet, Enterprise, Rides) will
  need the identical rate and identical logic. Storing it under `global`
  from day one means Roam Rush is simply the first *consumer* of it; other
  product lines read the same key later with zero replumbing. This matches
  how Dominion already treats things like maintenance mode and platform
  announcements.
- **`platform:settings:dash`**. Faster to ship since the segment and its
  consuming apps already exist end-to-end, but means a second migration
  later when Fleet/Enterprise need GCT too (copy the value, then decide
  which key is authoritative).

I'd default to `global`, but this is a judgment call about how soon you
expect other verticals to need GCT — happy to go the other way if you'd
rather optimize for shipping only what Roam Rush needs right now and deal
with migration later.

**What the new Dominion panel should hold** (Global Settings, new "Tax"
section):

- `gctStandardRatePercent` — single source of truth, default `16.5`
  (s.4(1)(a)). Every app that currently hardcodes or locally defaults this
  number stops doing so and reads it from here instead.
- `gctEnabled` — kill switch, in case of a future exemption or promotional
  tax holiday.
- Effective-dated rate (`{ rate, effectiveFrom }[]`) rather than a single
  mutable number — nice-to-have, not blocking for v1, but worth designing
  for now: s.4(2) rate changes are gazetted with an effective date, and a
  single overwritable number can't represent "orders placed before March 1
  used the old rate, after used the new one" if that ever matters for
  reconciliation.

**What Roam Rush apps do differently once this exists:**

- `packages/dash-pricing/src/engine.ts` stops defaulting to a bare `16.5`
  literal and instead requires the caller to pass the Dominion-sourced rate
  (or fetches it directly, depending on where you want the read to happen).
- `dash-customer`'s hardcoded `TAX_RATE_PERCENT` constant is deleted;
  the cart pulls the same value everything else does.
- `dash-merchant` and `rush-command`'s `?? 0` fallbacks are replaced with
  either a hard failure (better — refuse to price an order without a known
  tax rate, rather than silently under-tax it) or the Dominion default,
  never a bare zero.
- `dash-admin`'s Pricing Hub (Market Rules tab) either stops carrying its
  own per-market `taxRatePercent` field, or keeps it as a rarely-used
  per-market **override** on top of the Dominion default — worth deciding
  whether individual markets legitimately need a different rate (they
  shouldn't, for a single-country statutory tax) or whether that field only
  exists today because there was nowhere else to put the number.

**The bigger gap this doesn't fix by itself:** adding a `gctRegistered:
boolean` flag to the merchant/restaurant profile. When `false`, that
merchant's food-subtotal GCT must compute to `0` regardless of the platform
rate — this is a statutory requirement (s.3, s.26), not a business
preference. Without this flag, centralizing the rate makes the number
consistent but still wrong for any merchant who isn't actually GCT-registered.
I'd treat this as equally urgent to the centralization itself, not a later
phase.

## 5. What I'd explicitly avoid

Don't just point all three duplicate implementations at the shared
`dash-pricing` engine as a quick fix without also landing the Dominion
config and the merchant-registration flag — that centralizes an incomplete
model faster, which makes it *look* solved while the underlying compliance
gaps (unregistered merchants being taxed, service/delivery fee taxability
unconfirmed) are still open. The `rush-command` zero-tax fallback in
particular is worth a fix on its own timeline regardless of when the
Dominion work lands, since it's a live risk today.

## 6. Suggested phasing

1. **Dominion config + wiring.** Add `tax.gctStandardRatePercent` /
   `tax.gctEnabled` to the settings segment you choose (§4). Point
   `dash-pricing`, `dash-customer`, `dash-merchant`, and `rush-command` at
   it; delete the three divergent local implementations found in §3.
2. **Merchant registration flag.** Add `gctRegistered` to the merchant
   profile; zero out food-portion GCT for unregistered merchants.
3. **Accountant sign-off on fee taxability.** Confirm whether Roam Rush's
   own service fee + delivery fee need GCT applied separately from the
   merchant's food GCT; implement only after that's confirmed.
4. **Receipt/invoice check.** Verify GCT is shown as its own line on
   dash-customer's order confirmation and rush-command's POS receipt
   (s.22(b)).
5. **Later, cross-vertical:** if you stored the config at `global` in step
   1, Fleet/Enterprise/Rides/Haul read the same key when they need it — no
   replumbing required.
