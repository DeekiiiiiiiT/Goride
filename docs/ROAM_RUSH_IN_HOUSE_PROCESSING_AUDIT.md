# Roam Rush In-House Processing: Open Items

**Rev 6 · 2026-10-12.** This page lists only what still needs fixing. History is in git (up to `152503f5`).

**Status:** the code is complete, and no code fixes are open.
- **Pizza price:** fixed. Checkout now prices the pizza from the same marked-up menu the customer sees (`pizzaLinePrices`), and the app no longer adds its own markup. The buyer's expected cost still uses the unmarked restaurant total.
- **Live code:** `delivery` v847.
- **Tests and checks:** Deno 43/43 pass, and the event-column CI check passes.
- **What's left:** production setup and the beta.

---

## 1. Production setup before the beta

Production today:
- 0 alert phones;
- 0 company cards;
- 0 beta customers;
- the pilot store has 15 items, `audience = beta`, is not live, and has no terms review recorded;
- `IN_HOUSE_ENABLED` is off;
- the ADR 0023 checklist is 0 of 7.

- [ ] Add at least one ops phone to `delivery.in_house_alert_phones`, and confirm a test page arrives.
- [ ] Add the procurement card (last 4 digits and daily limit) on **Cards and spend**.
- [ ] Record the pilot store's website terms review on the store.
- [ ] Finish the pilot menu (the ADR asks for about 20 items; there are 15), with prices confirmed in the last 14 days.
- [ ] Sign the ADR 0023 checklist.
- [ ] Add beta customers to `delivery.in_house_beta_customers`.
- [ ] Turn on `IN_HOUSE_ENABLED`, and set the pilot store live with `audience = beta`.
- [ ] Pilot counter check: confirm the restaurant hands over a prepaid online carry-out order for "Roam {order number}" without seeing the card. If it won't, switch the store to phone ordering.
- [ ] Run the one-week closed beta. Check that the six `v_in_house_*` recon views are at 0, then set `audience = public`.

## 2. Watch item (no action now)

**Partner pizza rounding.** For a partner restaurant (markup 0), checkout still runs the pizza through `customerPriceFromCost`, which rounds each part up to the next J$10. The partner's menu shows the raw prices. For example, a J$85 topping would be charged J$90.

No partner has a pizza menu today (0 in production), and the partner app can't create one. **Before giving partners pizza menus, skip the rounding when markup is 0.**

---

## Next check will confirm

- Production has an alert phone, a card and beta customers, and the pilot store is live with `audience = beta`.
- After the first beta orders:
  - all six recon views are 0;
  - every task has a receipt, a purchase journal and a matched card line;
  - each pizza charge equals the price shown in the cart.
