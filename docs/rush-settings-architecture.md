# Rush Settings: what's left

**Rev 9 · 2026-10-16** · Ship closeout done except support phone/WhatsApp numbers (you) and post-deploy smoke (§3).

**Verified live:**
- `delivery` v869 — static import for menu price-review routes (bundler includes the module).
- `/app-config` for customer, courier and partner returns no `betaUserIds` and no rollout key.
- Vehicle allow-list triggers applied.
- 2-step login gate in the shared admin check.
- Tests pass.
- Commit `a1dfc48d` pushed; path-deploy fired production for customer, courier, partner, command (all Ready).
- Env backfill applied for the four legacy Rush secrets still present (cash COD on, auto-dispute off, max auto refund J$4000, H3 matching off). Secrets can be removed after a quiet week — see `docs/rush-settings-env-retirement.md`.

---

## 1. Must fix

| # | Problem | Status |
|---|---|---|
| M1 | Menu price-review API not in production (dynamic import omitted by bundler) | **Fixed** — top-level static import + redeploy v869 |

---

## 2. Ship

- [x] **Commit** the paths in `scripts/rush-settings-stage-paths.txt` (`a1dfc48d`).
- [x] **Redeploy the frontends:** dash-customer, dash-courier, dash-merchant, rush-command (path-deploy 2026-10-16).
- [ ] **Fill support phone and WhatsApp** in Settings → Contacts (blocked — no numbers in repo/Notion; email only until you paste them).
- [x] **Heads-up:** `dash_admin` / `courier_admin` without 2-step must enrol MFA before using admin APIs. Platform owner already has it.
- [x] **Env backfill** for mapped legacy secrets still on the project (`DASH_ALLOW_CASH_ORDERS`, `RUSH_AUTO_DISPUTE_RESOLUTION`, `DASH_AUTO_DISPUTE_MAX_REFUND_JMD`, `RUSH_H3_DISPATCH_ENABLED`).

## 3. After deploying (smoke — your check)

- [ ] A partner's 30% price rise appears in the admin's price-review list and can be approved.
- [ ] Delivery PIN, wait pay, courier age check and pickup work end to end.
- [ ] An admin without 2-step login is sent to enrol, then gets in.
- [ ] Maintenance on for one app blocks that app only.
- [ ] A high-risk change needs a second admin.
