# Rush Settings: what's left

**Rev 8 · 2026-10-16** · M1 fixed on `delivery` v869. Remaining: frontend ship + ops fill-ins.

**Verified live:**
- `delivery` v869 — static import for menu price-review routes (bundler includes the module).
- `/app-config` for customer, courier and partner returns no `betaUserIds` and no rollout key.
- Vehicle allow-list triggers applied.
- 2-step login gate in the shared admin check.
- Tests pass.

---

## 1. Must fix

| # | Problem | Status |
|---|---|---|
| M1 | Menu price-review API not in production (dynamic import omitted by bundler) | **Fixed** — top-level static import + redeploy v869 |

---

## 2. Ship (remaining)

- [ ] **Commit** the paths in `scripts/rush-settings-stage-paths.txt` (in progress / awaiting push for Vercel).
- [ ] **Redeploy the frontends:** dash-customer (admin), dash-courier, dash-merchant, rush-command.
- [ ] **Fill support phone and WhatsApp** in Settings → Contacts (needs your numbers — currently blank; email only).
- [ ] **Heads-up:** `dash_admin` / `courier_admin` without 2-step must enrol MFA before using admin APIs. Platform owner already has it.
- [ ] **Env backfill** if legacy Rush env vars are still set: `scripts/backfill-rush-settings.mjs`, then retire.

## 3. After deploying

- [ ] A partner's 30% price rise appears in the admin's price-review list and can be approved.
- [ ] Delivery PIN, wait pay, courier age check and pickup work end to end.
- [ ] An admin without 2-step login is sent to enrol, then gets in.
- [ ] Maintenance on for one app blocks that app only.
- [ ] A high-risk change needs a second admin.
