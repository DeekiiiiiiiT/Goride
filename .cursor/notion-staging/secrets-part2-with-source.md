Source: docs/secrets-audit.md (synced 2026-07-18)

# Secrets Audit (continued)


## ⚠️ HIGH PRIORITY (Runtime crashes & forgery-adjacent)

### 4. The audit-report "signature" is built from the database master key, with a broken construction

`apps/fleet/src/supabase/functions/server/index.tsx:1476-1481`:
```ts
// In a real env we'd use a private key, here we use service role hash as a HMAC-like signature
const encoder = new TextEncoder();
const data = encoder.encode(canonical + Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
const hashBuffer = await crypto.subtle.digest("SHA-256", data);
```
Two problems stacked on each other: (1) `SHA256(secret + data)` is a known-broken MAC construction (length-extension attacks) — real HMAC is needed, not string concatenation into a hash. (2) It reuses the **service role key** — the single most powerful credential in the entire Supabase project — as if it were a disposable signing secret. If that key ever needs rotating for an unrelated reason, every past "signed" report silently invalidates, and vice versa. This route lives in the same unauthenticated block flagged in the previous audit (`/audit/sign-report`, mounted alongside the auth-less `audit_controller.tsx`), so right now anyone can call it and get a "signature" over data they made up.

**Fix:** use a dedicated secret with real HMAC, not the DB key:
```diff
- const data = encoder.encode(canonical + Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
- const hashBuffer = await crypto.subtle.digest("SHA-256", data);
- const signature = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2,'0')).join('');
+ const key = await crypto.subtle.importKey(
+   "raw", encoder.encode(Deno.env.get("AUDIT_HMAC_SECRET")!),
+   { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
+ );
+ const sigBuf = await crypto.subtle.sign("HMAC", key, encoder.encode(canonical));
+ const signature = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2,'0')).join('');
```
(`AUDIT_HMAC_SECRET` was already recommended for `audit_logic.ts` in the previous audit — this is the same fix, applied to the second place that needed it.)

### 5. Only 3 of 9 apps have a `.env.example` — nobody (including future-you) knows what env vars each app needs

`apps/driver`, `apps/rides-passenger`, and `apps/dash-merchant` have one. `apps/fleet`, `apps/admin`, `apps/dash-courier`, `apps/dash-customer`, `apps/enterprise`, and `apps/haul` do not, and neither does the repo root for the Supabase Edge Function secrets (see command list below).

### 6. `SUPABASE_PAT` (Management API token) is the most dangerous secret in this repo — treat it accordingly

`apps/fleet/src/supabase/functions/server/api_command_center.tsx:319` reads `Deno.env.get("SUPABASE_PAT")`. This isn't a per-project key — it's a **Supabase account-level Personal Access Token**, which can create/delete/reconfigure *any* project in the Supabase organization, not just this one. It's correctly kept server-side and not referenced anywhere in frontend code (confirmed by grep) — good. But because the blast radius of this one leaking is "someone can take down the whole Supabase org," it deserves: (a) its own restricted-scope token if Supabase's dashboard allows scoping, (b) a calendar reminder to rotate it periodically, (c) never logging it, ever (see finding 8 below — confirmed clean today, but this is the one to keep watching).

### 7. No null-checks around a couple of Deno.env.get() calls that could crash a live payment path

Most of the codebase (`env_boot.ts`, `service_client.ts`) does this correctly with explicit checks. `payments/index.ts:117-118` — `WIPAY_ACCOUNT_NUMBER`/`WIPAY_API_KEY` **are** checked (good). `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET` (line 256-257) throw a raw `Error` rather than returning a clean 503, and the current caller happens to catch it — but it's fragile: a future refactor that drops the try/catch turns this into a raw stack trace shown to a customer instead of a clean error. Recommend the same explicit pattern already used elsewhere:
```diff
  function getPayPalAccessToken() {
    const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
    const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
-   if (!clientId || !clientSecret) { throw new Error("PayPal not configured"); }
+   if (!clientId || !clientSecret) {
+     throw new Error("PayPal not configured — set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET via `supabase secrets set`");
+   }
```

---

## 🧹 CLEANUP & BEST PRACTICES

### Create `.env.example` for every app that's missing one

**`apps/fleet/.env.example`** (new file):
```dotenv
# Fleet app — copy to .env.local for local dev. Never put real secrets in a tracked file.
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# Feature flags (safe defaults shown)
VITE_FLEET_USE_FUEL_BRAIN=1
VITE_FLEET_USE_TOLL_BRAIN=1
VITE_DUAL_WRITE_ENABLED=0

# Do NOT add VITE_TOLL_BRAIN_INTERNAL_SECRET or VITE_FUEL_BRAIN_INTERNAL_SECRET here —
# those must never be VITE_-prefixed. They belong server-side only (see supabase/.env.example).
```

**`supabase/.env.example`** (new file — documents every Edge Function secret found in this audit):
```dotenv
# Local Edge Function secrets. Copy to supabase/.env.local (already gitignored).
# Production values are set via `supabase secrets set` — see the command list below.

# Auto-provided by Supabase at runtime — do not set manually in production:
# SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL

# AI providers
GEMINI_API_KEY=
OPENAI_API_KEY=
OPENAI_ADMIN_API_KEY=

# Maps
GOOGLE_MAPS_API_KEY=
GOOGLE_MAPS_API_KEY_MERCHANT=
GOOGLE_MAPS_SERVER_KEY_RIDES=

# Payments
STRIPE_SECRET_KEY=
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
WIPAY_ACCOUNT_NUMBER=
WIPAY_API_KEY=
WIPAY_CALLBACK_SECRET=

# SMS
DIGICEL_SMS_API_KEY=
DIGICEL_SMS_USER=
DIGICEL_SMS_PASS=
FLOW_SMS_TOKEN=
SEND_SMS_HOOK_SECRET=

# Email
SMTP_USER=
SMTP_PASS=

# Push
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=

# Internal service-to-service secrets (never VITE_/NEXT_PUBLIC_-prefix these)
TOLL_BRAIN_INTERNAL_SECRET=
FUEL_BRAIN_INTERNAL_SECRET=
MATCHING_INTERNAL_SECRET=
AUDIT_HMAC_SECRET=
ROAM_RIDES_QUOTE_SECRET=
STATION_DEVICE_SECRET=
STATION_SHIFT_SECRET=
FLEET_CRON_SECRET=
RIDES_CRON_SECRET=
MATCHING_CRON_SECRET=

# Supabase Management API (org-level — extremely sensitive, see finding 6)
SUPABASE_PAT=
SUPABASE_PROJECT_REF=
```

### Split environments — dev/staging/prod aren't separated today

One `.env.local` per app and one Supabase project's secrets — no `.env.staging` / `.env.production` split, and no visible distinction enforced between WiPay/PayPal sandbox vs. live credentials (`WIPAY_ENV`/`PAYPAL_ENV` exist as *flags*, but nothing stops both from silently pointing at `live` during local testing). Recommended layout:
```
apps/<app>/.env.local        # local machine only, gitignored, real dev values
apps/<app>/.env.example      # committed, no real values, documents what's needed
```
and set `WIPAY_ENV=sandbox` / `PAYPAL_ENV=sandbox` explicitly in local Supabase secrets so a local test run can never hit live payment rails by accident.

### No hardcoded live/test key patterns found — genuinely clean here

Pattern-matched for `sk_live_`, `sk_test_`, `whsec_`, `ghp_`, `AIza...`, `SG.`, and PEM private-key headers across every `.ts`/`.tsx` file in both `apps/` and `supabase/` — zero hits outside `node_modules`. Every real secret in this codebase is read via `Deno.env.get(...)`, never typed in literally.

### No secret-bearing `console.log`s found

Checked every `console.log`/`error`/`warn`/`debug` near a variable named `key`/`secret`/`token`/`password` in both function trees — the only near-misses are things like `console.error("Failed to lazy delete cache key ${key}", e)`, where `key` is a KV cache key (a data record id), not a credential. Nothing prints an actual API key or password value anywhere found.

---

## 📋 RUN THESE TERMINAL COMMANDS

Set every real Edge Function secret found in this audit in production (replace `<value>` with the real key from each provider's dashboard — never paste real values into chat/docs/tickets):

```bash
# AI providers
supabase secrets set GEMINI_API_KEY=<value>
supabase secrets set OPENAI_API_KEY=<value>
supabase secrets set OPENAI_ADMIN_API_KEY=<value>

# Maps
supabase secrets set GOOGLE_MAPS_API_KEY=<value>
supabase secrets set GOOGLE_MAPS_API_KEY_MERCHANT=<value>
supabase secrets set GOOGLE_MAPS_SERVER_KEY_RIDES=<value>

# Payments
supabase secrets set STRIPE_SECRET_KEY=<value>
supabase secrets set PAYPAL_CLIENT_ID=<value>
supabase secrets set PAYPAL_CLIENT_SECRET=<value>
supabase secrets set WIPAY_ACCOUNT_NUMBER=<value>
supabase secrets set WIPAY_API_KEY=<value>
supabase secrets set WIPAY_CALLBACK_SECRET=<value>   # new — see finding 2

# SMS
supabase secrets set DIGICEL_SMS_API_KEY=<value>
supabase secrets set DIGICEL_SMS_USER=<value>
supabase secrets set DIGICEL_SMS_PASS=<value>
supabase secrets set FLOW_SMS_TOKEN=<value>
supabase secrets set SEND_SMS_HOOK_SECRET=<value>

# Email
supabase secrets set SMTP_USER=<value>
supabase secrets set SMTP_PASS=<value>

# Push
supabase secrets set VAPID_PUBLIC_KEY=<value>
supabase secrets set VAPID_PRIVATE_KEY=<value>

# Internal service-to-service secrets — after rotating (see finding 1)
supabase secrets set TOLL_BRAIN_INTERNAL_SECRET=<new-rotated-value>
supabase secrets set FUEL_BRAIN_INTERNAL_SECRET=<new-rotated-value>
supabase secrets set MATCHING_INTERNAL_SECRET=<value>
supabase secrets set AUDIT_HMAC_SECRET=<value>        # new — see finding 4
supabase secrets set ROAM_RIDES_QUOTE_SECRET=<value>
supabase secrets set STATION_DEVICE_SECRET=<value>
supabase secrets set STATION_SHIFT_SECRET=<value>
supabase secrets set FLEET_CRON_SECRET=<value>
supabase secrets set RIDES_CRON_SECRET=<value>
supabase secrets set MATCHING_CRON_SECRET=<value>

# Supabase Management API — handle with extreme care, see finding 6
supabase secrets set SUPABASE_PAT=<value>
supabase secrets set SUPABASE_PROJECT_REF=<value>

# Verify what's actually set in production (does NOT print values, just names):
supabase secrets list
```

You do **not** need to manually set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, or `SUPABASE_SERVICE_ROLE_KEY` — Supabase auto-injects those into every deployed Edge Function.

```bash
# Fix finding 3 — stop tracking the .env.local files already in git
git rm --cached apps/fleet/.env.local apps/driver/.env.local apps/rides-passenger/.env.local
git add .gitignore
git commit -m "stop tracking .env.local files; add .env ignore rules"
```

---

## ✅ What was done right

1. **Nothing is hardcoded.** Across roughly 90 files that read a secret in this codebase, every single one goes through `Deno.env.get(...)` — zero literal API keys typed into source. A lot of vibe-coded projects fail this on day one; this one doesn't.
2. **`env_boot.ts` and `service_client.ts`** already show the correct pattern in use — explicit `REQUIRED_SECRETS` list checked at startup, clear thrown errors naming exactly what's missing instead of a mystery crash three requests later. The fixes above are mostly "do this in the two or three places that don't yet," not "learn a new pattern."
3. **`send-sms/index.ts`** does real webhook signature verification (Standard Webhooks, checked before trusting any payload), and the anon-key fallback in `packages/api-client/src/supabaseInfo.ts` is correctly the *anon* key (safe to expose) with clear comments explaining why — that file is a genuinely good example of "public key, documented as such" for the rest of the codebase to follow.

---

*Compiled via direct scanning (grep/glob/git) plus manual read-through of every flagged file and its surrounding context — not a sampled or generated report. Every finding above cites a specific file and line.*

---

## Remediation status (Waves 0–4)

*Last updated: 2026-07-18*

| Finding | Severity | Status | Wave | Notes |
|---------|----------|--------|------|-------|
| VITE_ brain internal secrets in browser bundle | Critical | **Fixed** | Wave 0 | Local classify only in Fleet clients; rotate `TOLL_BRAIN_INTERNAL_SECRET` / `FUEL_BRAIN_INTERNAL_SECRET` in Supabase |
| WiPay webhook unsigned | Critical | **Fixed** | Wave 1 | Requires `WIPAY_CALLBACK_SECRET` (header or `?secret=`); appended on intent `response_url` |
| Refunds / payouts any-Authorization | Critical | **Fixed** | Wave 1 | `requireProductAdmin(c, "dash")` |
| `.env.local` tracked + no root `.gitignore` | Critical | **Fixed** | Wave 2 | Root ignore rules; `git rm --cached` three files |
| Audit sign-report uses service-role SHA256 | High | **Fixed** | Wave 3 | HMAC + `AUDIT_HMAC_SECRET` + `requireAuth` + `data.export` |
| Missing `.env.example` files | High | **Fixed** | Wave 3 | Fleet, supabase, admin, enterprise, haul, dash-customer, dash-courier |
| PayPal missing-config error | High | **Fixed** | Wave 3 | Clear secrets-set message |
| `SUPABASE_PAT` blast radius | High | **Documented** | — | Rotate on calendar; never log |

**Ops follow-ups:** set/rotate brain secrets + `WIPAY_CALLBACK_SECRET`; redeploy `toll-brain`, `fuel-brain`, `payments`, `make-server-37f42386`, and Fleet UI.
