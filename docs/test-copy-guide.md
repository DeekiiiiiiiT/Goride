# Test copy (local only)

This is a **separate** Roam stack on your machine: local database at `http://127.0.0.1:54321` and four browser apps on ports **5180–5183**. It does **not** use your normal `.env.local` files and **nothing you do here touches your real production data**.

- **Start:** `pnpm testcopy` (from the repo root)
- **Stop:** `pnpm testcopy:stop`

**Rule:** test copy = ports **5180–5183**. Your normal apps = **3000** (RoamFleet), **3001** / **5173** (Dominion), **3002** (Driver), **3016** (Plug). They never share ports.

After a fresh database, run `npx supabase db reset` (local only), then `pnpm testcopy` again.

---

## Dominion (admin)

- **Address:** http://127.0.0.1:5180
- **Test owner:** `mm-p01-owner@local.test` / `MmP01Local2026!`
  - **Authenticator (add once in your app):** setup key `JBSWY3DPEHPK3PXP` — use the 6-digit code at login.
- **Test analyst (look-only):** `mm-p01-analyst@local.test` / `MmP01Local2026!` (same authenticator key)
- **Test data:** maintenance master fixture org, platform flags including `maintenance_master_governance`.
- **Won’t start:** run `pnpm testcopy:stop`, then `pnpm testcopy`. If port 5180 is busy, close whatever is using it (not your normal Dominion on 3001/5173).

---

## RoamFleet

- **Address:** http://127.0.0.1:5181
- **Test fleet owner:** `mm-f01-fleet@local.test` / `MmF01Local2026!`
- **Test fleet viewer (look-only):** `mm-f01-viewer@local.test` / `MmF01Local2026!`
- **Test data:** fleet **MM F01** with vehicles **5179KZ** and **1505LM**, maintenance master alerts/schedules.
- **Won’t start:** same as Dominion; use 5181 only.

---

## Roam Driver

- **Address:** http://127.0.0.1:5182
- **Test driver:** `testcopy-driver@local.test` / `TestCopyDriver2026!`
- **Test data:** linked to the MM F01 test fleet, assigned to plate **5179KZ**, onboarding complete.
- **Won’t start:** same as above; use 5182 only.

---

## Roam Plug

- **Address:** http://127.0.0.1:5183
- **Test customer:** `testcopy-customer@local.test` / `TestCopyPlug2026!`
- **Test data:** explorer (Plug) customer account on the local stack.
- **Won’t start:** same as above; use 5183 only.

---

## New apps

When another app gets a test copy, add a section here with: test URL (next free 518x port), logins, test data, and troubleshooting — same format as above.
