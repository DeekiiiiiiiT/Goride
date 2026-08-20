# Roam Command cutover runbook

Roam **Partner** (`partner.roamrush.app`) is delivery-only. Roam **Command** (`command.roamrush.app`) is in-store ops (POS, inventory, staff stations, tablets).

## Access

- Command is **invite-only**: Roam admin enables `in_store_operations` on the merchant (Restaurant Management toggle in Rush admin).
- Partner shows **Open Roam Command** when the capability is on.

## Deploy

1. Deploy `delivery` edge function (pairing URLs + enroll guard).
2. Set env on delivery function: `COMMAND_PUBLIC_ORIGIN=https://command.roamrush.app`
3. Deploy Vercel projects:
   - `@roam/dash-merchant` → `partner.roamrush.app`
   - `@roam/rush-command` → `command.roamrush.app`
4. Set `VITE_COMMAND_ORIGIN=https://command.roamrush.app` on **both** apps.

## Tablet re-pair (required)

Tablet sessions are origin-scoped. After cutover:

1. Every store tablet must open `https://command.roamrush.app/tablet` (Partner `/tablet` redirects automatically).
2. Optional: regenerate pairing code in Command → Team → Devices to revoke old Partner-origin enrollments.

## Local dev

```bash
pnpm dev:merchant   # :5175 Partner
pnpm dev:command    # :5176 Command
```

## Native

- Partner: `co.roamenterprise.partner`
- Command: `app.roamrush.command` — `pnpm cap:command:sync`

### App store listing (Command)

- **App name:** Roam Command
- **Bundle / application ID:** `app.roamrush.command`
- **Positioning:** In-store operations for invited restaurants (POS, inventory, staff tablets)
- **Partner listing:** Delivery-only — link to Command for ops-capable merchants
- Ship web Command first; submit native builds after smoke pass on `command.roamrush.app`
