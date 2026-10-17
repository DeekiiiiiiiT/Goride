# Chain menu capture playbook (Domino’s / Pizza Hut Jamaica)

Ops + QA process for Phase 7 of the menu engine rebuild. Confirm every option in the brand’s own app — web research for Jamaica menus is incomplete.

## 1. Capture (per brand)

For each screen in their builder, record:

- Sizes (names + inches if shown)
- Crusts per size (including “not sold on…”)
- Crust flavours / seasoning
- Sauces + paid sauces + amount levels (none / light / normal / extra)
- Cheese levels (none / light / normal / extra / double) + fees
- Topping categories (meats, veggies, cheeses, premium) + per-size prices
- Half-and-half rules and half price (full vs half)
- Max toppings
- Specialty pizzas: fixed price per size + default toppings
- Bake / cut notes
- Wings: counts, bone-in/boneless, flavours per N pieces, dips
- Sides, desserts, drinks (sized)
- Current deals / combos + upcharges
- Screenshots → attach on `menu_brands.evidence_urls`

## 2. Build brand catalog

1. Create `menu_brands` row (e.g. “Domino’s Jamaica”).
2. Apply Pizza (chain-style) kit + Wings + Deals.
3. Enter every option with `source_label` exactly as the site shows.
4. Set specialty pizzas to **fixed** per-size pricing; default toppings `defaultRefund: nothing`.
5. Link each location via `merchants.menu_brand_id`; set location overrides only where a branch differs.

## 3. Parity check

In the Menu engine → Parity tab:

- [ ] No group/option without a source label
- [ ] No source option missing from Roam
- [ ] Publish snapshot; customer app reads published version only

## 4. Ten test orders (each brand)

Rebuild each on the restaurant site and compare price + ticket wording within the absorb/tolerance allowance:

1. Large half-and-half, light sauce, double cheese, premium on one half  
2. Specialty with one default topping removed (price must not drop)  
3. Specialty with one topping added  
4. Build-your-own with stuffed crust (size-gated)  
5. 12-piece wings → 2 flavours  
6. Wings + dip qty  
7. 2 Medium + side deal  
8. Same deal with Large upgrade upcharge  
9. Drink nested size in a combo  
10. Side / dessert sized item  

## 5. Monthly reconfirm

When brand price freshness expires (or monthly), run brand-level “confirm prices” once for the whole chain. Re-run parity + a sample of the 10 orders if the app UI changed.

## Done when

Audit §11 items for Domino’s-class half-and-half, specialty fixed pricing, deal upcharges, wings flavours, second branch override, and partner builder all pass against the live Jamaica apps.
