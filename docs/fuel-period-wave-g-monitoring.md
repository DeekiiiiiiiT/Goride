# Consumption Reconciliation — production cron go-live (Wave G)

**Do not start Wave G until F1–F3 are signed** in [fuel-period-auto-close-certification.md](./fuel-period-auto-close-certification.md).

## Pre-flight

1. Confirm workflow secrets exist in the GitHub repo (do not print values): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FLEET_CRON_SECRET` (or `CRON_SECRET`).
2. Confirm edge env has the same cron secret and latest functions (fuel-core twin + auto-close NEW-9).
3. Leave org dual-approval mode at **`skip`** for the first week of nights.
4. Confirm schedule: daily **14:00 UTC** ≈ 09:00 Jamaica ([`.github/workflows/fuel-period-auto-close-cron.yml`](../.github/workflows/fuel-period-auto-close-cron.yml)).

## Night 1 checklist

- [ ] Workflow run succeeded (HTTP 200).
- [ ] Digest `fuel-autoclose-digest:YYYY-MM-DD` present.
- [ ] Review `skipByReason` distribution (expect `skip_needs_approval` for high-value weeks).
- [ ] Spot-check **one** locked week: landing strip vs ledger vs evidence CSV.

## Nights 2–3

- [ ] Same four checks; no new orphan wallets / double settles.
- [ ] After **3 consecutive clean nights**, optionally enable `service_approve` only for orgs that explicitly want unattended high-value close.

## Abort

1. Disable the GitHub workflow (Actions → Fuel period auto-close cron → Disable workflow), **or** remove/rotate `FLEET_CRON_SECRET` so the job fails closed.
2. Auto-close reverts to badge-only; money still moves only via operator finalize.
3. Keep dual mode `skip` until root cause is fixed and F1–F3 re-signed.

## Sign-off

| Night | Date | Digest OK | Spot-check OK | Reviewer |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
