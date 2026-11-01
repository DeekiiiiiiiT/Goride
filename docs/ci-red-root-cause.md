# GitHub Actions red: what's left

Rev 5. Closed 2026-11-01. Rev 4’s two open items are fixed in repo; confirm green on the push that contains the closure commit (see **Verification** below).

Rev 4 baseline: checked 2026-11-01 against `main` @ `eedea059`. Rev 3 fixes (including production anon deny on all five functions) remain in place.

| # | Workflow → step | Status |
|---|---|---|
| 1 | Parts SQL checks → Start the database | **Done** — line-2 `0x97` → ASCII `-` in two migrations; UTF-8 guard in CI |
| 2 | Dominion places checks → Places register | **Done** — 60s first assertion; workflow paths include find/pending visual specs |

---

## What we fixed

### 1. Parts SQL (invalid UTF-8 in migrations)

- Replaced Windows-1252 byte `0x97` on line 2 with `-` in:
  - `supabase/migrations/20261101043006_fleet_maintenance_no_record_r04_recompute_view.sql`
  - `supabase/migrations/20261101043015_fleet_maintenance_no_record_r04_due_view.sql`
- Comment-only; both migrations were already applied in production.

### 2. Dominion e2e (cold Vite flake)

- `e2e/dominion-find-parts-visual.spec.ts`: first `Which car is it?` assertion uses `{ timeout: 60_000 }`.
- `.github/workflows/dominion-places-e2e.yml`: path filters now include `dominion-find-parts-visual` and `dominion-pending-parts-visual` specs so pushes to those files run the full Dominion Playwright project.

---

## Prevention

- `scripts/assert-migrations-utf8.mjs` + `pnpm check:migrations-utf8` — fails fast before Docker.
- Wired in **CI** and **Parts SQL checks** (first step after checkout).
- `.editorconfig` `[*.sql]` → `charset = utf-8`.

Local check (prints nothing when clean):

```
pnpm check:migrations-utf8
```

---

## Verification

After the closure commit lands on `main`:

1. **Parts SQL checks** — passes `Check migration files are UTF-8`, `Start the database`, `Apply migrations`, and all five `supabase/tests/*.sql` steps.
2. **Dominion places checks** — passes on first attempt (full suite via `playwright.dominion.config.ts`).
3. **CI** — includes the new UTF-8 migration step.

Record GitHub Actions run URLs for those workflows on the closure commit in this section when confirmed.

---

## History (Rev 4 — resolved)

<details>
<summary>Rev 4 problem statements</summary>

**Item 1:** Postgres `invalid byte sequence for encoding "UTF8": 0x97` on fresh replay.

**Item 2:** First find-parts visual test timed out at 5s waiting for cold Vite; flaky (e.g. run 41302719924 passed on attempt 2).

</details>
