# Roam Dash - Delivery Edge Function

Backend service for the Roam Dash food delivery product (merchants, menus, orders, courier assignment, admin verification).

Mounted at `/delivery` and deployed via the standard Supabase Edge Functions workflow.

---

## Admin: Merchant verification

All admin endpoints live under `/delivery/admin/merchants/*` and require the caller's auth token to have `app_metadata.role` or `user_metadata.role` set to one of:

- `platform_owner`
- `superadmin` (legacy alias)
- `platform_support`
- `admin` (legacy alias)

Endpoints:

- `GET /admin/merchants?status=pending&search=...&page=1&limit=50`
- `GET /admin/merchants/stats`
- `GET /admin/merchants/:id`
- `POST /admin/merchants/:id/status` body: `{ status, notes?, internal_notes? }`

Status transitions:

| From | Allowed To |
|---|---|
| `pending` | `in_review`, `approved`, `rejected` |
| `in_review` | `approved`, `rejected`, `docs_requested` |
| `docs_requested` | `in_review`, `approved`, `rejected` |
| `approved` | (none in Phase 1 - suspension comes in Phase 2) |
| `rejected` | `pending` (only via merchant resubmit at `POST /merchant/resubmit`) |

Every status change:

1. Updates `delivery.merchants.verification_status`
2. Inserts a row in `delivery.merchant_audit_log`
3. Inserts a row in `delivery.merchant_notifications` (in-app feed)
4. Sends an email via SMTP if configured (otherwise logs `[email] SMTP not configured` and continues)
5. Writes a row to the `kv_store_37f42386` audit log so the Super Admin Portal's Activity Log shows the action

---

## Email notifications (SMTP)

The function uses [denomailer](https://deno.land/x/denomailer) to send transactional emails when a merchant's verification status changes. It gracefully **no-ops** if any of the SMTP env vars are missing - the in-app notification is still inserted, so the feature works without email.

### Required env vars (set in Supabase Dashboard -> Edge Functions -> Secrets)

| Variable | Example | Notes |
|---|---|---|
| `SMTP_HOST` | `smtp.gmail.com` | Same as Supabase Auth SMTP host |
| `SMTP_PORT` | `465` | TLS port |
| `SMTP_USER` | `you@yourcompany.com` | SMTP username |
| `SMTP_PASS` | `app-password-or-api-key` | SMTP password / app password |
| `SMTP_FROM` | `Roam Dash <noreply@roamdash.co>` | From header. Defaults to `SMTP_USER` if unset |

### How to set them

1. Go to the Supabase Dashboard for your project
2. Open **Edge Functions** -> **Secrets**
3. Click **New Secret** and add each variable above
4. Re-deploy the `delivery` function (or wait for the next deploy) - secrets are picked up at cold-start

### Provider tips

- **Gmail**: Enable 2FA, generate an [App Password](https://myaccount.google.com/apppasswords), use that as `SMTP_PASS`. Port 465 + TLS.
- **Resend**: Use `smtp.resend.com:465`, username `resend`, password = your Resend API key.
- **SendGrid**: Use `smtp.sendgrid.net:465`, username `apikey`, password = your SendGrid API key.

### Reusing Supabase Auth's SMTP config

Supabase Auth has its own SMTP settings (Dashboard -> Project Settings -> Auth -> SMTP Settings). You can use the **same credentials** for both - just enter them in both places. The Auth SMTP config is for confirmation / password reset emails, while these `SMTP_*` env vars power transactional emails (merchant verification, future order receipts, etc).

### Email templates

Inline HTML + plain text templates live in `index.ts` (`renderStatusEmail`). They cover:

- `approved` - "You're live on Roam Dash" with a CTA link to `partner.roamdash.co`
- `rejected` - displays the rejection reason and offers an edit/resubmit CTA
- `docs_requested` - displays the admin's note and a CTA to the partner portal
- `in_review` - optional courtesy email letting the merchant know a reviewer started

Templates can be extracted to dedicated files in Phase 2.

---

## Merchant-side endpoints

For the dash-merchant frontend:

- `GET /merchant/profile` - the caller's own merchant row
- `GET /merchant/notifications` - latest 50 notifications for the caller's merchant
- `POST /merchant/notifications/:id/read` - mark one notification read
- `POST /merchant/resubmit` - move a rejected application back to `pending` (audit-logged)
