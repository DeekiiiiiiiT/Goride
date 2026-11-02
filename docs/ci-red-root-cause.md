# GitHub Actions red: what's left

Rev 19 **closed** 2026-11-02 (`8b3055bd`, `dc1316bb`, `1c2b62f3`). Rev 22 tracks remaining CI/Parts SQL infra below.

## Rev 19 — done

| Item | Fix |
|---|---|
| DK7 plate grep | Empty fallback + conditional chip in `DkUpdateReportedItemSheet.tsx` |
| Admin typecheck (baseline 20) | `description` on categories, `PendingResearchJobPanel` typing, removed dead Import tab |
| Production parts stock | `20261102131551_adjust_org_part_stock_inventory_engine.sql` (live) |
| `parts_rev2_checks.sql` | Stock via `inv_opening_balance`; audit trigger `20261102132407` for line org id |

**Verified on GitHub:** gap audit + stitch + admin typecheck (19 errors) on run [41451559820](https://github.com/DeekiiiiiiiT/Goride/actions/runs/41451559820). `parts_rev2_checks.sql` passed on dispatch run [41457166752](https://github.com/DeekiiiiiiiT/Goride/actions/runs/41457166752) (later step `parts_import_checks.sql` still fails — not a Rev 19 item).

---

Rev 22 — re-checked 2026-11-02 on `1c2b62f3` (latest `main`). Open items only. This is the permanent fix; it replaces the 2.99 pin in `1c2b62f3`.

| Workflow | On `1c2b62f3` |
|---|---|
| CI | **red** — Start Supabase: `supabase_vector_Goride container is not ready: unhealthy` |
| Parts SQL checks | not run since `dc1316bb` (red then) |
| Deploy Supabase Edge Function | green |
| Vercel path deploy | green |

The CI step "Start Supabase and bootstrap inventory schema" was added on 1 Nov (`0cc37efa`) and **has never passed in GitHub**. So the 31 steps after it have never run there either.

## Root causes

1. **The Supabase CLI version lives in 5 places, and 2 of them change on their own.** `ci.yml` used `version: latest`; three workflows hard-code `2.99.0`; local `npx supabase …` (29 `package.json` scripts and 13 files in `scripts/`) grabs whatever is newest. CLI v3.0.0 shipped 2026-11-02, so these split, and `config.toml` can't satisfy both.
2. **Local analytics is switched on** (`[analytics] enabled = true`). This makes the CLI start the `vector` log container, which fails its health check on GitHub runners. It happens on 2.99 **and** v3, and it's why CI is still red after the pin.
3. **Nothing checks for either problem**, so they come back silently.

## CI-1 — One CLI version, set in one place (Critical)

**Fix:**
1. Root `package.json` → `devDependencies` gets `"supabase": "3.0.0"` (exact, no `^`). Run `pnpm install`. This is the only place the version is written. Local `npx supabase` / `pnpm exec supabase` now use it too.
2. New `.github/actions/setup-supabase-cli/action.yml` (composite action):
   - reads the version with `node -p "require('./package.json').devDependencies.supabase"`
   - downloads `https://github.com/supabase/cli/releases/download/v$V/supabase_${V}_linux_amd64.tar.gz` (confirmed to exist for 3.0.0)
   - unpacks it into `/usr/local/bin`
   - runs `supabase --version`
3. Use that action in all four workflows. Delete the old install blocks:
   - `ci.yml` 268–271 (`supabase/setup-cli@v1`)
   - `parts-sql-checks.yml` 46–55
   - `deploy-supabase-edge.yml` 43–52
   - `verify-migrations-replay.yml` 25–35
4. New `scripts/assert-supabase-cli-pin.mjs`, run as an early step in `ci.yml`. It fails if:
   - the `package.json` version isn't exact `x.y.z`
   - any workflow contains `supabase/setup-cli`, `SUPABASE_CLI_VERSION:`, or `version: latest` for Supabase
   - any workflow runs `supabase` without the composite action earlier in the same job
   - any file in `package.json`, `scripts/` or `.github/` uses `--linked`, `--db-url`, or `--project-ref` on a command other than `supabase link`
   - any `--local` flag is used on a `supabase` command

**Upgrading later** = change the one number in `package.json`, push, and let CI run. Nothing else is edited.

## CI-2 — Make the repo v3-correct (Critical, same commit as CI-1)

Each item below was checked against the real v3.0.0 binary. The new `config.toml` loads with zero errors and zero warnings.

**`supabase/config.toml`**
- Line 99: `[inbucket]` → `[local_smtp]` (v3 refuses `[inbucket]`).
- Line 413, `[analytics]`: `enabled = true` → `enabled = false`. This stops `vector` and `logflare` from starting anywhere, which is root cause 2.
- Line 421: delete `orioledb_version = ""` from `[experimental]` (removed in v3).
- Line 240, `[auth.email]`: `enable_signup = true` → `enabled = true`.
- Line 278, `[auth.sms]`: `enable_signup = false` → `enabled = false`.
- These two `enabled` lines keep today's behaviour exactly. The old key is removed in v4.

**Deploys need `--remote=<ref> --yes`.** Without `--yes`, v3 refuses every hosted change in CI (`HostedMutationConsentRequiredError`) and defaults to "No" in a terminal.
- `deploy-supabase-edge.yml` line 132: `--project-ref "$SUPABASE_PROJECT_REF"` → `--remote="$SUPABASE_PROJECT_REF" --yes`.
- `package.json` lines 101–108, 112–126, 165–170 (29 deploy scripts): `--project-ref csfllzzastacofsvcdsc` → `--remote=csfllzzastacofsvcdsc --yes`.
- `scripts/f5-retire-shim.mjs` lines 151–152: these match those `package.json` strings, so change them the same way.

**Read-only scripts: `--project-ref` / `--linked` → `--remote=<ref>`.**
- Files:
  - `cleanup-sync-restatement-drafts.ps1`, `heal-week-close-sync.ps1`
  - `provision-fleet-test-driver.mjs`, `provision-indep-and-passenger-test.mjs`, `provision-play-review-accounts.mjs`
  - `provision-rush-courier-test.mjs`, `provision-rush-customer-test.mjs`, `provision-rush-partner-test.mjs`
  - `smoke/_shared.mjs`, `smoke-e2e-delivery.mjs`
- `db query` against production must also get `--read-only`, or v3 asks for consent and fails when unattended:
  - `check-fuel-stop-location-health.mjs` line 159: `db query --linked` → `db query --remote --read-only`. Its `supabase link --project-ref` on line 139 stays; it's still valid in v3.
  - `watch-kenny-oct19.ps1` line 7: `--linked` → `--remote --read-only`.

**Local-only commands: drop `--local`** (v3 targets local by default and warns on `--local`).
- `ci.yml` line 276: `supabase db reset --local` → `supabase db reset`.
- `verify-migrations-replay.yml` lines 50–54: `supabase db query --local -f …` → `supabase db query -f …`.

**Fewer image pulls in CI.** Earlier runs hit `error from registry: Rate exceeded`.
- `ci.yml` line 275: `supabase start -x imgproxy,logflare` → `supabase start -x gotrue,realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor`.
- This keeps only Postgres, Kong and PostgREST, which are what `bootstrap-inventory-local-db.mjs` and `inventory_integration.test.ts` use. The names come from v3's `start --help`.

**Done when:** on one commit, all of these pass:
- CI, including Start Supabase and all 31 steps after it
- Parts SQL checks, including `parts_rev2_checks.sql` line 228, which proves `20261102132407_maintenance_audit_log_line_org.sql`
- Deploy Supabase Edge Function, which redeploys all 28 functions because `config.toml` changed (expected)

Locally, `pnpm deploy:fleet-core` must deploy without a prompt.

## Already checked — no change needed

- `project_id = "Goride"` is set, so v3 keeps the same local container names.
- `.env.local` files aren't committed and hold no `SUPABASE_*` values, so v3's "env beats config" rule changes nothing.
- No `import_map.json` inside function folders, and no `linkedin` or `slack` auth providers.

## Rules

- Never use `latest` for a tool in CI. The version lives in one file, and a check enforces it.
- A config change must load in every workflow that reads the file. Test it with the pinned CLI before pushing.
- When a table becomes a view, find every write against it in the same change.
- Never put real plate or record numbers in screen code.
- Audit triggers on child tables must not assume parent columns exist on `NEW`.
