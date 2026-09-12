# STRICT_ORG_FILTER enablement checklist (F-25)

Do **not** flip `STRICT_ORG_FILTER` in production until these are green.

1. Count null-org and roam-default-org trips:

```sql
SELECT
  count(*) FILTER (WHERE organization_id IS NULL) AS null_org,
  count(*) FILTER (WHERE organization_id = 'roam-default-org') AS roam_default,
  count(*) AS total
FROM fleet.trips;
```

2. Backfill or assign real org IDs for null / roam-default rows that belong to a customer.
3. Confirm fuel_entries and toll_ledger the same way.
4. Enable flag for one pilot org first; verify Ledgers search returns expected counts.
5. Then enable fleet-wide.

### Null-org audit results (2026-09-11, GoRide prod — do not flip STRICT_ORG_FILTER yet)

| Table | null_org | roam_default | total |
|-------|----------|--------------|-------|
| fleet.trips | 0 | 0 | 3333 |
| fleet.fuel_entries | 0 | 0 | 482 |
| fleet.toll_ledger | 0 | 0 | 285 |

Checklist items 1–3 look clear for these counts; still run a pilot org (step 4) before any production flag flip.

### Gate 3 status (2026-09-11)

- Prod counts remain 0 null / 0 roam-default for trips, fuel, toll.
- Code path `filterByOrgStrict` + `FEATURE_FLAGS.STRICT_ORG_FILTER` stays **default off** with rollback via `setFeatureFlag(..., false)`.
- **Do not flip fleet-wide** in this remediation pass — enable for one pilot org first, verify Ledgers search counts, then expand.

---

## period_key week alignment (R-05) — CLOSED (Monday-confirmed)

**Status:** Closed 2026-09-11. Org financial weeks start **Monday**. No org-anchor migration.

`fleet.ledger_entries.period_key` is:

```sql
to_char(date_trunc('week', date::timestamp), 'IYYY-"W"IW')
```

- PostgreSQL `date_trunc('week', …)` uses **ISO weeks that start on Monday**.
- `IYYY` / `IW` are the ISO week-year / week number (same Monday boundary).
- Fleet UI / settlement helpers use date-fns `weekStartsOn: 1` (Monday) for fuel, toll, and financial period windows.

**Verdict:** ISO Monday matches `weekStartsOn: 1`. Keep `date_trunc('week')` — do **not** migrate to a per-org anchor.

### Monday date ↔ `IYYY-WIW` join hygiene

| Shape | Example | Use |
|-------|---------|-----|
| Read-model `period_key` | `2026-W37` | `fleet.ledger_entries`, dual-read / Block E joins |
| Client / settlement period id | Monday `yyyy-MM-dd` (e.g. `2026-09-07`) | UI period pickers, fuel/toll week windows |

Same week boundary; different string. When joining settlement rows to the read model:

1. Convert Monday date → ISO week: `to_char(date_trunc('week', monday::timestamp), 'IYYY-"W"IW')`.
2. Or convert `IYYY-WIW` → that week’s Monday before comparing to client period ids.
3. Never string-compare `2026-W37` to `2026-09-07` directly.

Re-open only if an org later anchors weeks on a non-Monday day — then derive `period_key` from that anchor instead of `date_trunc('week')`.
