# Fuel Brain

Platform brain for **fuel purpose classification** — fully automated residual Personal stack.

## Stack (locked)

1. **Ride Share** — platform trip km (On Trip + Enroute + Open + Unavailable)
2. **Company Ops** — admin mileage adjustments (Company Misc / Maintenance)
3. **Deadhead** — estimate from odo gaps first (time-gap fallback), floored to Available × industry fallback %, capped to Available km
4. **Personal** — residual: `Available − Deadhead` (includes unlabeled miles; no driver input)
5. **Misc** — cash only: `Spend − (all four category $)` — not a km type

Math:

- `Available_Km = max(0, TotalOdo − RideShare − CompanyOps)`
- `Deadhead = min(Available_Km, max(DeadheadEstimate, Available_Km × industryFallbackPct%))` (default 35%)
- `Personal = Available_Km − Deadhead`

## Surfaces

| Surface | Role |
|---|---|
| Dominion `FuelBrainPage` | Rule control panel: locked RS/CO/Personal/Misc cards; editable Deadhead tunables |
| Fleet recon | Consumes brain Personal/Deadhead km when `FLEET_USE_FUEL_BRAIN` is on (default) |
| Edge `fuel-brain` | Classify twin + policy GET/PUT |
| Fleet `fuel_logic` | Odo-first deadhead hints wired to `brain_policies` |

## Flags

| Flag | Default | Meaning |
|---|---|---|
| `FUEL_BRAIN_ENABLED` | off until Edge deploy | Edge accepts classify traffic |
| `VITE_FLEET_USE_FUEL_BRAIN` | **on** unless `=0` | Fleet recon uses brain category km |

No driver toggles. No Unknown purpose bucket. No driving-session evidence product.

## Schema

- `fuel.brain_policies` — deadhead heuristics (odo-first, gap minutes, peak hours, fallback %, etc.)
- `fuel.product_profiles` — org allow-list for consumer (optional)
- Sessions / unknown_reviews tables removed in `20260713140000_fuel_brain_residual_upgrade.sql`

## Classify

`method: fuel_brain_v2` — mirrored in:

- `apps/fleet/src/utils/fuelBrainClassify.ts`
- `supabase/functions/fuel-brain/classify.ts`

Money layer unchanged: receipts + scenario coverage %. Brain only supplies category km.

**Fixed_Amount Ride Share:** if the active fuel scenario uses `coverageType: Fixed_Amount` on Ride Share, that dollar cap is applied to the Ride Share bucket only. Leftover spend still lands in **Misc** (the residual pool) — Misc is not a km type and is not classified by Fuel Brain.

## Cycle engine (separate from Fuel Brain)

Tank cycles, close policy, and alert tiers live in the **cycle engine** — not Fuel Brain.

| Module | Role |
|---|---|
| `fuel_cycle_stamp.ts` | Single server stamper; lane split; frequency dedupe |
| `fuel_cycle_close_policy.ts` | Rideshare default close; legacy `cumulative_98` per org |
| `fuel_cycle_snapshot.ts` | Authoritative cycle snapshots for UI + finalize |
| `fuel_jaa_match.ts` | Server JAA apply-matches + re-stamp |

See `apps/fleet/src/docs/fuel-brain-spine.md` for lane diagram and tier definitions.

## Personal Allowance (Option 2) — Fleet money layer

Separate from Fuel Brain. Brain still measures **Personal km**. When Personal Allowance is enabled on the effective Earnings Policy (or legacy Tier Settings fallback):

- Drivers **earn free Personal km** from weekly quota % bands (**Gross Revenue** from the same ledger source as Earnings History → weekly quota).
- **Company absorbs earned Personal fuel 100%**.
- Driver pays **overage** Personal km at period fuel $/km.
- Default **off** (`enabled: false`). Does not change `commitWeeklyStatement` plumbing — only how Personal contributes to company vs driver share before finalize.
- **Config source (2026-07):** Driver Operations → **Earnings Policy Configuration** (Rules template + Schedule). A **version** freezes rules only; each **driver** has their own start Monday (and optional end) on that version. Empty policy library falls back to stored prefs only until a Default policy exists. Resolution: covering driver assignment → Default policy (latest version by createdAt) → prefs fallback.
- Settings + Stitch refs: `apps/fleet/design/stitch-earnings-policy/` (plus prior `apps/fleet/design/stitch/personal-allowance/`)

