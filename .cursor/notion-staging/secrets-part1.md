# Secrets & Environment Variable Audit — Roam / Fleet / Dash

Zero-tolerance audit of environment variables, hardcoded secrets, and secret-management practices across the frontend (Vite/React apps), Edge Functions (Deno), `.env*` files, and git history.

**Scope scanned:** every `.env*` file in the repo, every `.ts`/`.tsx`/`.js`/`.jsx` file for hardcoded key patterns (`sk_live_`, `sk_test_`, `whsec_`, `ghp_`, `AIza...`, `SG.`, PEM private keys), every `Deno.env.get()` call across both Supabase function trees, every `import.meta.env`/`process.env` usage in frontend code, git tracking status of every `.env*` file, and webhook signature verification on every webhook-receiving endpoint.

---

## 🚨 CRITICAL (Active data breach or account takeover)

### 1. Two "internal-only" server secrets are shipped straight to the browser

`apps/fleet/src/services/tollBrainClient.ts:17` and `apps/fleet/src/services/fuelBrainClient.ts:18`:

```ts
function internalSecret(): string {
  return import.meta.env.VITE_TOLL_BRAIN_INTERNAL_SECRET || '';
}
```

The `VITE_` prefix means Vite **bakes this value into the JS bundle every browser downloads.** These aren't throwaway values — they're the exact secret that `supabase/functions/toll-brain/index.ts:36` and `supabase/functions/fuel-brain/index.ts:41` use to gate their "internal only" classify endpoints:

```ts
function requireInternalAuth(c) {
  const secret = Deno.env.get("TOLL_BRAIN_INTERNAL_SECRET");
  return c.req.header("X-Toll-Brain-Internal-Secret") === secret;
}
```

Anyone who opens dev tools on the live Fleet app, or just downloads the JS bundle, can read this secret out of it and call `toll-brain`/`fuel-brain`'s internal endpoints directly — the exact thing "internal auth" was supposed to prevent. The `fuelBrainClient.ts` code even has a comment admitting *"Browser cannot hold service secret"* right above the line that puts it in the browser anyway.

**Fix:** delete the browser→edge-function call path entirely. The frontend already computes a local classification (`classifyTollMatch`/`classifyFuelWeek`) — keep that as the only client-side path, and do the shadow-compare call (if still wanted) from the Fleet **server** (which already holds `TOLL_BRAIN_INTERNAL_SECRET` correctly, non-prefixed), not from the browser.

```diff
- function internalSecret(): string {
-   return import.meta.env.VITE_TOLL_BRAIN_INTERNAL_SECRET || '';
- }
- ...
- const secret = internalSecret();
- const base = brainBaseUrl();
- if (secret && base && (FLEET_USE_TOLL_BRAIN || TOLL_BRAIN_SHADOW_COMPARE)) {
-   const res = await fetch(`${base}/functions/v1/toll-brain/v1/internal/classify-match`, {
-     headers: { 'X-Toll-Brain-Internal-Secret': secret },
-     ...
+ // Call your own Fleet server route instead (it holds the secret server-side),
+ // e.g. POST /toll-brain-proxy/classify-match — the server attaches the header, not the browser.
```

Then remove `VITE_TOLL_BRAIN_INTERNAL_SECRET` / `VITE_FUEL_BRAIN_INTERNAL_SECRET` from every `.env*` file and **rotate both secrets** in the Supabase dashboard — they must be treated as already leaked, because Vite has been inlining them into every production build.

### 2. WiPay payment webhook has zero signature verification — this is a real "fake a payment" hole

`supabase/functions/payments/index.ts:167-249`:

```ts
app.post("/webhooks/wipay", async (c) => {
  const body = await c.req.json();
  const { transaction_id, status, order_id, data } = body;
  const { data: intent } = await serviceSupabase.schema("payments").from("payment_intents")
    .select("*").eq("provider_intent_id", transaction_id).single();
  const isSuccess = status === "success";
  await serviceSupabase.schema("payments").from("payment_intents").update({
    status: isSuccess ? "completed" : "failed", ...
  }).eq("id", intent.id);
  if (isSuccess) { /* writes a completed transaction + ledger entry + marks the order paid */ }
```

There is no secret, no signature, nothing verifying this request actually came from WiPay. **Anyone who knows (or brute-forces) a `transaction_id` can POST `{ "transaction_id": "...", "status": "success" }` directly to this URL and the system will mark a real order as paid, write a ledger entry, and unlock the order — with no money ever changing hands.** This is the exact "attacker fakes a webhook to unlock premium features / get free stuff" scenario, except here it's free food/delivery orders.

WiPay's `gateway_live` API supports a response hash meant to be verified (built from account credentials + response fields) — right now `createWiPayIntent` doesn't check anything on the way back in. Minimum fix until real WiPay hash verification is wired up: require a shared secret in a header, generated when the intent is created, checked here:

```diff
  app.post("/webhooks/wipay", async (c) => {
+   // WiPay doesn't sign webhooks by default — verify via the response_hash they return,
+   // or at minimum require a shared secret:
+   const providedSecret = c.req.header("X-WiPay-Callback-Secret");
+   if (providedSecret !== Deno.env.get("WIPAY_CALLBACK_SECRET")) {
+     return c.json({ error: "Unauthorized" }, 401);
+   }
    const body = await c.req.json();
```
Then append `?secret=<value>` (or the header) to the `response_url` sent to WiPay in `createWiPayIntent`, and set `WIPAY_CALLBACK_SECRET` via `supabase secrets set`. This is a stopgap — WiPay's actual response-hash verification (if available) is stronger than a shared secret and should replace this.

**Adjacent, same file:** `/payments/refunds`, `/payments/payouts/merchant`, and `/payments/payouts/courier` (lines 440, 514, 568) only check that *an* `Authorization` header is present — not that the caller is staff/admin. Any logged-in customer can currently call `POST /payments/refunds` with someone else's `transactionId` and it will create a refund + ledger entry unconditionally. Not a "secret" issue per se, but the same "the request just wasn't distrusted enough" pattern as the webhook above, in the same file, and it's money — worth fixing in the same pass.

### 3. Three `.env.local` files are tracked in git — and `.gitignore` doesn't stop the next one

```
apps/fleet/.env.local           ← tracked in git
apps/driver/.env.local          ← tracked in git
apps/rides-passenger/.env.local ← tracked in git
```

All three were read in full for this audit — right now they only contain feature flags (`VITE_CASH_SETTLEMENT=1`, etc.), **no live secrets today**. But that's luck, not safety: `.env.local` is the file every tool (Vite, and the existing `.env.example` comments: *"copy to .env.local for local dev"*) says to put real secrets in. The moment a real key gets dropped into one of these — which the filename actively invites — it's committed straight to GitHub, forever, in history, even if deleted later.

The root cause: the root `.gitignore` has **zero `.env` entries at all**. Only `supabase/.gitignore` correctly excludes `.env.local`.

**Fix — add to `.gitignore` (root):**
```gitignore
# Environment files — never commit real secrets
.env
.env.local
.env.*.local
.env.production
.env.staging
!.env.example
```

**Then untrack the three files already committed** (doesn't delete them locally, just stops git from tracking them going forward):
```bash
git rm --cached apps/fleet/.env.local apps/driver/.env.local apps/rides-passenger/.env.local
git commit -m "stop tracking .env.local files"
```
Since the current contents are just flags with no real secrets, no rotation is needed for this one — but this fix needs to land before the next real key gets typed into one of these files.

---
