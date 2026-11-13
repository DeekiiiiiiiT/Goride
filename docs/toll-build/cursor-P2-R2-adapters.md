# Cursor prompt — Toll Phase 2, P2-R2: the file readers (adapters)

Read `docs/toll-architecture.md` → Part F → "Phase 2" (facts and decisions 1–8) and B9, and `docs/toll-build/cursor-P2-R1-import-core-tests.md` (the normalized row shapes `import_batch` accepts). **No migrations, no screens, no routes in this round.** Do not commit, branch or push.

## What to build: pure parsers in `packages/toll-core/src/v2/adapters/`
Each adapter is a **pure function**: file text (plus a small lookup context) in → `{ kind, rows, problems }` out. `rows` are exactly the normalized shapes `import_batch` takes; `problems` are row-level messages (row number, reason) for rows that can't be used. No I/O, no Supabase, no dates from the machine's clock. Export them from `packages/toll-core/package.json` like the other v2 modules.

Shared helpers (`adapters/common.ts`):
- **Money:** `toMinor(text)` parses a decimal string to integer cents with **string arithmetic**, never `parseFloat * 100` (`"1,917.18"` → 191718, `"370"` → 37000, `"-10.5"` → −1050, and currency symbols and spaces are ignored).
- **Dates:** Jamaica time (UTC−5, no daylight saving). Port today's `parseCsvDateTime` rules from `apps/fleet/src/components/vehicles/BulkImportTollTransactionsModal.tsx:63–133` (DD/MM/YYYY first) and return ISO strings with `-05:00`. Uber's timestamps: port what `apps/fleet/src/utils/csvHelpers.ts` does (~1559–1585).
- **CSV:** use the CSV parser the repo already uses (Papa). Headers are matched case- and space-insensitively.

Adapters:
1. **`tagStatement(text, ctx)`** → kind `tag_statement`, plus top-up rows found in the same file returned **separately** as `{ topups: rows }` (positive amounts are top-ups).
   - Columns as today (`parseTagStatementRow`, modal ~420–432): tag id, plaza name, plaza lane id, date & time, amount.
   - `ctx`: `{ tagToVehicle: Record<tagNumber, vehicleId>, vehicleToDriver: Record<vehicleId, driverId>, plazaIdByName: Record<name, plazaId> }`. Tag numbers are compared without leading zeros, as today.
   - **`source_ref`** = `tag:<tag>|<plaza>|<lane>|<yyyy-mm-ddThh:mm>|<amount_minor>#<n>`. `n` counts identical keys **within this file**, in file order, starting at 1 (decision 2). The same file always gives the same refs.
   - `amount_minor` positive; `time_precision 'minute'`; a vehicle not found → a problem row, not a data row.
2. **`topupProvider(text, ctx)`** (TransJam) → kind `topups`. Columns as today (modal ~631–650): tag id / product account number, transaction id, date & time, topup amount, top up type, payment / top up status. Failed rows → problems. `source_ref` = the transaction id; `provider 'transjam'`; `account_ref` = the account number.
3. **`uber({ payments, tripActivity }, ctx)`** → kind `uber`, from the two Uber CSVs, porting today's logic in `csvHelpers.ts`:
   - **trip rows:** `platform_trip_id` = Trip UUID; `driver_id` from Driver UUID through `ctx.driverByUberUuid`, falling back to the UUID; `vehicle_id` from the licence plate through `ctx.vehicleByPlate`; `request_at` and `dropoff_at` from trip_activity; `time_precision 'minute'`; **`payment_method 'cash'` when the trip's summed `Paid to you:Trip balance:Payouts:Cash Collected` ≠ 0, else `'card'`** (decision 3); `toll_payback_minor` = the summed `Paid to you:Trip balance:Refunds:Toll` for that trip.
   - **adjustment rows:** every `payments_transaction` row whose Description starts with `Support Adjustment:` and whose Toll column ≠ 0 → `{row_type:'adjustment', reference:<support case UUID>, driver_id, paid_on, amount_minor}`. **Keep the sign** (decision 5); never `Math.abs`.
4. **`indrive(text, ctx)`** → kind `indrive`: trip rows from the generic trip CSV (`apps/fleet/src/services/import-validator.ts:318–395`). `toll_payback_minor` from `tollCharges` if present; `payment_method` from the column if present, else `'unknown'`.
5. **`driverCashReceipt(submission)`** → kind `driver_cash`, one row: `source_ref` = `receipt:<receiptNumber>` if present, else `submission:<submissionId>`; `occurred_at`, `amount_minor`, `plaza_id`, `vehicle_id`, `driver_id`, `evidence: {receipt_url, plaza, lane, collector, vehicleClass}`; `evidence_status 'unverified'`. **No receipt URL → a problem, not a row** (decision 7).

## Tests (vitest, next to each adapter)
- **Golden files:** build fixtures in `packages/toll-core/src/v2/adapters/__fixtures__/` from the real sample exports in `apps/fleet/src/uber-csv-analysis/*.md` (copy the CSV rows out of the markdown). Add small hand-made tag-statement and TransJam CSVs that include:
  - two identical crossings (→ `#1`, `#2`);
  - a top-up line;
  - a failed top-up;
  - a vehicle that can't be found;
  - DD/MM/YYYY dates.
- **Assert exact rows** (snapshot or deep-equal), including:
  - the Uber cash trips from the sample (the three with toll 370 / 645 / 370): `payment_method 'cash'`, `toll_payback_minor` 37000 / 64500 / 37000;
  - the support adjustments with their sign;
  - a synthetic negative adjustment that stays negative.
- `toMinor` edge cases; Jamaica date edges (DD/MM vs MM/DD ambiguity follows today's rule; midnight; Sunday 23:59).
- **Re-running an adapter on the same text gives identical output** (no clock, no randomness).

## Run (once)
`pnpm --filter @roam/toll-core test`. If something fails, report it and stop.

## Report
Give clickable links to the files you changed and the results of what you ran. Don't paste file contents — I'll read the files. Say which sample files you used. Before you finish, stop any app, dev server or test server you started (ports 3000, 3001, 4173, 5173, 5180–5183).
