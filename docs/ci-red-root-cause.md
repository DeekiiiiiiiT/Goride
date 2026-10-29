# GitHub Actions red — root cause and fix

Checked 2026-10-29 against `main` @ `9ded0485`, using the logs of every failed run since 14:45 UTC.

## Status per workflow (latest run)

| Workflow | Result | Why |
|---|---|---|
| CI | ❌ | Finding 1 — one Playwright test |
| Parts SQL checks | ❌ | Finding 2 — Docker image pull blocked |
| Deploy Supabase Edge Function | ✅ | — |
| Deploy recon-worker | ✅ | — |
| Test Supabase Functions | ✅ | — |
| Vercel path deploy | ✅ | — |
| Dominion places checks | ✅ | — |

Deploys go out fine. Only those two checks are red, and each one fails for a single reason.

---

## Finding 1 — CI: `plug-home.spec.ts` reads sessionStorage before any page is open

**Failing step:** `test-and-build` → `Plug journeys` (runs #647, #648, #649, #650, every time).

**Error:**

```
e2e/plug-home.spec.ts:35:5 › each place kind submits its details
Error: page.evaluate: SecurityError: Failed to read the 'sessionStorage' property from 'Window':
Access is denied for this document.
    at e2e/plug-home.spec.ts:48:16
```

15 of the 16 tests pass. This is the only failure.

**Root cause:** commit `d33c43f7` replaced the category-grid click with
`page.evaluate(() => sessionStorage.setItem('plug-place-kind', k))` at the top of the loop.
On the first loop pass the test hasn't called `page.goto` yet (`standIn()` in `beforeEach` only installs routes and init scripts). So the page is still `about:blank`, and Chromium refuses storage access on `about:blank` with exactly this SecurityError. `sessionStorage` is per-origin, so it only exists once the app's origin (`http://127.0.0.1:3016`) is loaded.

(Run #647, before `d33c43f7`, failed in the same test for a different reason: `#categoryGrid [data-kind="fuel"]` was not found. `d33c43f7` fixed that and introduced this error.)

**Fix:** open the app's origin at the top of every loop pass, before writing sessionStorage. Then do a real hash change to `/#/map/pin` so the pin screen mounts fresh and reads the kind.

In [e2e/plug-home.spec.ts](../e2e/plug-home.spec.ts), lines 46–51, change:

```ts
  for (const [label, kind] of KINDS) {
    // ChooseType remounts under auth/fill; do not click the grid. Set kind the same way a card tap does.
    await page.evaluate((k) => {
      sessionStorage.setItem('plug-place-kind', k);
    }, kind);
    await page.goto('/#/map/pin', { waitUntil: 'domcontentloaded' });
```

to:

```ts
  for (const [label, kind] of KINDS) {
    // ChooseType remounts under auth/fill; do not click the grid. Set kind the same way a card tap does.
    // sessionStorage only exists once the app origin is loaded (about:blank throws SecurityError).
    await page.goto('/#/explore', { waitUntil: 'domcontentloaded' });
    await page.evaluate((k) => {
      sessionStorage.setItem('plug-place-kind', k);
    }, kind);
    await page.goto('/#/map/pin', { waitUntil: 'domcontentloaded' });
```

Leave the rest of the test as it is. The app reads the key in `apps/plug/src/shell/bind.tsx:111,158` and `apps/plug/src/shell/actions.ts:619`, so setting it this way matches a real card tap.

**Verify locally:**

```
npx playwright test -c playwright.plug.config.ts e2e/plug-home.spec.ts
```

Expect 0 failed. Then run the full config (`npx playwright test -c playwright.plug.config.ts`) and expect 15 passed, 1 skipped.

---

## Finding 2 — Parts SQL checks: Amazon ECR "Data limit exceeded" on the Storage image

**Failing step:** `parts-sql` → `Start the database` (run #17, and #16 the same way).

**Error, repeated through all 5 retries:**

```
Retrying after 4s: public.ecr.aws/supabase/storage-api:v1.54.1
failed to pull docker image: Error response from daemon: error from registry: Data limit exceeded
supabase db start failed after retries
```

**Root cause:** the Supabase CLI (v2.99.0 here) pulls every image from `public.ecr.aws` by default. Anonymous pulls from Amazon's public registry are capped, and GitHub's shared runner IPs are over the cap. Commit `6aceebf7` worked around it for two images only: the `Prefetch images for db start` step pre-pulls `postgres` and `realtime` (falling back to Docker Hub). But `supabase db start` also starts **storage-api**, because `[storage] enabled = true` in `supabase/config.toml`. That image isn't prefetched, so the CLI pulls it from ECR and gets blocked. Retrying can't help: the limit doesn't reset within a run.

**Fix:** make the CLI pull **all** of its images from Docker Hub. The CLI reads `SUPABASE_INTERNAL_IMAGE_REGISTRY` (confirmed in the CLI binary). Set it once at job level so every step uses it: db start, db reset, and any image added later.

In [.github/workflows/parts-sql-checks.yml](../.github/workflows/parts-sql-checks.yml), add an `env` block to the job:

```yaml
jobs:
  parts-sql:
    runs-on: ubuntu-latest
    env:
      # ECR public anonymous pulls hit "Data limit exceeded" on shared runners. Pull every CLI image from Docker Hub.
      SUPABASE_INTERNAL_IMAGE_REGISTRY: docker.io
    steps:
```

Then remove the two steps `Cache Supabase images` and `Prefetch images for db start` (lines 44–80) and the comment above them. With the registry switched they do nothing useful. Worse, their cached tars are tagged `public.ecr.aws/...`, and the CLI no longer looks for that name.

Change nothing else in the file. The `Start the database` retry loop stays.

**Verify:** push, then open the `Parts SQL checks` run. In `Start the database`, every pulled image name should start with `supabase/` (Docker Hub), with no `public.ecr.aws`, and the step should pass.

**What comes next:** because of this pull failure, the SQL check files haven't run since 18:02 UTC. The last real SQL errors were:
- `price_engine_checks.sql:134` "a later duplicate should be kept at weight 0, got review weight 0" (run #14)
- `price_engine_checks.sql:359` "function places.station_analytics(...) does not exist" (run #15)

Both were addressed in `03238b3d` (the check now allows `review` for zero-weight duplicates, and the `station_analytics` call was removed). Once the image fix lands, the four check files run again. If one fails, the log shows the file and line number. Fix that error on its own; it isn't related to this finding.

---

## Order

1. Finding 1 and Finding 2 in one commit. They touch separate files.
2. Push to `main`.
3. Confirm `CI` and `Parts SQL checks` are both green on that commit.
