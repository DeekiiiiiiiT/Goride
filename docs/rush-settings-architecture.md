# Rush Settings: cutover status

**Rev 3 · 2026-10-15** · Rev 2 listed open gaps; those are implemented in-repo. This page tracks cutover + deferred product work.

**Built and checked (in repo):**
- Registry: 84 settings, edge mirror + drift test, `hidden` for deferred keys.
- Security: two-person rule (no client `approved_by`), write validation, `editRoles` on server + admin UI, import respects risk/locked.
- `/app-config`: auth-derived user, no `betaUserIds`, private cache when signed in.
- S2: 9 settings wired; 6 hidden until features exist.
- S3: reader test requires a file that mentions the key (or template).
- Small: Locked = SQL-only in admin; hex coverage stays env-only with comment; `enterpriseReaders.test.ts` in CI.

**Deferred (hidden from admin until product builds the feature):**
- `courier.delivery.pin_required_over_jmd`
- `courier.delivery.wait_grace_minutes`
- `courier.signup.min_age`
- `customer.ordering.pickup`
- `partner.menu.price_change_review_pct`
- `platform.staff_security`

**Locked SQL-only (visible, not editable in admin):**
- `platform.locale`
- `enterprise.settings.export_import`

**Commit isolation:** stage only paths in `scripts/rush-settings-stage-paths.txt` — never bundle fleet/driver/parts/Dominion.

---

## 1. Production cutover (still required)

- **Database: done.** Migrations applied; legacy stores retired.
- **Server: not done.** Deploy `delivery` + `payments` (and full edge redeploy if `_shared/rushSettings` ships).
- **Website: not done.** Deploy **dash-customer first** (Settings at `roamrush.app/admin`), then courier, partner, command.
- **Env backfill first:** `node scripts/backfill-rush-settings.mjs` (dry-run with `--dry`), then remove retired env vars per `docs/rush-settings-env-retirement.md`.
- **Do not use** the old Settings page until the new admin is live.

### Deploy order
1. Env backfill (production)
2. Edge: `delivery` then `payments` (path deploy may redeploy all when `_shared` changes)
3. Frontends: dash-customer → dash-courier → dash-merchant → rush-command
4. Smoke Section 4, then retire env overrides

---

## 2. After deploying (verification gate)

- [ ] Maintenance on for one app shows the maintenance screen in that app only, and the API refuses that app's calls.
- [ ] A high-risk change can't be applied by one person, by any route.
- [ ] Every setting shown in the admin changes something you can see.
- [ ] `/app-config` shows no other user's data / no `betaUserIds`.
- [ ] Turning off cash on delivery in Settings stops cash orders, with no env variable set.
- [ ] Platform hours and a closed holiday refuse orders with the configured message.
- [ ] A customer can request account deletion from the app.
