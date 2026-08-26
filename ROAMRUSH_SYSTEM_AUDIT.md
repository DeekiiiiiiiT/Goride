# Roam Rush System Audit — `roamrush.app` (`apps/dash-customer`)

**Date:** 2026-08-26
**Scope:** The customer ordering app at `roamrush.app` — discovery, cart, pricing, checkout, payments, order lifecycle, tracking, account — plus the server routes it depends on (`supabase/functions/delivery`, `supabase/functions/payments`) and the seams where its correctness depends on the merchant, courier and ops-console apps.
**Method:** Static read of `apps/dash-customer/src` (161 files), `supabase/functions/payments/index.ts`, `supabase/functions/delivery/customerOrderRoutes.ts`, `_shared/orderPricing.ts`, and the shared pricing/coverage packages. No code was changed.
**Companions:** [TOLL_SYSTEM_AUDIT.md](TOLL_SYSTEM_AUDIT.md) · [FUEL_SYSTEM_AUDIT.md](FUEL_SYSTEM_AUDIT.md) · [VEHICLE_SYSTEM_AUDIT.md](VEHICLE_SYSTEM_AUDIT.md)

> **Scope note.** `roamrush.app` resolves to `apps/dash-customer` (`DASH_CUSTOMER_PRODUCTION_ORIGIN`, `<title>Roam Rush – Food Delivery</title>`). The Rush family also includes `partner.roamrush.app` (`dash-merchant`, 206 files), `courier.roamrush.app` (`dash-courier`, 175 files) and Roam Command (`rush-command`, 276 files). Those are audited here **only where the customer app's correctness depends on them** — each warrants its own pass.

---

## 0. Executive summary

`dash-customer` is, by engineering standard, **the best-built app in this repository.** It has real unit tests beside the logic they cover (24 `.test.ts` files in `lib/` alone), a deliberate mock-data gate that refuses to substitute fixtures in production, end-to-end idempotency on order placement, a full CSP with HSTS preload, and local storage used correctly as a *cache* over a server source of truth with a sign-out wipe for shared devices. Almost none of the sloppiness catalogued in the fleet audits appears here.

Which makes the one serious finding stand out sharply.

**`POST /payments/wipay/complete` marks orders paid on the customer's say-so.** The gate is `wipaySuccess(body.status)` where `body.status` is forwarded verbatim from the browser's URL query string. There is no call to WiPay to verify anything. An authenticated customer can POST `{orderId: "<their own order>", status: "success"}` and have the order marked paid, a completed transaction row inserted, and the merchant/courier money split executed — without paying. Ownership *is* checked, which stops you marking someone else's order paid, but that is not the threat; the threat is getting your own food for free.

The correct pattern is implemented 120 lines below in the same file: `/paypal/capture` calls PayPal's API server-side and only proceeds `if (result.status === "COMPLETED")`. A properly secret-verified WiPay webhook also exists at `/webhooks/wipay`. `/wipay/complete` is a third, unverified path that bypasses both.

**The five highest-impact findings:**

1. **WiPay payment can be self-confirmed by the customer** (§B1). Critical.
2. **PayPal charges USD at a hardcoded `/155` JMD rate** with no FX record and no captured-amount reconciliation (§B2).
3. **The `free_delivery` promo type is displayed to customers but never implemented** — it discounts nothing and does not zero the delivery fee (§A1).
4. **Client and server disagree on tax for non-GCT-registered merchants** — the server charges 0%, the cart shows 16.5% (§A2).
5. **`resumeOrderPayment` does `window.location.href = clientSecret`** — an unvalidated redirect to a server-supplied string with a badly misleading variable name (§B4).

**Severity counts:** 2 Critical · 8 High · 13 Medium · 7 Enhancement.

**What is genuinely solid** (do not touch): `mocksGate.ts`, the order idempotency implementation on both sides, `customerLocalData.ts`'s sign-out wipe, `resolveTaxRatePercent`'s fail-loud design, `/paypal/capture`'s verification, `/webhooks/wipay`'s secret check and return-origin allowlist, and the `vercel.json` security headers.

---

## 1. System map

| Surface | Component | Server route | Store |
|---|---|---|---|
| Discovery / search | `HomePage`, `SearchPage`, `merchantDiscovery.ts` | `delivery/merchants` | `delivery.merchants` |
| Menu | `RestaurantPage`, `merchantMenu.ts` | `delivery/merchants/:id/menu` | `delivery.menu_items` |
| Cart | `useCart.tsx` | — | `localStorage` |
| Pricing quote | `orderPricing.ts` | `delivery/merchants/:id/pricing` | `pricingResolver.ts` |
| Checkout | `CheckoutPage` | `POST delivery/orders` | `delivery.orders` |
| Payment | `PaymentCallbackPage`, `resumePayment.ts` | `payments/intents`, `/wipay/complete`, `/paypal/capture`, `/webhooks/wipay` | `payments.payment_intents` |
| Tracking | `OrderTrackingPage` | `delivery/orders/:id` + realtime | `delivery.orders` |
| Account | `AccountPage`, `customerApi.ts` | `delivery/customers/*` | server + localStorage cache |
| Ops console | lazy `@roam/dash-admin` at `/admin` | — | co-hosted on the same origin |

---

## A. Pricing — `lib/orderPricing.ts`, `_shared/orderPricing.ts`

The file opens with the right instinct: `/** Client totals must match server formula in customerOrderRoutes.ts */`. On the **v2** path they do. On the **legacy** path, and on API-failure fallback, they do not.

### A1 · HIGH — `free_delivery` promos are advertised and do nothing
```ts
export type PromoCode = {
  type: 'percentage' | 'fixed' | 'free_delivery' | 'percent_off' | 'amount_off';
```
([`orderPricing.ts:10`](apps/dash-customer/src/lib/orderPricing.ts#L10))

`computeDiscount` handles `percentage`/`percent_off` and `fixed`/`amount_off`, then falls through:
```ts
if (type === 'fixed' || type === 'amount_off') { … }
return 0;                                    // ← free_delivery lands here
```
([`:59-70`](apps/dash-customer/src/lib/orderPricing.ts#L59))

No branch for `free_delivery`, and no call site zeroes `deliveryFee` when that type is applied — I grepped every use of `free_delivery` in the app; outside the type union and the v2 server passthrough, the only hit is [`DealsPage.tsx:38`](apps/dash-customer/src/pages/DealsPage.tsx#L38), which **displays these deals to customers**.

A customer sees a Free Delivery deal, applies it, and is charged full delivery with zero discount. This is a customer-trust and support-ticket generator, not just a bug.

Note the distinct v2 mechanism `freeDeliveryApplied` / `free_delivery_applied` — that is a server-side pricing-tier concept, not the promo code, and does not rescue this.

### A2 · HIGH — Tax disagrees for non-GCT-registered merchants
Server:
```ts
export function resolveTaxRatePercent(input: PricingInput): number {
  if (input.gctRegistered === false) return 0;
  …
  throw new Error('taxRatePercent is required for GCT pricing — resolve from Dominion global settings…');
}
```
([`_shared/orderPricing.ts:41-50`](supabase/functions/_shared/orderPricing.ts#L41))

That is excellent design — zero for unregistered merchants, and it **throws rather than silently defaulting** when the rate is missing.

Client legacy path:
```ts
const gctRate = options?.taxRatePercent ?? GCT_RATE_FALLBACK_PERCENT;   // 16.5
const tax = roundMoney(discountedSubtotal * (gctRate / 100));
```
([`orderPricing.ts:147-148`](apps/dash-customer/src/lib/orderPricing.ts#L147))

The client has **no `gctRegistered` concept at all**. For a non-registered merchant on the legacy model, the cart shows a GCT line the server will not charge. The customer is quoted more than they pay — the safer direction, but the cart is lying and the discrepancy will surface as "why is my receipt different".

Compounding it: `fetchMerchantCheckoutPricing`'s legacy return hardcodes `taxRatePercent: GCT_RATE_FALLBACK_PERCENT` and `tax: 0` ([`:261-271`](apps/dash-customer/src/lib/orderPricing.ts#L261)) — so on legacy the client *never* receives the merchant's real rate, even when the API responds successfully.

### A3 · HIGH — A pricing API failure silently re-prices the cart
```ts
const res = await fetch(url, { headers });
if (!res.ok) return null;
```
([`:208-209`](apps/dash-customer/src/lib/orderPricing.ts#L208))

`null` sends the caller down the legacy branch with `PLATFORM_FEE_RATE = 0.05` and 16.5% GCT — hardcoded client constants explicitly disclaimed two lines above as *"Fallback only — prefer resolved rate from merchant pricing API"* and *"never trust a hardcoded client constant"*.

There is no error state, no retry, and no indication to the user that the total on screen was computed from defaults rather than from the merchant's actual fee structure. For a merchant on a non-5% commission, the displayed total is simply wrong until they hit Place Order.

### A4 · MEDIUM — Card processing fee is invisible on the legacy path
```ts
const processingFee = 0;
const total = orderTotal;
```
([`:150-151`](apps/dash-customer/src/lib/orderPricing.ts#L150))

The v2 path charges `orderTotal * cardProcessingFeePercent` for `wipay`/`paypal` ([`:125-129`](apps/dash-customer/src/lib/orderPricing.ts#L125)). The legacy path hardcodes zero. The server legacy branch also computes `processingFee = 0`, so today they agree — but the two models diverge on whether a card fee exists at all, and `isCardPayment()` is dead code on the legacy path. Any future decision to charge processing on legacy orders will silently under-quote.

### A5 · MEDIUM — Delivery fees are recovered by regex from display strings
```ts
export function parseDeliveryFeeLabel(label: string | null | undefined): number {
  if (/free/i.test(label)) return 0;
  const match = label.match(/J\$\s*([\d,]+)/i);
```
([`:73-79`](apps/dash-customer/src/lib/orderPricing.ts#L73))

Screen-scraping your own data. A label of `"J$150–300 delivery"` yields 150; `"Free over J$2000"` yields 0 unconditionally because the `/free/i` test runs first; a label in a different currency format yields 0. Delivery fee should come from a numeric field, not a marketing string.

### A6 · MEDIUM — Minimum-order rejection happens only after Place Order
The server enforces the minimum and returns `code: "min_order_not_met"` ([`customerOrderRoutes.ts:302-307`](supabase/functions/delivery/customerOrderRoutes.ts#L302)), which [`CheckoutPage.tsx:278`](apps/dash-customer/src/pages/CheckoutPage.tsx#L278) catches and displays.

But `minOrder` is already available at browse time — `merchantDiscovery.ts:58` reads `min_order_amount` and even uses it to compute the `$`/`$$`/`$$$` price level. Nothing on `CartPage` blocks or warns. The customer builds a cart, enters an address, selects payment, taps Place Order, and only then learns they are short. The data to prevent that is loaded three screens earlier.

---

## B. Payments — `supabase/functions/payments/index.ts`

### B1 · CRITICAL — WiPay orders can be marked paid without payment

```ts
app.post("/wipay/complete", async (c) => {
  … auth: user must be signed in …
  const body = await validateBody(c, WipayCompleteBody);
  const intent = await findWipayIntent(serviceSupabase, payload, body.orderId);
  if (!intent) return c.json({ error: "Payment not found" }, 404);

  const owned = await assertCustomerOwnsOrder(user.id, String(intent.order_id));
  if (!owned.ok) return c.json({ error: owned.error }, owned.status);

  if (!wipaySuccess(body.status) && String(intent.status) !== "completed") {
    return c.json({ error: "Payment not completed" }, 400);
  }

  const orderId = await completeWipayIntent(serviceSupabase, intent, { ...payload, status: body.status ?? "success" });
  return c.json({ success: true, orderId });
});
```
([`payments/index.ts:571-603`](supabase/functions/payments/index.ts#L571))

Trace the inputs:

- `body.status` is a **free-form optional string** — `WipayCompleteBody = z.object({ orderId: z.string().min(1), transactionId: z.string().optional(), status: z.string().optional() })` ([`:565-569`](supabase/functions/payments/index.ts#L565)). No enum, no format check.
- It arrives from the browser. [`PaymentCallbackPage.tsx:69`](apps/dash-customer/src/pages/PaymentCallbackPage.tsx#L69) reads `params.get('status')` off `window.location.search` and forwards it verbatim.
- `wipaySuccess` accepts `"success" | "successful" | "completed" | "paid" | "ok" | "approved" | "1" | "true"` ([`:102-105`](supabase/functions/payments/index.ts#L102)).
- `findWipayIntent` with only an `orderId` returns **the most recent wipay intent for that order** ([`:169-177`](supabase/functions/payments/index.ts#L169)) — no provider secret, no transaction id required.
- **Nothing in this handler calls WiPay.**

The gate `!wipaySuccess(body.status) && intent.status !== "completed"` passes if *either* disjunct is satisfied. A client-supplied `status: "success"` satisfies the first on its own.

`completeWipayIntent` then sets the intent to `completed`, inserts a `payments.transactions` row with `status: "completed"`, and runs `computeDashCaptureSplit` to book the merchant receivable and courier amount ([`:180-225`](supabase/functions/payments/index.ts#L180)).

**Result:** an authenticated customer POSTs `{orderId: "<their own order>", status: "success"}` and the order is paid. `assertCustomerOwnsOrder` is satisfied because they *are* the owner — it defends against a different attack than the one available here.

The handler's own comment states the intent:
> `// Customer return from WiPay hosted page — marks the order paid so the kitchen can see it.`

The motivation is understandable — don't leave a paying customer's food uncooked while waiting on a webhook. But the correct implementation is to verify with WiPay (or wait on the signed webhook, or reconcile), not to trust the redirect.

**Both correct patterns already exist in this codebase.** `/webhooks/wipay` is properly secret-verified (`verifyWipayCallbackSecret`, [`:521-524`](supabase/functions/payments/index.ts#L521)) with a return-origin allowlist. `/paypal/capture` verifies server-side (§B3). `/wipay/complete` is a third path that bypasses both.

### B2 · CRITICAL — PayPal charges USD at a hardcoded exchange rate
```ts
amount: {
  currency_code: "USD",
  value: (order.total / 155).toFixed(2)   // Convert JMD to USD (approx rate)
}
```
([`payments/index.ts:~762`](supabase/functions/payments/index.ts#L762))

Three problems stacked:

- **The rate is a literal.** JMD/USD moves. At a true rate of 160 you undercharge ~3% on every PayPal order; at 150 you overcharge ~3%. Neither is detected.
- **No FX record is kept.** The order is JMD, the charge is USD, and the rate used is not stored anywhere on the intent or transaction. Reconciliation, refunds, and merchant payouts have no basis to work from.
- **The captured amount is never checked.** `/paypal/capture` proceeds on `result.status === "COMPLETED"` without comparing `capture.amount.value` against `intent.amount`. Combined with the above, an order can be captured for an amount nobody reconciles.

Refunds inherit all of it — `/refunds` will have to invert an unknown rate.

### B3 · Not a finding — PayPal capture is done correctly
Worth stating explicitly because it is the model to copy for §B1:
```ts
const response = await fetchWithTimeout(`${baseUrl}/v2/checkout/orders/${paypalOrderId}/capture`, …);
const result = await response.json();
if (result.status === "COMPLETED") {
  … intent lookup by provider_intent_id …
  if (String(intent.customer_id) !== owned.customerId) return c.json({ error: "Forbidden" }, 403);
  if (String(intent.order_id) !== String(orderId))    return c.json({ error: "Order mismatch" }, 403);
```
([`:692-750`](supabase/functions/payments/index.ts#L692))

Server-side verification with the provider, plus ownership and intent/order cross-checks. Correct.

### B4 · HIGH — `window.location.href = clientSecret`
```ts
const { clientSecret } = await paymentRes.json();
window.location.href = clientSecret;
```
([`resumePayment.ts:39-40`](apps/dash-customer/src/lib/resumePayment.ts#L39))

The value is a **redirect URL**, named `clientSecret` — a name that in every payment SDK means an opaque credential that must never be navigated to or logged. Anyone maintaining this will misread it.

Functionally it is an unvalidated navigation to a server-supplied string: no `https:` check, no allowlist of payment hosts. The `/webhooks/wipay` handler right next door demonstrates the right approach with `isAllowedPayReturnOrigin` ([`:553`](supabase/functions/payments/index.ts#L553)) — the same guard should apply here.

### B5 · HIGH — PayPal's return URL defaults to the wrong domain
```ts
const returnUrl = Deno.env.get("APP_URL") ?? "https://dash.roamja.com";
```
([`payments/index.ts:~748`](supabase/functions/payments/index.ts#L748))

If `APP_URL` is unset, PayPal returns the customer to `dash.roamja.com` — a different origin, where the Supabase session does not exist. The payment succeeds at PayPal and the callback cannot complete.

The WiPay webhook in the same file defaults to `Deno.env.get("APP_URL") ?? "https://roamrush.app"` ([`:556`](supabase/functions/payments/index.ts#L556)). Two different fallbacks for the same variable, in one file.

### B6 · MEDIUM — PayPal's 45-second timeout reports failure it cannot confirm
```ts
const timeout = window.setTimeout(() => { setTimedOut(true); setStatus('failed'); }, 45000);
```
([`PaymentCallbackPage.tsx:22-25`](apps/dash-customer/src/pages/PaymentCallbackPage.tsx#L22))

The capture may still be in flight or already succeeded server-side. The customer is told the payment failed and will reasonably retry — producing a second charge attempt on an order that may already be paid. There is no reconciliation screen and no "we're still checking" state.

### B7 · MEDIUM — WiPay callback params are read from four aliases each
```ts
const wipayStatus    = params.get('status')     || params.get('payment_status') || '';
const orderIdParam   = params.get('order_id')   || params.get('orderId')        || '';
const transactionId  = params.get('transaction_id') || params.get('transactionId') || '';
```
([`PaymentCallbackPage.tsx:69-71`](apps/dash-customer/src/pages/PaymentCallbackPage.tsx#L69))

`payloadString(payload, "transaction_id", "transactionId", "transactionid")` does the same server-side. Defensive alias-matching against a payment provider's callback shape means nobody is certain what WiPay actually sends. That uncertainty is what makes §B1 hard to close safely — pin the contract first.

---

## C. Checkout & order lifecycle

### C1 · Not a finding — idempotency is properly implemented
Client holds a UUID in a ref across retries and clears it only on terminal success or failure:
```ts
const idempotencyKeyRef = useRef<string | null>(null);
if (!idempotencyKeyRef.current) idempotencyKeyRef.current = crypto.randomUUID();
… headers: { 'Idempotency-Key': idempotencyKeyRef.current } …
```
([`CheckoutPage.tsx:55, 236, 247`](apps/dash-customer/src/pages/CheckoutPage.tsx#L55))

Server validates length bounds, dedupes through an `order_idempotency_keys` table, and returns a distinct `orders_idempotency_not_ready` code if the migration has not been applied ([`customerOrderRoutes.ts:83-86, 373-375`](supabase/functions/delivery/customerOrderRoutes.ts#L83)). This is the most careful piece of engineering in the app.

### C2 · MEDIUM — Cash orders are gated by an env var with no client awareness
```ts
if (paymentMethod === "cash" && Deno.env.get("DASH_ALLOW_CASH_ORDERS") !== "true") {
  return c.json({ error: "Cash on delivery is not available yet…", code: "cash_not_available" }, 400);
}
```
([`customerOrderRoutes.ts:262-267`](supabase/functions/delivery/customerOrderRoutes.ts#L262))

The customer selects Cash at checkout and is rejected at Place Order. Whether cash is available is server state the client can't see, so the option is either always shown (and sometimes fails) or the flag is permanently off and the option is dead UI. Either way the payment-method picker should reflect it.

### C3 · MEDIUM — Order cancellation uses `window.confirm`
```ts
const confirmed = window.confirm('Cancel this order? You can only cancel before the restaurant starts preparing.');
```
([`OrderTrackingPage.tsx:~101`](apps/dash-customer/src/pages/OrderTrackingPage.tsx#L101))

An unstyled native dialog in an otherwise fully designed app — and on Capacitor (this ships to Android and iOS) it renders as an OS alert that breaks the visual language entirely. Every other confirmation in the app uses the design system.

---

## D. Cart, discovery and local state

### D1 · Not a finding — local storage hygiene is correct
`customerLocalData.ts` enumerates all nine per-user keys and wipes them on sign-out, including unsubscribing push and clearing `sessionStorage`:
```ts
export const CUSTOMER_USER_LOCAL_STORAGE_KEYS = [
  'roam-dash-profile', 'roam-dash-saved-addresses', 'roam-dash-delivery-address',
  'roam-dash-cart', 'roam-dash-checkout', 'roam-dash-notification-prefs',
  'roam-dash-payment-alt', 'roam_rush_native_push_token', 'roam_rush_web_push_endpoint',
] as const;
```
And addresses, favorites and profile all sync to the server via `customerApi` with localStorage as a cache — not as the source of truth. This is the shared-device handling the fleet app's `preferred_stations` lacked entirely.

### D2 · MEDIUM — Notification and alternate-payment preferences are local-only
`accountSubContent.ts` reads and writes `roam-dash-notification-prefs` and `roam-dash-payment-alt` to localStorage with **no `customerApi` import** — unlike `addressStorage.ts`, `favoritesStorage.ts` and `accountContent.ts`, which all sync.

So notification preferences do not follow the user to a second device, and — more importantly — the **server has no record of them**. Any server-side send decision cannot honour a preference it cannot see. Worth checking whether push/email sends consult anything.

### D3 · MEDIUM — Delivery-zone coverage is cached in localStorage with a TTL
`createZoneCache({ storage: localStorage, key: DELIVERY_ZONES_CACHE_KEY, ttlMs: DELIVERY_ZONES_CACHE_TTL_MS })` ([`deliveryZones.ts:29-48`](apps/dash-customer/src/lib/deliveryZones.ts#L29)).

Sensible for performance, but coverage is an operational control — when ops shrinks a zone (weather, courier shortage), customers holding a warm cache keep ordering into it until the TTL expires. Verify the TTL is short enough, and note that the server re-validates via `assertSameMarketCoverage` on order creation, so the failure mode is a rejected order rather than an undeliverable one.

### D4 · LOW — Cart is localStorage-only, unlike every other account object
`useCart.tsx` persists `{ items, merchantId, merchantName }` to `roam-dash-cart`. A customer who builds a cart on their phone and opens the site on a laptop sees an empty cart. Given addresses and favorites already sync, this is an inconsistency in the model rather than a technical limitation.

---

## E. Tracking and post-order

### E1 · Not a finding — tracking is well built
5-second polling **plus** a Postgres realtime channel filtered to the single order, with correct channel cleanup and the mock gate respected:
```ts
.channel(`order-track-${orderId}`)
.on('postgres_changes', { event: 'UPDATE', schema: 'delivery', table: 'orders', filter: `id=eq.${orderId}` }, () => { void refetch(); })
.subscribe();
return () => { void supabase.removeChannel(channel); };
```
([`OrderTrackingPage.tsx:47-67`](apps/dash-customer/src/pages/OrderTrackingPage.tsx#L47))

### E2 · MEDIUM — `retry: false` on the tracking query
([`:44`](apps/dash-customer/src/pages/OrderTrackingPage.tsx#L44)) — a single transient network failure drops the customer into the error path mid-delivery. The 5s interval will recover, but the intervening render shows failure on the screen a customer watches most closely. On mobile networks this will fire often.

### E3 · LOW — Polling never stops
`refetchInterval: 5000` runs for the lifetime of the mounted page. The delivered-phase effect navigates away, which usually unmounts it — but a backgrounded tab left on a completed order keeps polling indefinitely.

---

## F. Cross-app seams

### F1 · HIGH — The ops console is co-hosted on the customer origin
`roamrush.app/admin` lazy-loads `@roam/dash-admin` inside the customer bundle:
```ts
const isAdmin = window.location.pathname.startsWith('/admin');
… <BrowserRouter basename="/admin"> …
const m = await import('@roam/dash-admin');
```
([`App.tsx:130, 190, 199`](apps/dash-customer/src/App.tsx#L130)) and `vercel.json` rewrites `/admin/(.*)` to the same SPA.

Consequences worth a deliberate decision rather than inheritance:
- The ops console runs under the **customer app's CSP**, which permits `script-src 'unsafe-inline' 'unsafe-eval'` and allows Google Maps origins.
- It shares an origin — and therefore `localStorage`, `sessionStorage` and cookies — with the customer app. `clearCustomerLocalData()` on customer sign-out operates in the same storage partition as admin state.
- Every customer visitor downloads an app shell that can code-split into the ops console.

Roam Command (`rush-command`, 276 files) is a separate deployment with its own stricter CSP. It is not obvious why a second admin surface lives inside the customer app.

### F2 · MEDIUM — Pricing is implemented three times
`apps/dash-customer/src/lib/orderPricing.ts` (client display), `supabase/functions/_shared/orderPricing.ts` (line-item subtotal + tax), and `supabase/functions/delivery/pricingResolver.ts` (v2 fees, splits, tiers). `merchantRestaurantRoutes.ts` also calls `calculateOrderPricing` for in-store POS.

The v2 path is genuinely server-authoritative and the client merely displays the quote — that is the right design. The legacy path is where the three implementations diverge (§A2, §A3, §A4). Retiring legacy entirely would collapse this class of bug rather than patch it.

### F3 · MEDIUM — Payment status is the shared contract and it is under-specified
The merchant app decides whether to cook and the courier app decides whether to collect, both keyed off order/payment status. Given §B1, a self-confirmed order looks identical to a genuinely paid one to both downstream apps. Whatever fix lands for `/wipay/complete` should be validated from the merchant and courier side too, not just the customer's.

---

## G. Security & platform

### G1 · Not a finding — security headers are the strongest in the repo
Full CSP, `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `X-Frame-Options: DENY`, `nosniff`, `strict-origin-when-cross-origin`, and `Permissions-Policy: camera=(), microphone=(), geolocation=(self)` ([`vercel.json:8-38`](apps/dash-customer/vercel.json#L8)).

`connect-src` is properly enumerated (Supabase, PayPal live+sandbox, WiPay, Google Maps, Sentry) rather than wildcarded. `frame-ancestors 'none'` and `base-uri 'self'` are both set.

The one weakness is `script-src 'unsafe-inline' 'unsafe-eval'`, which is a Vite default rather than a decision — it does mean the CSP provides limited XSS protection, which matters more given §F1.

### G2 · Not a finding — the mock gate is correct
```ts
/**
 * Demo/mock data is allowed only in local/dev builds, or when explicitly opted in.
 * Production must never silently substitute MOCK_* content on API failure.
 */
```
([`mocksGate.ts`](apps/dash-customer/src/lib/mocksGate.ts)) — checks `VITE_ALLOW_MOCKS` then `env.DEV`, wrapped in try/catch returning `false`. Every `MOCK_*` fallback I traced is gated behind `allowMocks()`. This is exactly the discipline the fleet app's station and plaza fixtures lacked.

### G3 · MEDIUM — Sandbox and live PayPal are selected by one env var
`Deno.env.get("PAYPAL_ENV") === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com"` appears in three functions. A missing or misspelled `PAYPAL_ENV` in production silently routes real orders to sandbox — payments appear to succeed, orders are marked paid, no money moves. Given the CSP already allowlists both hosts, nothing else would flag it. Fail closed instead: refuse to start if the value is not explicitly one of `live` / `sandbox`.

---

## H. Enhancements you are currently lacking

1. **Implement or withdraw `free_delivery`** (§A1). Withdrawing it from `DealsPage` is a one-line stopgap while the pricing branch is written.
2. **Store the FX rate on the payment intent** (§B2), and fetch it rather than hardcoding. Refunds and merchant payouts currently have no basis for reversing a PayPal charge correctly.
3. **A payment reconciliation job** — compare `payments.transactions` against provider-reported settlements daily. This is the systemic answer to §B1 and §B6 that no amount of callback hardening replaces.
4. **Cart-level minimum-order gating** (§A6) using the `minOrder` already loaded at browse time.
5. **Retire the legacy pricing model** (§F2). Every client/server pricing divergence in §A lives on that branch.
6. **Sync notification preferences to the server** (§D2) so send decisions can honour them.
7. **A "payment pending confirmation" state** for §B6, instead of a 45-second failure verdict the client cannot substantiate.

---

## I. Suggested order of work

**Fix first — money:**

| # | Item | § | Why now |
|---|---|---|---|
| 1 | Make `/wipay/complete` verify with WiPay, or restrict it to reading an already-webhook-completed intent | B1 | Customers can mark their own orders paid |
| 2 | Pin the WiPay callback contract (stop alias-guessing) so §1 can be closed safely | B7 | Prerequisite for a correct fix |
| 3 | Fetch and persist the JMD→USD rate; assert captured amount matches intent | B2 | Every PayPal order is mispriced by an unknown margin |
| 4 | Validate the redirect in `resumeOrderPayment`; rename `clientSecret` | B4 | Unvalidated navigation, dangerously misleading name |
| 5 | Single `APP_URL` fallback, pointing at `roamrush.app` | B5 | Unset env silently breaks PayPal returns |
| 6 | Fail closed on `PAYPAL_ENV` | G3 | Misconfiguration routes live orders to sandbox undetected |

**Then — the cart tells the truth:**

| # | Item | § |
|---|---|---|
| 7 | Implement `free_delivery`, or remove it from `DealsPage` | A1 |
| 8 | Carry `gctRegistered` and the merchant's real tax rate to the client on the legacy path | A2 |
| 9 | Surface pricing-API failure instead of falling back to hardcoded constants | A3 |
| 10 | Gate minimum order at the cart | A6 |
| 11 | Replace `parseDeliveryFeeLabel` with a numeric field | A5 |

**Then — polish and platform:**

| # | Item | § |
|---|---|---|
| 12 | "Pending confirmation" state for PayPal timeouts | B6 |
| 13 | `retry` > 0 on the tracking query | E2 |
| 14 | Design-system confirmation dialog for cancellation | C3 |
| 15 | Reflect `DASH_ALLOW_CASH_ORDERS` in the payment picker | C2 |
| 16 | Decide deliberately whether `/admin` belongs on the customer origin | F1 |
| 17 | Sync notification preferences | D2 |
| 18 | Review delivery-zone cache TTL against ops needs | D3 |
| 19 | Retire the legacy pricing model | F2 |

---

*Audit only — no files were modified. Every finding is anchored to a specific file and line. Item 1 is the one I would treat as urgent: it is exploitable today by any signed-in customer with browser devtools, it requires no special knowledge, and the downstream merchant and courier apps have no way to tell a self-confirmed order from a paid one.*
