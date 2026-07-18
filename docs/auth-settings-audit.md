# Auth Settings Audit — Roam / GoRide

*Audited 2026-07-18 against `supabase/config.toml` (local template) + production project `csfllzzastacofsvcdsc`.*

## Summary

Auth is enabled; anonymous sign-ins are off. Several local-template defaults are weaker than production should run. Dashboard settings are the source of truth for hosted Auth — align them with the recommendations below.

## Findings

| Item | Severity | Status | Notes |
|------|----------|--------|-------|
| `enable_confirmations = false` (email) | High | **Ops: set in Dashboard** | Require email confirmation before sign-in in production |
| `minimum_password_length = 6` | High | **Ops: raise to 8+** | Prefer 8+ with `letters_digits` requirements |
| `password_requirements = ""` | Medium | **Ops: set** | Use at least `letters_digits` |
| `site_url` / redirect allowlist local-only in config.toml | High | **Ops: Dashboard** | Production must list roamfleet.co, roamdominion.co, localhost ports used in vibe, etc. |
| `otp_expiry = 3600` (1 hour) | Medium | **Review** | Prefer 10–15 minutes for SMS/email OTP |
| `max_frequency = "1s"` on email | Medium | **Tighten** | Prefer ≥60s to reduce abuse |
| `enable_refresh_token_rotation = true` | OK | Done | Keep |
| `enable_anonymous_sign_ins = false` | OK | Done | Keep |
| MFA TOTP available in config | Info | Optional | Enable for platform_owner accounts when ready |

## Remediation

1. In Supabase Dashboard → Authentication → Providers / Settings: enable email confirmations; set password length ≥ 8; set redirect URLs to live + local app origins.
2. Keep JWT expiry at 3600 unless product needs longer sessions.
3. Do not enable anonymous sign-ins.

## Verification

- Unconfirmed email cannot obtain a session (after Dashboard change).
- Weak passwords rejected on signup.
- OAuth/magic-link redirects only succeed for allowlisted origins.
