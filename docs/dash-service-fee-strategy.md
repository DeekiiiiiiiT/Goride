# Restaurant Service Fee — Strategy & Calculation Model

Status: **implemented** (2026-08-23). GCT remains on discounted food subtotal only (16.5%) — service fee taxation pending accountant review.

## 1. The problem with the current field

The Market Rules tab today has one relevant field: **Service fee flat (JMD)
120**. A flat fee is either too small on big orders or too large on small
ones — it can't respond to basket size at all. Your request replaces it with
a rate-based model with guardrails. That's the right direction. But your own
worked example has a bug worth fixing before it goes anywhere near the admin
UI:

> **The $80 minimum, as stated, breaks the percentage rule for almost every
> order you'll actually see.** At 15%, an order has to be $533+ before the
> percentage fee even reaches $80. Below that, the minimum silently
> overrides the percentage on *every* order — which means for a typical
> $12–$60 basket, the customer isn't paying 15%, they're paying a flat $80,
> which is 667% of a $12 order. That's not a "floor," it's the entire
> pricing model. I think $80 was meant to be in a different unit (JMD, where
> the existing flat fee is 120) than the $ examples you walked through — but
> as given, it can't coexist with a 15% average rate on the order sizes in
> your own scenarios. I've used a placeholder minimum (~$1.50–2.00) in the
> worked examples below so the math is coherent; swap in your real currency
> figures, just sanity-check the minimum against your *smallest realistic
> order*, not your target average.

This is the single most important thing to fix. A minimum should catch the
long tail of tiny orders where a percentage rounds to near-zero — it should
almost never be the binding constraint for a normal order.

## 2. Why a simple "percentage, with an override percentage" model breaks

Your scenario 2 vs. scenario 3 already found the flaw yourself: if the
override rate applies to the *whole order* once some trigger is hit, you get
a **cliff** — a $199 order and a $201 order get radically different
treatment, and a 3× order doesn't cost 3× the fee in any predictable way.
Whole-order-conditional rates always do this. Two fixes exist industry-wide:

- **Option A — Capped percentage (Uber Eats / DoorDash style).** One flat
  rate, clamped between a min and max. Simple, no override rate at all. Fee
  = `clamp(subtotal × rate, min, max)`.
- **Option B — Marginal (bracketed) rate, like a tax bracket.** The average
  rate applies to the first slice of the order; a lower override rate
  applies only to the *amount above* a threshold. No cliff, because the
  transition is smoothed — every extra dollar is priced the same way
  regardless of which side of the threshold it falls on. Then clamp the
  result to [min, max].

You explicitly asked for an average rate **and** an override rate that
applies "in some cases" — that's Option B. It also directly resolves
scenario 3: the override rate suppresses the *marginal* fee on large orders,
and the max cap catches anything still too high after that. Recommending
**Option B**, since it matches your stated design intent and gives you two
independent levers (threshold + cap) instead of one blunt one.

## 3. The formula

```
Inputs (all admin-configurable, per market):
  avgRate         — e.g. 15%      (base rate for the first slice of the order)
  overrideRate     — e.g. 9%      (rate applied only to the amount above the threshold)
  overrideThreshold — e.g. $50    (subtotal breakpoint where the lower rate kicks in)
  minFee           — e.g. $1.50   (floor)
  maxFee           — e.g. $25.00  (ceiling)
  foodSubtotal     — sum of item prices only (no delivery fee, no tip, no tax)

Step 1 — marginal fee:
  if foodSubtotal <= overrideThreshold:
      rawFee = foodSubtotal × avgRate
  else:
      rawFee = (overrideThreshold × avgRate)
             + ((foodSubtotal - overrideThreshold) × overrideRate)

Step 2 — clamp:
  serviceFee = clamp(rawFee, minFee, maxFee)

Step 3 — round:
  serviceFee = round_half_up(serviceFee, currency_decimals)
```

The threshold and override rate together control how fast the *effective*
rate declines as the basket grows — which is exactly the "dynamic system"
you described wanting in scenario 2. The max cap is what actually solves
scenario 3 (large baskets); the override rate alone can't cap a runaway cart
by itself, it only slows the growth.

## 4. Your four scenarios, recalculated

Using illustrative defaults `avgRate=15%, overrideThreshold=$50,
overrideRate=9%, minFee=$1.50, maxFee=$25` (swap in your real currency
figures — the shape of the answer won't change):

| # | Order | Naive 15% | This model | Why |
|---|-------|-----------|------------|-----|
| 1a | 1 meal, $12 | $1.80 | **$1.80** | Under threshold, straight avg rate — unchanged from what you expected. |
| 1b | 5 meals, $60 | $9.00 | **$8.40** | $50 at 15% + $10 at 9% = $7.50 + $0.90. Slightly softened, no cliff. |
| 2 | 1 meal, $200 | $30.00 | **$21.00** | $50 at 15% + $150 at 9% = $7.50 + $13.50. Cheaper than naive 15%, but not a cliff down to your flat 9% ($18) either — the first $50 still earns full rate. |
| 3 | 3× $200 meals, $600 | $90.00 | **$25.00 (capped)** | Marginal calc gives $57.00, but the max cap catches it. This is what actually solves your scenario 3 — the override rate alone would still have let a big enough basket run past any reasonable dollar amount. |
| 4 | 1 meal, $4 | $0.60 | **$1.50 (floor)** | Rounds up to the minimum. See §5 — this is the case that needs a second decision, not just a floor. |

## 5. The case your scenario 4 actually exposes

A flat dollar minimum on a $4 order is a real problem regardless of what the
number is — $1.50 on a $4 order is 37.5%, which will read as predatory even
though the platform is "just" applying its stated minimum. Three ways
platforms handle this, in order of how much I'd recommend them:

1. **Minimum order subtotal gate.** Don't let checkout happen below some
   floor (e.g. $8–10 food subtotal) at all — either block it or route it
   through a distinct "small order fee" that's disclosed as its own line,
   separate from "service fee." This is what most delivery apps actually do
   (Instacart, DoorDash) rather than pretending a percentage model covers
   every basket size gracefully. It also means your `minFee` stops being
   asked to do two jobs at once (rounding-error floor *and* small-order
   economics).
2. **Cap the minimum as a fraction of the order.** e.g. `minFee` applies,
   but never exceeds `40%` of `foodSubtotal` — so a $4 order gets `min($1.50,
   $1.60) = $1.50`, but a $2 order gets `min($1.50, $0.80) = $0.80`. Softer,
   but adds a rule the admin UI has to explain.
3. **Just accept sub-minFee fee on tiny orders.** Simplest, but you eat
   margin on every micro-order and it doesn't scale.

I'd combine #1 with the model in §3: keep the marginal formula for anything
above the gate, and treat "can this order even be placed" as a separate,
existing lever (you may already have a minimum-order-value concept
elsewhere in checkout — if not, this is the natural place to add one).

## 6. Card processing fee — keep it out of the service fee

Your instinct to "factor in" the 4.5% AmberPay fee is right, but it
shouldn't be folded into the service-fee percentage. Three reasons:

- **The base is different.** Processing fees are charged by the processor
  on the *full transaction amount* (food + service fee + delivery fee + tip
  + tax), not on food subtotal alone. If you bake 4.5% into the 15%, you're
  computing it on the wrong base and will systematically under- or
  over-recover it as delivery fees, tips, or tax vary order to order.
- **It's conditional on payment method.** COD orders (which this screen
  already has a "COD pause threshold" for) don't touch a card processor at
  all — there's no fee to recover. If it's baked into "service fee," you'd
  either overcharge COD customers or need a second service-fee schedule for
  COD, which is more complexity than just keeping the two fees separate.
- **Disclosure.** Regulators and payment processors themselves (Stripe,
  Square, etc. all require this) generally expect a processing/convenience
  fee to be itemized as its own line, not folded silently into a service
  charge. Bundling it invites disputes and makes your own margin analysis
  harder to audit later.

Recommended order of operations at checkout:

```
foodSubtotal
+ serviceFee          (from §3, computed on foodSubtotal)
+ deliveryFee          (existing Market Rules fields — out of scope here)
+ tip
+ tax/GCT (if applicable — see §7)
= orderTotal (pre-processing-fee)

if paymentMethod == card/wallet:
    processingFee = orderTotal × processingRate   (e.g. 4.5%)
    customerTotal = orderTotal + processingFee
else: // COD
    customerTotal = orderTotal
```

Whether the processing fee is passed to the customer as its own line item or
absorbed into your margin is a business call, not a math one — but either
way, compute it last, on the true total, and keep it out of `avgRate`.

## 7. Other scenarios worth deciding now (you asked me to look)

- **GCT collision.** Jamaica's standard General Consumption Tax rate is
  15% — the same number you picked for `avgRate`. That's a coincidence
  that *will* confuse customers and your own bookkeeping ("is the 15% the
  tax or the fee?"). Recommend either picking a visibly different default
  rate, or making very sure the two line items are never shown adjacent
  without distinct labels. Also confirm with an accountant whether GCT
  applies on top of the service fee — this determines whether tax is
  computed on `foodSubtotal` alone or on `foodSubtotal + serviceFee`.
- **Promo/discounted items.** Compute the fee on the price the customer is
  actually charged (post-discount), not the menu price — unless the promo
  is merchant-funded, in which case you may want the fee on the
  pre-discount value so you're not subsidizing the merchant's promotion out
  of your own take rate. This is a business decision, not a math one — flag
  it for whoever owns merchant promotions.
- **Tips and delivery fee are never part of the fee base.** Worth stating
  explicitly since it's an easy accidental bug — `foodSubtotal` should be
  items (and paid modifiers/add-ons) only.
- **Refunds/partial cancellations.** If an item is refunded after the fee
  was charged, the service fee should be recomputed/pro-rated against the
  new subtotal, not kept in full — otherwise every partial refund is a
  built-in margin windfall that will show up as a support/dispute pattern.
- **Order edits before charge.** If a cart can be edited after the fee is
  first shown (add an item, remove an item), recompute at the final
  subtotal used for the actual charge, not the one shown when the cart was
  opened.
- **Multi-merchant carts.** If the app ever supports ordering from more
  than one restaurant in a single checkout, compute the fee per merchant
  sub-order (each gets its own subtotal, own min/max), not on the combined
  cart total — otherwise a 2-restaurant order gets a single inflated
  fee that penalizes basket-splitting behavior you don't control.
- **Catering / very large orders.** A hard `maxFee` is good for scenario 3,
  but if you ever expect legitimate $1,000+ catering orders, a flat $25 cap
  on a $1,000 order may under-recover badly. Consider a third bracket (a
  small marginal rate, e.g. 2–3%, above a second "catering threshold")
  instead of one universal cap — or just treat catering as a separate
  merchant tier with its own schedule, since it's already a different
  operational flow.
- **Fee waivers / loyalty.** If you ever run a "no service fee" promotion or
  subscription perk, make sure that path sets `serviceFee = 0` and skips the
  clamp entirely — a naive implementation could otherwise silently apply
  `minFee` even when the fee was supposed to be waived.
- **Per-market and per-merchant-tier overrides.** The screen already has a
  Market dropdown and a separate Merchant Tiers tab — both `avgRate` and
  friends should live per-market (economics differ by market), and it's
  worth deciding now whether individual merchant tiers can override the
  market default (e.g., a premium/enterprise merchant tier that gets a
  lower take rate) or whether the market rate is always final.
- **Rounding.** Decide once, centrally: round the final `serviceFee` (not
  intermediate steps) half-up to your currency's smallest usual unit, and
  never round *down* below `minFee` — round after clamping, not before, or
  a border-case order can round itself back under the floor.

## 8. Suggested admin UI changes (Market Rules tab)

Replace the single **Service fee flat (JMD)** field with a small group:

| Field | Example | Notes |
|---|---|---|
| Average service fee (%) | 15 | `avgRate` |
| Override service fee (%) | 9 | `overrideRate`, applies only above threshold |
| Override threshold ($) | 50 | subtotal breakpoint |
| Minimum service fee ($) | 1.50 | floor — sanity-check against smallest realistic order |
| Maximum service fee ($) | 25.00 | ceiling — the actual fix for runaway carts |
| Minimum order subtotal ($) | 8.00 | gate before checkout; see §5 |
| Card processing fee (%) | 4.5 | separate line item, card/wallet payments only, computed on order total — see §6 |

All of these are naturally per-market (they already live under the Market
dropdown), and the existing **Simulator** tab is the right place to let ops
punch in a basket size and see `serviceFee` + `processingFee` come out
before saving — worth wiring the formula there first, since it'll surface
any bad default (like the $80 minimum) immediately instead of after launch.
