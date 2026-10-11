# ADR 0023 — In-House procurement

## Status

Accepted as the working build — 2026-10-11. Public launch stays off until the checklist below is signed.

## Context

Some restaurants are not Roam partners. A customer can still order. Roam buys the food on the restaurant’s own site, then a courier picks it up and delivers it. The existing Rush order, courier, payment, and ledger stay in place. This is a staffed desk inside the ops console, not a new app and not a website bot.

## Decision

1. Roam buys as the customer’s agent. One Terms of Service clause covers “Roam places the order for some restaurants.” The customer app does not say In-House, and checkout uses the same messages a partner store uses.
2. The restaurant keeps its logo, cover, and menu photos. A customer sees a normal restaurant. A courier sees a normal pickup.
3. Card only. Food is bought only after the customer’s card payment is captured.
4. An In-House store never receives a merchant payout. Roam already paid the restaurant with the company card.
5. No new fee. The store markup is inside the menu price. Delivery and service fees stay the normal ones. Pilot markup starts at 15% and is a per-store setting.
6. The store is closed outside its offer hours and whenever nobody is on the desk.
7. Cancel stays open only while the order is Confirmed. The moment a buyer claims it, the order becomes Preparing and the cancel window closes, the same as a partner kitchen starting the order. If the restaurant price is higher, Roam absorbs it up to the store cap (the lesser of the store percent and the dollar cap). Above that cap the buyer swaps the item through the substitution the customer already knows, or cancels with a full refund. After the food is bought, a failure is wait, send the courier again, or write off the food and refund the customer.
8. A purchase above J$15,000 needs a second ops approval before it can be recorded.
9. Only the last four digits of the company card are stored.
10. A human places every order at launch. A cart-fill helper may come later and must never type the card or press pay. A browser worker is allowed only where that store’s terms permit it, on a separate machine, with a human fallback, and it must never retry a payment.
11. Couriers are not buyers and do not hold a company card.
12. Courier offers are ranked from the restaurant, for every Rush order.
13. Receipt tax is saved on the task. It is not filed as reclaimable tax until an accountant says so. Meal receipts are treated as entertainment by the current expense-tax tool.
14. The global switch `IN_HOUSE_ENABLED` defaults off. Each store also has its own live switch. The public switch stays off until this checklist is signed.
15. The pickup name is `Roam` plus the order number. The courier already shows that number. No special pickup screen.
16. If a brand objects, turn that store’s live switch off the same day.

## Launch checklist

Do not turn the public switch on until every line is checked by the owner.

- [ ] Attorney confirms the Terms of Service clause that covers agency ordering.
- [ ] Accountant confirms tax on this order type. Until then, receipt tax is stored and not filed.
- [ ] Website terms read for the pilot store, and the result recorded on the store.
- [ ] Company procurement card open, with a daily limit. Statement export format confirmed.
- [ ] Pilot store entered, with about 20 items, prices, and offer hours.
- [ ] One or two buyers assigned, and desk hours match the offer window.
- [ ] Closed beta (staff and friends, one store, one week) reviewed: time to place, price gaps, exceptions, courier wait.

## Consequences

- Partner settlement must not run for these stores. A database guard rejects a merchant payable. A refund of the food share is a Roam cost, not a restaurant payable.
- An existing partner restaurant is not converted into In-House. New restaurants are created only from the add-store form.
- Courier offers stay ranked from the restaurant for every Rush order. That is intentional. Watching acceptance rate is an ops check after normal Rush traffic.
