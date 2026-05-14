# `send-sms` — Supabase Auth Send SMS Hook

This Edge Function implements the **[Send SMS Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook)** so Supabase Auth does **not** need Twilio (or any built-in dashboard SMS provider) to deliver phone OTPs. Your app still calls `signInWithOtp`; GoTrue generates the OTP and **POSTs** a signed payload here; this function must send the SMS and return **HTTP 200** on success.

## Dashboard setup (hosted Supabase)

1. **Deploy** this function (CI deploys `send-sms`, or run locally):
   `supabase functions deploy send-sms --project-ref <YOUR_PROJECT_REF>`
2. **Secrets** (Project Settings → Edge Functions → Secrets), set at minimum:
   - `SEND_SMS_HOOK_SECRET` — signing secret from the hook configuration (see below). Strip is handled in code for `v1,whsec_` / `whsec_` prefixes if present.
3. **Authentication → Hooks → Send SMS**
   - Enable the hook.
   - URL: `https://<project-ref>.supabase.co/functions/v1/send-sms`
   - Generate/copy the **hook signing secret** into `SEND_SMS_HOOK_SECRET` for the function.
4. **Authentication → Providers → Phone**
   - Turn **Phone** on and save.
   - If the UI still requires Twilio fields while the hook is enabled, that is a known dashboard bug; see workaround: [supabase/supabase#45198](https://github.com/supabase/supabase/issues/45198) (temporarily disable hook → save with dummy Twilio → re-enable hook), or use a Twilio trial for one save.

## Optional secrets (carrier integration)

When Digicel / Flow provide HTTP API details, set:

| Variable | Used when |
|----------|-----------|
| `DIGICEL_PREFIXES` | Comma-separated **national** digit prefixes after `+1` (e.g. `87632,87633`). First match routes to Digicel. |
| `FLOW_PREFIXES` | Reserved for future stricter routing; numbering is **best-effort** until carriers supply official blocks. Today, any NANP number that does **not** match `DIGICEL_PREFIXES` is routed to **Flow** (default). |
| `DIGICEL_SMS_URL` | Digicel HTTP endpoint |
| `DIGICEL_SMS_USER` / `DIGICEL_SMS_PASS` | HTTP Basic auth for Digicel |
| `FLOW_SMS_URL` | Flow HTTP endpoint |
| `FLOW_SMS_TOKEN` | Bearer token for Flow |

Default route: **Flow** if the number does not match any `DIGICEL_PREFIXES` entry (or the list is empty).

**Payload today:** JSON `POST` body `{ "to": "<E.164>", "message": "<text>", "text": "<same>" }` — adjust `index.ts` when your carrier spec differs.

## Message template

- `SMS_MESSAGE_TEMPLATE` — optional. Default: `Your code is {{ .Code }}` (GoTrue-style placeholder replaced with the OTP).

## Dev-only stub (never production)

- `SMS_HOOK_STUB_LOG_OK=1` — logs `phone` and `otp` to function logs and returns **200** without calling carriers. **Users will not receive SMS**; use only to verify hook wiring.

## Latency

Keep this function **fast** (single outbound HTTP). Auth hooks are latency-sensitive; avoid heavy work or long queues unless you return success only after send completes.

## Local `supabase/config.toml`

For `supabase start`, you can wire `[auth.hook.send_sms]` to this function URL per [Auth Hooks](https://supabase.com/docs/guides/auth/auth-hooks) (optional; most teams test on hosted).
